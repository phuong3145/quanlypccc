const { Redis } = require('@upstash/redis');

// L1: In-memory cache trong từng Serverless instance (siêu nhanh, 0ms)
const MEM_CACHE = new Map();
const MEM_TTL_MS = 60 * 1000; // 60 giây
const REDIS_TTL_SEC = 300;    // 5 phút trên Redis
const KEY_PREFIX = 'pccc:';

let redisClient = null;

function getRedis() {
  if (redisClient !== null) return redisClient;
  const url =
    process.env.REDIS_2_KV_REST_API_URL ||
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.REDIS_2_KV_REST_API_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    redisClient = new Redis({ url, token });
  } else {
    redisClient = false;
  }
  return redisClient;
}

async function getCache(key) {
  const fullKey = KEY_PREFIX + key;
  // 1. Kiểm tra L1 Memory trước
  const mem = MEM_CACHE.get(fullKey);
  if (mem && mem.exp > Date.now()) {
    return { val: mem.val, source: 'MEMORY' };
  }

  // 2. Kiểm tra L2 Upstash Redis
  const redis = getRedis();
  if (redis) {
    try {
      const val = await redis.get(fullKey);
      if (val !== null && val !== undefined) {
        MEM_CACHE.set(fullKey, { val, exp: Date.now() + MEM_TTL_MS });
        return { val, source: 'REDIS' };
      }
    } catch (e) {
      console.error('Redis GET error:', e.message);
    }
  }
  return null;
}

async function setCache(key, val, ttlSec = REDIS_TTL_SEC) {
  const fullKey = KEY_PREFIX + key;
  MEM_CACHE.set(fullKey, { val, exp: Date.now() + Math.min(ttlSec * 1000, MEM_TTL_MS) });

  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(fullKey, val, { ex: ttlSec });
    } catch (e) {
      console.error('Redis SET error:', e.message);
    }
  }
}

async function clearCache() {
  MEM_CACHE.clear();
  const redis = getRedis();
  if (redis) {
    try {
      const keys = await redis.keys(`${KEY_PREFIX}*`);
      if (keys && keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (e) {
      console.error('Redis CLEAR error:', e.message);
    }
  }
}

module.exports = { getCache, setCache, clearCache, getRedis };
