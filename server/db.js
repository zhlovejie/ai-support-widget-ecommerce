const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ai_support_demo";
  try {
    await mongoose.connect(uri);
    console.log("[db] MongoDB connected:", uri);
  } catch (err) {
    console.error("[db] MongoDB connection failed:", err.message);
    console.error("[db] Make sure MongoDB is running locally, or set MONGODB_URI to an Atlas connection string.");
    process.exit(1);
  }
}

module.exports = connectDB;
