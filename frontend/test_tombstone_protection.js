import { io } from 'socket.io-client';

const BACKEND_URL = 'http://localhost:3000';

console.log('Starting Tombstone Protection and Pinning Security Integration Test...');

async function signupUser(tag, name, avatar, password) {
  const res = await fetch(`${BACKEND_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag, name, avatar, password }),
  });
  if (res.ok || res.status === 409) {
    console.log(`Signup check for ${tag}: status ${res.status}`);
    return true;
  }
  throw new Error(`Signup failed for ${tag}: ${res.status}`);
}

async function run() {
  // 1. Setup users
  try {
    await signupUser('tomb_alice', 'Alice Tombstone', '🦊', 'password123');
    await signupUser('tomb_bob', 'Bob Tombstone', '🐻', 'password123');
  } catch (err) {
    console.error('Failed user registration setup:', err);
    process.exit(1);
  }

  // 2. Establish connections
  const alice = io(BACKEND_URL, { auth: { userTag: 'tomb_alice', username: 'Alice Tombstone' } });
  const bob = io(BACKEND_URL, { auth: { userTag: 'tomb_bob', username: 'Bob Tombstone' } });

  let aliceConnected = false;
  let bobConnected = false;

  const checkConnections = async () => {
    if (aliceConnected && bobConnected) {
      console.log('Sockets connected. Registering sockets...');
      alice.emit('register_socket', { user_tag: 'tomb_alice' });
      bob.emit('register_socket', { user_tag: 'tomb_bob' });
      
      // Wait for registration to process
      await new Promise(r => setTimeout(r, 2000));
      console.log('Sockets registered. Running tests...');
      runTests();
    }
  };

  alice.on('connect', () => { aliceConnected = true; checkConnections(); });
  bob.on('connect', () => { bobConnected = true; checkConnections(); });

  const runTests = async () => {
    try {
      const roomTag = `tomb_room_${Math.random().toString(36).substring(2, 7)}`;
      console.log(`\n--- Test 1: Create room #${roomTag} ---`);
      
      alice.emit('join_room', {
        room_tag: roomTag,
        user_id: 'tomb_alice',
        username: 'Alice Tombstone',
      });

      bob.emit('join_room', {
        room_tag: roomTag,
        user_id: 'tomb_bob',
        username: 'Bob Tombstone',
      });

      await new Promise(r => setTimeout(r, 2000));

      console.log(`\n--- Test 2: Alice sends a message with content and attachments ---`);
      const msgId = `msg_tomb_${Math.random().toString(36).substring(2, 7)}`;
      alice.emit('send_msg', {
        id: msgId,
        room_tag: roomTag,
        sender_id: 'tomb_alice',
        sender_name: 'Alice Tombstone',
        msg_type: 'file',
        content: 'This message has highly sensitive secrets and attachments.',
        file_url: 'http://localhost:3000/uploads/secret.txt',
        file_name: 'secret.txt',
        file_size: 1337,
      });

      await new Promise(r => setTimeout(r, 2000));

      console.log(`\n--- Test 3: Alice pins the message ---`);
      alice.emit('pin_message', {
        message_id: msgId,
        room_tag: roomTag,
        user_id: 'tomb_alice',
      });

      await new Promise(r => setTimeout(r, 2000));

      // Verify message is pinned
      let pinsRes = await fetch(`${BACKEND_URL}/api/rooms/${roomTag}/pins`);
      let pinsList = await pinsRes.json();
      console.log('Pins before deletion:', pinsList);
      if (pinsList.length !== 1 || pinsList[0].id !== msgId) {
        throw new Error('Message was not pinned correctly');
      }

      console.log(`\n--- Test 4: Alice deletes the message for everyone ---`);
      alice.emit('delete_message', {
        message_id: msgId,
        room_tag: roomTag,
        delete_type: 'for_everyone',
        user_tag: 'tomb_alice',
      });

      await new Promise(r => setTimeout(r, 2000));

      // Verify that the message is automatically unpinned (deleted messages cannot be pinned)
      pinsRes = await fetch(`${BACKEND_URL}/api/rooms/${roomTag}/pins`);
      pinsList = await pinsRes.json();
      console.log('Pins after deletion:', pinsList);
      if (pinsList.length !== 0) {
        throw new Error('Message was not unpinned upon deletion');
      }

      // Verify room history content is purged
      console.log(`\n--- Test 5: Verify the message content and file fields are purged in history ---`);
      let historyReceived = await new Promise((resolve) => {
        alice.once('room_history', (data) => {
          resolve(data);
        });
        alice.emit('join_room', {
          room_tag: roomTag,
          user_id: 'tomb_alice',
          username: 'Alice Tombstone',
        });
      });

      const deletedMsg = historyReceived.find(m => m.id === msgId);
      if (!deletedMsg) {
        throw new Error('Deleted message not found in history');
      }
      console.log('Deleted message in history:', deletedMsg);
      if (deletedMsg.content !== '') {
        throw new Error(`Content was not wiped! Found: "${deletedMsg.content}"`);
      }
      if (deletedMsg.file_url !== null && deletedMsg.file_url !== undefined && deletedMsg.file_url !== '') {
        throw new Error(`file_url was not wiped! Found: ${deletedMsg.file_url}`);
      }
      if (deletedMsg.file_name !== null && deletedMsg.file_name !== undefined && deletedMsg.file_name !== '') {
        throw new Error(`file_name was not wiped! Found: ${deletedMsg.file_name}`);
      }
      if (deletedMsg.file_size !== null && deletedMsg.file_size !== undefined) {
        throw new Error(`file_size was not wiped! Found: ${deletedMsg.file_size}`);
      }
      console.log('Purge verification PASSED! Fields are completely wiped in the DB.');

      console.log(`\n--- Test 6: Bob attempts to pin the deleted message (tombstone) ---`);
      let pinEventReceived = false;
      bob.on('message_pinned', (data) => {
        if (data.id === msgId) {
          pinEventReceived = true;
        }
      });

      bob.emit('pin_message', {
        message_id: msgId,
        room_tag: roomTag,
        user_id: 'tomb_bob',
      });

      await new Promise(r => setTimeout(r, 2000));

      if (pinEventReceived) {
        throw new Error('Security check failed: Socket broadcasted message_pinned for tombstone!');
      }

      // Check pins list via REST API again
      pinsRes = await fetch(`${BACKEND_URL}/api/rooms/${roomTag}/pins`);
      pinsList = await pinsRes.json();
      if (pinsList.length !== 0) {
        throw new Error('Security check failed: Tombstone is present in pins list!');
      }
      console.log('Security check PASSED: Bob cannot pin a deleted message (tombstone).');

      console.log('\n==============================================');
      console.log('ALL TOMBSTONE PROTECTION TESTS PASSED SUCCESSFULLY!');
      console.log('==============================================');
      alice.close();
      bob.close();
      process.exit(0);
    } catch (e) {
      console.error('Test execution failed:', e);
      alice.close();
      bob.close();
      process.exit(1);
    }
  };
}

run();
