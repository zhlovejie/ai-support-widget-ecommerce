require("dotenv").config(); // 必须放在所有 require 最前面
const mongoose = require("mongoose");

const cached = global.__aiSupportMongo || { conn: null, promise: null };
global.__aiSupportMongo = cached;

async function connectDB() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ai_support_demo";
  console.log(`connect uri:${uri}`)
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(uri)
      .then((conn) => {
        console.log("[db] MongoDB connected");
        return conn;
      })
      .catch((err) => {
        cached.promise = null;
        console.error("[db] MongoDB connection failed:", err.message);
        console.error("[db] Make sure MONGODB_URI is set in your environment variables.");
        throw err;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

module.exports = connectDB;
