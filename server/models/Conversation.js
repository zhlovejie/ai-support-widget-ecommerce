const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    usedContext: [{ type: String }], // which knowledge chunks were retrieved for this answer
  },
  { _id: false, timestamps: true }
);

const ConversationSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true },
    messages: [MessageSchema],
    escalated: { type: Boolean, default: false }, // true if AI couldn't answer confidently
  },
  { timestamps: true }
);

module.exports = mongoose.model("Conversation", ConversationSchema);
