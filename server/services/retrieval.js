const Document = require("../models/Document");

// Very small stopword list so common words don't dominate the score.
const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "do", "does", "did",
  "how", "what", "when", "where", "why", "to", "of", "in", "on", "for",
  "and", "or", "i", "you", "my", "your", "it", "can", "please", "me",
]);

function tokenize(text) {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{Script=Han}a-z0-9\s]/gu, " ");

  const latinTokens = normalized
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w) && !/^\p{Script=Han}+$/u.test(w));

  const chineseText = (normalized.match(/\p{Script=Han}+/gu) || []).join("");
  const chineseTokens = [];
  for (const n of [2, 3]) {
    for (let i = 0; i <= chineseText.length - n; i += 1) {
      chineseTokens.push(chineseText.slice(i, i + n));
    }
  }

  if (chineseText.length === 1) chineseTokens.push(chineseText);

  return [...latinTokens, ...chineseTokens];
}

// Simple term-overlap scoring (bag-of-words). This is intentionally dependency-free
// so the demo runs without any paid embedding API. For a production build, swap this
// module out for real vector embeddings + a vector store (e.g. MongoDB Atlas Vector
// Search, pgvector, or Pinecone) — same interface, better semantic matching.
function scoreChunk(queryTokens, chunkTokens) {
  const chunkSet = new Set(chunkTokens);
  let overlap = 0;
  for (const t of queryTokens) {
    if (chunkSet.has(t)) overlap += 1;
  }
  return overlap / Math.sqrt(chunkTokens.length + 1);
}

async function retrieveContext(query, topK = 3) {
  const docs = await Document.find({});
  if (docs.length === 0) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const scored = docs.map((doc) => {
    const chunkTokens = tokenize(doc.title + " " + doc.content);
    return { doc, score: scoreChunk(queryTokens, chunkTokens) };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored
    .filter((s) => s.score > 0)
    .slice(0, topK)
    .map((s) => ({ title: s.doc.title, content: s.doc.content, score: s.score }));
}

module.exports = { retrieveContext, tokenize };
