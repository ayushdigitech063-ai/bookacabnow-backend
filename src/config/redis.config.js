const Redis = require("ioredis");

const createRedisClient = () => {
  const redis = new Redis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      
      if (times > 3) {
        console.warn("[Redis] Server not running locally. Telemetry caching is paused.");
        return null; 
      }
      return Math.min(times * 100, 2000);
    }
  });

  redis.on("connect", () => {
    console.log("[Redis] Connected successfully for Live GPS Telemetry & Caching");
  });

  
  redis.on("error", (err) => {
    console.warn("[Redis] Warning:", err ? err.message : "Redis connection error");
  });

  return redis;
};

const redisClient = createRedisClient();

module.exports = {
  redisClient
};