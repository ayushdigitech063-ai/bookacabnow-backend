const http = require("http");
const dotenv = require("dotenv");
const { Server } = require("socket.io");

dotenv.config();

const app = require("./app");
const { connectDB } = require("./config/db.config");
const { redisClient } = require("./config/redis.config");

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  try {
    await redisClient.connect();
  } catch (err) {
    console.log("[Redis] Optional standalone Redis fallback active");
  }

  server.listen(PORT, () => {
    console.log(`Cab Server running on http://localhost:${PORT}`);
  });
};

startServer();

module.exports = {
  io
};