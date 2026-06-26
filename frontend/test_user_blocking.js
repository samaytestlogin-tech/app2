import { io } from 'socket.io-client';

const BACKEND_URL = 'http://localhost:3000';

console.log('Starting User Blocking Integration Test...');

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
    await signupUser('block_alice', 'Alice Blocker', '🦊', 'password123');
    await signupUser('block_bob', 'Bob Blockee', '🐼', 'password123');
  } catch (err) {
    console.error('Failed user registration setup:', err);
    process.exit(1);
  }

  // 2. Establish connections
  const alice = io(BACKEND_URL, { auth: { userTag: 'block_alice', username: 'Alice Blocker' } });
  const bob = io(BACKEND_URL, { auth: { userTag: 'block_bob', username: 'Bob Blockee' } });

  let aliceConnected = false;
  let bobConnected = false;

  const checkConnections = async () => {
    if (aliceConnected && bobConnected) {
      console.log('Sockets connected. Registering sockets...');
      alice.emit('register_socket', { user_tag: 'block_alice' });
      bob.emit('register_socket', { user_tag: 'block_bob' });
      
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
      console.log('\n--- Test 1: Alice sends a DM to Bob (Should succeed) ---');
      const msgId1 = `msg_block_1_${Math.random().toString(36).substring(2, 7)}`;
      
      let bobReceivedMsg1Promise = new Promise((resolve) => {
        bob.once('new_direct_msg', (msg) => {
          console.log('Bob received direct message:', msg.content);
          resolve(msg);
        });
      });

      alice.emit('send_direct_msg', {
        id: msgId1,
        sender_tag: 'block_alice',
        receiver_tag: 'block_bob',
        msg_type: 'text',
        content: 'Hi Bob! This is message 1.',
      });

      const msg1 = await bobReceivedMsg1Promise;
      if (msg1.id !== msgId1) {
        throw new Error('Message 1 ID mismatch');
      }
      console.log('Test 1 Passed: Message delivered successfully.');

      console.log('\n--- Test 2: Alice blocks Bob ---');
      alice.emit('update_user_settings', {
        user_tag: 'block_alice',
        settings: JSON.stringify({
          blockedUsers: ['block_bob'],
        }),
      });

      await new Promise(r => setTimeout(r, 2000));

      console.log('\n--- Test 3: Query /api/users?request_by=block_bob to see if block_alice has blocked_by_them: true ---');
      let usersRes = await fetch(`${BACKEND_URL}/api/users?request_by=block_bob`);
      let usersList = await usersRes.json();
      let aliceInList = usersList.find(u => u.tag === 'block_alice');
      console.log('Alice in users list:', aliceInList);
      if (!aliceInList || aliceInList.blocked_by_them !== true) {
        throw new Error('block_alice should have blocked_by_them: true for block_bob');
      }
      console.log('Test 3 Passed: blocked_by_them flag is correct.');

      console.log('\n--- Test 4: Alice attempts to send message to Bob (Should fail) ---');
      const msgId2 = `msg_block_2_${Math.random().toString(36).substring(2, 7)}`;
      let bobReceivedMsg2 = false;
      
      const bobListener = (msg) => {
        if (msg.id === msgId2) {
          bobReceivedMsg2 = true;
        }
      };
      bob.on('new_direct_msg', bobListener);

      alice.emit('send_direct_msg', {
        id: msgId2,
        sender_tag: 'block_alice',
        receiver_tag: 'block_bob',
        msg_type: 'text',
        content: 'Hey Bob, this should not be delivered!',
      });

      await new Promise(r => setTimeout(r, 2000));
      bob.off('new_direct_msg', bobListener);

      if (bobReceivedMsg2) {
        throw new Error('Test 4 Failed: Message 2 was delivered despite blocking!');
      }
      console.log('Test 4 Passed: Message blocked successfully by backend guard.');

      console.log('\n--- Test 5: Bob attempts to send message to Alice (Should fail) ---');
      const msgId3 = `msg_block_3_${Math.random().toString(36).substring(2, 7)}`;
      let aliceReceivedMsg3 = false;

      const aliceListener = (msg) => {
        if (msg.id === msgId3) {
          aliceReceivedMsg3 = true;
        }
      };
      alice.on('new_direct_msg', aliceListener);

      bob.emit('send_direct_msg', {
        id: msgId3,
        sender_tag: 'block_bob',
        receiver_tag: 'block_alice',
        msg_type: 'text',
        content: 'Hi Alice, hope you see this?',
      });

      await new Promise(r => setTimeout(r, 2000));
      alice.off('new_direct_msg', aliceListener);

      if (aliceReceivedMsg3) {
        throw new Error('Test 5 Failed: Bob was able to message Alice despite being blocked!');
      }
      console.log('Test 5 Passed: Message from Bob was blocked successfully by backend guard.');

      console.log('\n--- Test 5a: Alice attempts to call Bob (Should fail with call_rejected reason: blocked) ---');
      let aliceCallRejected = false;
      let bobReceivedCall = false;

      alice.once('call_rejected', (data) => {
        console.log('Alice received call_rejected event:', data);
        if (data.reason === 'blocked') {
          aliceCallRejected = true;
        }
      });

      bob.once('incoming_call', () => {
        bobReceivedCall = true;
      });

      alice.emit('call_user', {
        receiver_tag: 'block_bob',
        caller_tag: 'block_alice',
        caller_name: 'Alice Blocker',
        caller_avatar: '🦊',
        offer: { type: 'offer', sdp: 'dummySDP' }
      });

      await new Promise(r => setTimeout(r, 2000));

      if (!aliceCallRejected) {
        throw new Error('Test 5a Failed: Alice call was not rejected with blocked status');
      }
      if (bobReceivedCall) {
        throw new Error('Test 5a Failed: Bob received incoming_call even though Alice has him blocked');
      }
      console.log('Test 5a Passed: Alice call blocked and rejected successfully.');

      console.log('\n--- Test 5b: Bob attempts to call Alice (Should fail with call_rejected reason: blocked) ---');
      let bobCallRejected = false;
      let aliceReceivedCall = false;

      bob.once('call_rejected', (data) => {
        console.log('Bob received call_rejected event:', data);
        if (data.reason === 'blocked') {
          bobCallRejected = true;
        }
      });

      alice.once('incoming_call', () => {
        aliceReceivedCall = true;
      });

      bob.emit('call_user', {
        receiver_tag: 'block_alice',
        caller_tag: 'block_bob',
        caller_name: 'Bob Blockee',
        caller_avatar: '🐼',
        offer: { type: 'offer', sdp: 'dummySDP' }
      });

      await new Promise(r => setTimeout(r, 2000));

      if (!bobCallRejected) {
        throw new Error('Test 5b Failed: Bob call was not rejected with blocked status');
      }
      if (aliceReceivedCall) {
        throw new Error('Test 5b Failed: Alice received incoming_call from blocked Bob');
      }
      console.log('Test 5b Passed: Bob call blocked and rejected successfully.');

      console.log('\n--- Test 6: Alice unblocks Bob ---');
      alice.emit('update_user_settings', {
        user_tag: 'block_alice',
        settings: JSON.stringify({
          blockedUsers: [],
        }),
      });

      await new Promise(r => setTimeout(r, 2000));

      console.log('\n--- Test 7: Query /api/users?request_by=block_bob to see if block_alice has blocked_by_them: false ---');
      usersRes = await fetch(`${BACKEND_URL}/api/users?request_by=block_bob`);
      usersList = await usersRes.json();
      aliceInList = usersList.find(u => u.tag === 'block_alice');
      console.log('Alice in users list:', aliceInList);
      if (!aliceInList || aliceInList.blocked_by_them !== false) {
        throw new Error('block_alice should have blocked_by_them: false for block_bob after unblocking');
      }
      console.log('Test 7 Passed: blocked_by_them flag updated correctly.');

      console.log('\n--- Test 8: Alice sends message to Bob again (Should succeed) ---');
      const msgId4 = `msg_block_4_${Math.random().toString(36).substring(2, 7)}`;
      let bobReceivedMsg4Promise = new Promise((resolve) => {
        bob.once('new_direct_msg', (msg) => {
          console.log('Bob received direct message:', msg.content);
          resolve(msg);
        });
      });

      alice.emit('send_direct_msg', {
        id: msgId4,
        sender_tag: 'block_alice',
        receiver_tag: 'block_bob',
        msg_type: 'text',
        content: 'Hi Bob! Unblocked now.',
      });

      const msg4 = await bobReceivedMsg4Promise;
      if (msg4.id !== msgId4) {
        throw new Error('Message 4 ID mismatch');
      }
      console.log('Test 8 Passed: Message delivered successfully after unblocking.');

      console.log('\n==============================================');
      console.log('ALL USER BLOCKING INTEGRATION TESTS PASSED SUCCESSFULLY!');
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
