const mongoose = require("mongoose");

// A single knowledge-base "chunk" (e.g. one FAQ answer or one paragraph of a policy doc).
// Keeping chunks small improves retrieval precision for the RAG step.
const DocumentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    tags: [{ type: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Document", DocumentSchema);
