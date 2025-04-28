// const { Server } = require("socket.io");

// const users = {}; // เก็บ socket.id ของผู้ใช้

// const initializeSocket = (server) => {
//  const io = new Server(server, {
//     cors: {
//       origin: ["http://localhost:3002", "http://localhost:3000"], 
//       methods: ["GET", "POST"]
//     }
//   });

//   io.on("connection", (socket) => {
//     console.log("User connected:", socket.id);

//     socket.on("disconnect", () => {
//       console.log("User disconnected:", socket.id);
//     });
//   });

//   // io.on("connection", (socket) => {
//   //   console.log(`User Connected: ${socket.id}`);

//   //   socket.on("registerUser", (userId) => {
//   //     console.log(`User ${userId} registered with socket ID: ${socket.id}`);
//   //     users[userId] = socket.id;
//   //     console.log("Current users:", users);
//   //   });

//   //   socket.on("likePost", (data) => {
//   //     console.log("Like Post Data:", data);
      
//   //     const { postOwnerId, postId, likedBy } = data;
//   //     console.log(`Sending notification to ${postOwnerId}`);
//   //     if (users[postOwnerId]) {
//   //       io.to(users[postOwnerId]).emit("notification", {
//   //         message: `ผู้ใช้ ${likedBy} กดถูกใจกระทู้ของคุณ`,
//   //         postId
//   //       });
//   //     }else {
//   //       console.log(`No user found with userId ${postOwnerId}`);
//   //     }
//   //   });

//   //   socket.on("disconnect", () => {
//   //     console.log(`User Disconnected: ${socket.id} due to ${reason}`);
//   //     for (const userId in users) {
//   //       if (users[userId] === socket.id) {
//   //         delete users[userId];
//   //       }
//   //     }
//   //   });
//   // });

//   return io;
// };

// module.exports = initializeSocket;
