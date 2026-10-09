// middlewares/rateLimiter.js
// ─────────────────────────────────────────────────────────────────────────────
// Single shared Redis client used by:
//   1. express-rate-limit  (generalLimiter, authLimiter)
//   2. WhatsApp dedup lock (wa:dedup:<waMessageId>)
//   3. JWT token blacklist (bl:<token>)
// In local development without Redis, it cleanly degrades to in-memory fallbacks.
// ─────────────────────────────────────────────────────────────────────────────

const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { RedisStore }                = require("rate-limit-redis");
const { createClient }              = require("redis");

// ── Check if Redis should be enabled ──────────────────────────────────────────
const isRedisEnabled =
  process.env.ENABLE_REDIS !== "false" &&
  Boolean(process.env.REDIS_URL && process.env.REDIS_URL.trim() && !process.env.REDIS_URL.includes("disabled"));

let redisClient;
let hasConnectedOnce = false;

if (isRedisEnabled) {
  redisClient = createClient({
    url: process.env.REDIS_URL,
    socket: {
      reconnectStrategy: (retries) => {
        if (!hasConnectedOnce && retries >= 3) {
          console.warn("⚠️  Redis server is unreachable. Stopping reconnect attempts. Operating in local fallback mode.");
          return false;
        }
        return Math.min(retries * 500, 5000);
      },
    },
  });

  redisClient.connect().catch((err) => {
    console.warn("⚠️  Redis initial connection failed:", err.message);
    console.warn("⚠️  Rate limiter will fall back to in-memory store.");
  });

  redisClient.on("connect", () => {
    hasConnectedOnce = true;
    console.log("✅ Redis connected");
  });
  redisClient.on("error", (err) => {
    if (hasConnectedOnce) {
      console.error("Redis error:", err.message);
    }
  });
  redisClient.on("reconnecting", () => {
    if (hasConnectedOnce) {
      console.log("🔄 Redis reconnecting...");
    }
  });
} else {
  redisClient = {
    isReady: false,
    isOpen: false,
    get: async () => null,
    set: async () => "OK",
    del: async () => 0,
    sendCommand: async () => null,
    scanIterator: async function* () {},
    connect: async () => {},
    disconnect: async () => {},
    on: () => {},
  };
  console.log("ℹ️  Redis is disabled or not configured. Cache and rate limiters operating in local fallback mode.");
}

// ── Resilience helpers ────────────────────────────────────────────────────────
const redisDown = () => isRedisEnabled && !redisClient.isReady;

function failOpen(limiter) {
  return (req, res, next) => {
    limiter(req, res, (err) => {
      if (err) {
        console.error(
          "⚠️  Rate limiter store error — failing open (request allowed):",
          err.message,
        );
        return next(); // serve the request rather than crash it
      }
      next();
    });
  };
}

// ── Each limiter gets its OWN store instance with a unique prefix ─────────────
function makeStore(prefix) {
  if (!isRedisEnabled) return undefined; // use default in-memory store
  return new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: `rl:${prefix}:`,
  });
}

// ── General rate limiter (all authenticated routes) ───────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore("general"),
  keyGenerator: (req) => {
    if (req.user?._id)       return `u:${req.user._id}`;
    if (req.admin?._id)      return `a:${req.admin._id}`;
    if (req.superAdmin?._id) return `s:${req.superAdmin._id}`;
    return ipKeyGenerator(req.ip);
  },
  skip: (req) => {
    if (redisDown()) return true;
    const p = req.path || "";
    return (
      p.startsWith("/socket.io")       ||
      p.startsWith("/recordings")      ||
      p === "/"                        ||
      p === "/api/health"              ||
      p === "/api/attendance/ping"     ||
      p === "/api/attendance/my-today" ||
      p === "/api/lead/my-leads"       ||
      p.startsWith("/meta")            ||
      p.startsWith("/website-webhook") ||
      p.startsWith("/msg91-webhook")
    );
  },
  message: {
    success: false,
    message: "Too many requests, please try again after 15 minutes.",
  },
});

// ── Auth rate limiter (login / register endpoints) ────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore("auth"),
  skip: () => redisDown(),
  keyGenerator: (req) => {
    const identifier = (req.body?.email || "").toLowerCase().trim();
    return identifier
      ? `auth:${ipKeyGenerator(req.ip)}:${identifier}`
      : `auth:${ipKeyGenerator(req.ip)}`;
  },
  message: {
    success: false,
    message: "Too many authentication attempts, please try again after 15 minutes.",
  },
});

const ipFloodLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeStore("auth-ip"),
  skip: () => redisDown(),
  keyGenerator: (req) => `authip:${ipKeyGenerator(req.ip)}`,
  message: {
    success: false,
    message: "Too many authentication attempts from this network, please try again after 15 minutes.",
  },
});

// ── In-memory fallback sets for local dev ─────────────────────────────────────
const inMemoryBlacklist = new Set();
const inMemoryWaDedup = new Set();

async function blacklistToken(token, expirySeconds) {
  try {
    if (isRedisEnabled && redisClient.isReady) {
      await redisClient.set(`bl:${token}`, "1", { EX: Math.max(1, expirySeconds) });
      console.log(`🚫 Token blacklisted (TTL: ${expirySeconds}s)`);
      return;
    }
    inMemoryBlacklist.add(token);
    setTimeout(() => inMemoryBlacklist.delete(token), Math.max(1, expirySeconds) * 1000);
    console.log(`🚫 Token blacklisted in memory (TTL: ${expirySeconds}s)`);
  } catch (err) {
    console.error("blacklistToken error:", err.message);
  }
}

async function isTokenBlacklisted(token) {
  try {
    if (isRedisEnabled && redisClient.isReady) {
      const val = await redisClient.get(`bl:${token}`);
      return val !== null;
    }
    return inMemoryBlacklist.has(token);
  } catch (err) {
    console.error("isTokenBlacklisted error:", err.message);
    return false;
  }
}

async function acquireWaDedupLock(waMessageId) {
  try {
    if (isRedisEnabled && redisClient.isReady) {
      const result = await redisClient.set(
        `wa:dedup:${waMessageId}`,
        "1",
        { NX: true, EX: 120 }
      );
      return result === "OK";
    }
    if (inMemoryWaDedup.has(waMessageId)) return false;
    inMemoryWaDedup.add(waMessageId);
    setTimeout(() => inMemoryWaDedup.delete(waMessageId), 120000);
    return true;
  } catch (err) {
    console.error("acquireWaDedupLock error:", err.message);
    return true;
  }
}

module.exports = {
  redisClient,
  generalLimiter: failOpen(generalLimiter),
  authLimiter:    failOpen(authLimiter),
  ipFloodLimiter: failOpen(ipFloodLimiter),
  blacklistToken,
  isTokenBlacklisted,
  acquireWaDedupLock,
};