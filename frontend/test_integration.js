import { io } from 'socket.io-client';

const BACKEND_URL = 'http://localhost:3000';

console.log('Starting credentials and DM integration test...');

// Helper to register a user
async function signupUser(tag, name, avatar, password) {
  const res = await fetch(`${BACKEND_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag, name, avatar, password }),
  });
  if (res.ok || res.status === 409) {
    console.log(`Signup success/conflict check for ${tag}: status ${res.status}`);
    return true;
  }
  throw new Error(`Signup failed for ${tag}: ${res.status}`);
}

async function run() {
  // 1. Sign up Alice and Bob
  try {
    await signupUser('alice_tag', 'Alice Tester', '🦊', 'password123');
    await signupUser('bob_tag', 'Bob Tester', '🐼', 'securepass');
  } catch (err) {
    console.error('Failed user registration setup:', err);
    process.exit(1);
  }

  // 2. Establish connections
  const alice = io(BACKEND_URL, { auth: { userTag: 'alice_tag', username: 'Alice Tester' } });
  const bob = io(BACKEND_URL, { auth: { userTag: 'bob_tag', username: 'Bob Tester' } });

  let aliceConnected = false;
  let bobConnected = false;

  const checkConnections = () => {
    if (aliceConnected && bobConnected) {
      console.log('Sockets connected! Registering tags...');
      alice.emit('register_socket', { user_tag: 'alice_tag' });
      bob.emit('register_socket', { user_tag: 'bob_tag' });
      startDMOtherChecks();
    }
  };

  alice.on('connect', () => {
    aliceConnected = true;
    checkConnections();
  });

  bob.on('connect', () => {
    bobConnected = true;
    checkConnections();
  });

  const startDMOtherChecks = () => {
    // Listen for Bob going online notification on Alice's side
    alice.on('user_online', (data) => {
      console.log(`Presence Alert: User @${data.tag} is online!`);
    });

    const msgId = `dm_msg_${Math.random().toString(36).substring(2, 7)}`;
    // Step 3: Alice sends a DM to Bob
    setTimeout(() => {
      console.log('Step 3: Alice sending 1-to-1 direct message to Bob...');
      alice.emit('send_direct_msg', {
        id: msgId,
        sender_tag: 'alice_tag',
        receiver_tag: 'bob_tag',
        msg_type: 'text',
        content: 'Hi Bob! Are we chatting in 1-to-1 DMs?'
      });
    }, 1000);

    // Bob listens for Alice's DM
    bob.on('new_direct_msg', (msg) => {
      console.log('Bob received direct message:', msg.content);
      if (msg.id === msgId) {
        console.log('Step 4: Bob acknowledging DM seen receipt...');
        bob.emit('direct_msg_seen', {
          message_id: msgId,
          sender_tag: 'alice_tag',
          receiver_tag: 'bob_tag'
        });
      }
    });

    // Alice listens for Bob's seen confirmation
    alice.on('direct_msg_status_update', (data) => {
      console.log(`Alice received DM status: Msg ${data.id} is now ${data.status}`);
      if (data.id === msgId && data.status === 'seen') {
        console.log('Step 5: Direct chat status flow verified successfully!');
        
        // Fetch users list from REST API
        fetch(`${BACKEND_URL}/api/users`)
          .then(res => res.json())
          .then(users => {
            console.log('Registered user list retrieved:', users.map(u => `@${u.tag} (${u.online ? 'Online' : 'Offline'})`));
            
            alice.close();
            bob.close();
            console.log('All credential-based DM integration tests passed successfully!');
            process.exit(0);
          })
          .catch(err => {
            console.error('Error fetching registered users list:', err);
            process.exit(1);
          });
      }
    });
  };

  // Timeout guard
  setTimeout(() => {
    console.error('Test timeout - flow got stuck!');
    alice.close();
    bob.close();
    process.exit(1);
  }, 10000);
}

run();
