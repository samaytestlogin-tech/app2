import { io } from 'socket.io-client';

const BACKEND_URL = 'http://localhost:3000';

console.log('Starting Message Pinning Features Integration Test...');

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
    await signupUser('pinner_alice', 'Alice Pinner', '🦊', 'password123');
    await signupUser('pinner_bob', 'Bob Member', '🐻', 'password123');
  } catch (err) {
    console.error('Failed user registration setup:', err);
    process.exit(1);
  }

  // 2. Establish connections
  const alice = io(BACKEND_URL, { auth: { userTag: 'pinner_alice', username: 'Alice Pinner' } });
  const bob = io(BACKEND_URL, { auth: { userTag: 'pinner_bob', username: 'Bob Member' } });

  let aliceConnected = false;
  let bobConnected = false;

  const checkConnections = async () => {
    if (aliceConnected && bobConnected) {
      console.log('Sockets connected. Registering sockets...');
      alice.emit('register_socket', { user_tag: 'pinner_alice' });
      bob.emit('register_socket', { user_tag: 'pinner_bob' });
      
      // Wait for registration to process
      await new Promise(r => setTimeout(r, 3000));
      console.log('Sockets registered. Running pinning checks...');
      runPinningTests();
    }
  };

  alice.on('connect', () => { aliceConnected = true; checkConnections(); });
  bob.on('connect', () => { bobConnected = true; checkConnections(); });

  const runPinningTests = async () => {
    try {
      const roomTag = `pin_room_${Math.random().toString(36).substring(2, 7)}`;
      console.log(`\n--- Test 1: Create room #${roomTag} ---`);
      
      alice.emit('join_room', {
        room_tag: roomTag,
        user_id: 'pinner_alice',
        username: 'Alice Pinner',
      });

      bob.emit('join_room', {
        room_tag: roomTag,
        user_id: 'pinner_bob',
        username: 'Bob Member',
      });

      // Wait a moment for room joining to complete
      await new Promise(r => setTimeout(r, 4000));

      console.log(`\n--- Test 2: Alice sends a message to pin ---`);
      const msgId = `msg_pin_${Math.random().toString(36).substring(2, 7)}`;
      alice.emit('send_msg', {
        id: msgId,
        room_tag: roomTag,
        sender_id: 'pinner_alice',
        sender_name: 'Alice Pinner',
        msg_type: 'text',
        content: 'This message is extremely important and should be pinned!',
      });

      // Wait for message insertion
      await new Promise(r => setTimeout(r, 4000));

      console.log(`\n--- Test 3: Alice pins the message ---`);
      
      let pinEventReceived = null;
      bob.once('message_pinned', (data) => {
        pinEventReceived = data;
        console.log('Bob received message_pinned event. Msg ID:', data.id);
      });

      alice.emit('pin_message', {
        message_id: msgId,
        room_tag: roomTag,
        user_id: 'pinner_alice',
      });

      await new Promise(r => setTimeout(r, 4000));

      if (!pinEventReceived) {
        throw new Error('Bob did not receive the message_pinned socket broadcast!');
      }

      console.log(`\n--- Test 4: Verify via pins REST API endpoint ---`);
      const pinsRes = await fetch(`${BACKEND_URL}/api/rooms/${roomTag}/pins`);
      if (!pinsRes.ok) throw new Error(`Pins REST API returned status ${pinsRes.status}`);
      const pinsList = await pinsRes.json();
      console.log('Pins List from REST API:', pinsList);
      if (pinsList.length !== 1 || pinsList[0].id !== msgId) {
        throw new Error('REST API verification failed: message not found in pins list');
      }
      if (pinsList[0].pinned !== true || pinsList[0].pinned_by !== 'pinner_alice') {
        throw new Error('REST API verification failed: incorrect pinning metadata');
      }
      console.log('REST API verification PASSED!');

      console.log(`\n--- Test 5: Bob attempts unauthorized unpinning (Bob is member, pinner was Alice) ---`);
      // Note: Since Bob is member, and did not pin, backend should reject unpinning
      bob.emit('unpin_message', {
        message_id: msgId,
        room_tag: roomTag,
        user_id: 'pinner_bob',
      });

      await new Promise(r => setTimeout(r, 4000));
      
      // Query REST API to verify it is still pinned
      const pinsRes2 = await fetch(`${BACKEND_URL}/api/rooms/${roomTag}/pins`);
      const pinsList2 = await pinsRes2.json();
      if (pinsList2.length !== 1) {
        throw new Error('Security check failed: Unauthorized user was able to unpin the message!');
      }
      console.log('Security check PASSED: Bob was not able to unpin Alice message!');

      console.log(`\n--- Test 6: Alice unpins the message ---`);
      let unpinEventReceived = null;
      bob.once('message_unpinned', (data) => {
        unpinEventReceived = data;
        console.log('Bob received message_unpinned event. Msg ID:', data.message_id);
      });

      alice.emit('unpin_message', {
        message_id: msgId,
        room_tag: roomTag,
        user_id: 'pinner_alice',
      });

      await new Promise(r => setTimeout(r, 4000));

      if (!unpinEventReceived || unpinEventReceived.message_id !== msgId) {
        throw new Error('Bob did not receive the message_unpinned socket broadcast!');
      }

      // Verify REST API is empty now
      const pinsRes3 = await fetch(`${BACKEND_URL}/api/rooms/${roomTag}/pins`);
      const pinsList3 = await pinsRes3.json();
      if (pinsList3.length !== 0) {
        throw new Error('Unpin verification failed: Message is still in pins list');
      }
      console.log('Unpin verification PASSED!');

      console.log('\n==============================================');
      console.log('ALL MESSAGE PINNING INTEGRATION TESTS PASSED SUCCESSFULLY!');
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
