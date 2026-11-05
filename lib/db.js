require('dotenv').config();
const { MongoClient } = require('mongodb');

// Cache kết nối giữa các lần gọi serverless
let cached = global._mongo;
if (!cached) cached = global._mongo = { client: null, promise: null };

async function getDb() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URL || process.env.DATABASE_URL;
  if (!uri) throw new Error('Thiếu biến môi trường MONGODB_URI');
  if (!cached.promise) {
    cached.client = new MongoClient(uri, { maxPoolSize: 5 });
    cached.promise = cached.client.connect();
  }
  await cached.promise;
  return cached.client.db(process.env.MONGODB_DB || 'pccc');
}

module.exports = { getDb };
