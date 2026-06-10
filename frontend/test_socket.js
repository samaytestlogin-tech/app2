import { io } from "socket.io-client";

const socket = io("http://localhost:3000");

socket.on("connect", () => {
  console.log("Connected to backend socket server!");
  
  // Join a test room
  console.log("Joining room test_room...");
  socket.emit("join_room", {
    room_tag: "test_room",
    user_id: "test_user_1",
    username: "Test User"
  });
});

socket.on("room_history", (history) => {
  console.log("Received room history:", history);
  
  // Send a test message
  console.log("Sending test message...");
  const msgId = "msg_" + Math.random().toString(36).substring(2, 15);
  socket.emit("send_msg", {
    id: msgId,
    room_tag: "test_room",
    msg_type: "text",
    content: "Hello from automation test!",
    sender_id: "test_user_1",
    sender_name: "Test User"
  });
});

socket.on("new_msg", (msg) => {
  console.log("Received new_msg event:", msg);
  console.log("Success! Closing connection...");
  socket.close();
  process.exit(0);
});

socket.on("connect_error", (err) => {
  console.error("Connection error:", err);
  process.exit(1);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.error("Test timed out!");
  socket.close();
  process.exit(1);
}, 10000);
