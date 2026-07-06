const express = require("express");
const router = express.Router();

const Document = require("../models/Document");
const Conversation = require("../models/Conversation");
const { retrieveContext } = require("../services/retrieval");
const { generateReply, generateReplyStream, getFriendlyLLMReply } = require("../services/llm");

const CHAT_RATE_LIMIT_WINDOW_MS = toPositiveInt(process.env.CHAT_RATE_LIMIT_WINDOW_MS, 60000);
const CHAT_RATE_LIMIT_MAX = toPositiveInt(process.env.CHAT_RATE_LIMIT_MAX, 10);
const chatRateLimit = new Map();

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRateLimitKey(req, sessionId) {
  return sessionId || req.ip || req.headers["x-forwarded-for"] || "anonymous";
}

function checkChatRateLimit(req, sessionId) {
  const now = Date.now();
  const key = getRateLimitKey(req, sessionId);
  const entry = chatRateLimit.get(key);

  if (!entry || entry.resetAt <= now) {
    chatRateLimit.set(key, { count: 1, resetAt: now + CHAT_RATE_LIMIT_WINDOW_MS });
    return { limited: false };
  }

  entry.count += 1;
  if (entry.count > CHAT_RATE_LIMIT_MAX) {
    return {
      limited: true,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  return { limited: false };
}

function pruneChatRateLimit() {
  const now = Date.now();
  for (const [key, entry] of chatRateLimit.entries()) {
    if (entry.resetAt <= now) chatRateLimit.delete(key);
  }
}

setInterval(pruneChatRateLimit, CHAT_RATE_LIMIT_WINDOW_MS).unref();

async function saveConversation(sessionId, userMessage, assistantReply, contextChunks, escalated) {
  let convo = await Conversation.findOne({ sessionId });
  if (!convo) convo = new Conversation({ sessionId, messages: [] });

  convo.messages.push({ role: "user", content: userMessage });
  convo.messages.push({
    role: "assistant",
    content: assistantReply,
    usedContext: contextChunks.map((c) => c.title),
  });
  if (escalated) convo.escalated = true;
  await convo.save();
}

function writeSSE(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ---------- Knowledge base management ----------

// List all knowledge base entries
router.get("/documents", async (req, res) => {
  const docs = await Document.find({}).sort({ createdAt: -1 });
  res.json(docs);
});

// Add a new knowledge base entry (FAQ, policy snippet, product info, etc.)
router.post("/documents", async (req, res) => {
  const { title, content, tags } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: "title and content are required" });
  }
  const doc = await Document.create({ title, content, tags: tags || [] });
  res.status(201).json(doc);
});

router.delete("/documents/:id", async (req, res) => {
  await Document.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// ---------- Chat ----------

router.post("/chat", async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    if (!sessionId || !message) {
      return res.status(400).json({ error: "sessionId and message are required" });
    }

    const rateLimit = checkChatRateLimit(req, sessionId);
    if (rateLimit.limited) {
      res.set("Retry-After", String(rateLimit.retryAfter));
      return res.status(429).json({
        error: "Too many messages. Please wait a moment before trying again.",
        retryAfter: rateLimit.retryAfter,
      });
    }

    const contextChunks = await retrieveContext(message, 3);

    // low/no retrieval score => flag for human follow-up
    let escalated = contextChunks.length === 0;
    let reply;

    try {
      reply = await generateReply(message, contextChunks);
    } catch (err) {
      console.error("[chat] llm error:", err.message);
      reply = getFriendlyLLMReply(err, message);
      escalated = true;
    }

    await saveConversation(sessionId, message, reply, contextChunks, escalated);

    res.json({ reply, escalated, usedContext: contextChunks.map((c) => c.title) });
  } catch (err) {
    console.error("[chat] error:", err.message);
    res.status(500).json({ error: "Something went wrong generating a reply." });
  }
});

router.post("/chat/stream", async (req, res) => {
  const { sessionId, message } = req.body;
  if (!sessionId || !message) {
    return res.status(400).json({ error: "sessionId and message are required" });
  }

  const rateLimit = checkChatRateLimit(req, sessionId);
  if (rateLimit.limited) {
    res.set("Retry-After", String(rateLimit.retryAfter));
    return res.status(429).json({
      error: "Too many messages. Please wait a moment before trying again.",
      retryAfter: rateLimit.retryAfter,
    });
  }

  const abortController = new AbortController();
  let responseFinished = false;
  res.on("close", () => {
    if (!responseFinished) abortController.abort();
  });

  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  let contextChunks = [];
  let reply = "";
  let escalated = false;

  try {
    contextChunks = await retrieveContext(message, 3);
    escalated = contextChunks.length === 0;

    writeSSE(res, "meta", {
      escalated,
      usedContext: contextChunks.map((c) => c.title),
    });

    for await (const chunk of generateReplyStream(message, contextChunks, { signal: abortController.signal })) {
      reply += chunk;
      writeSSE(res, "chunk", { text: chunk });
    }

    if (!reply.trim()) {
      reply = "Sorry, I could not generate a response. I've flagged this for a human agent to follow up.";
      escalated = true;
      writeSSE(res, "chunk", { text: reply });
    }
  } catch (err) {
    if (abortController.signal.aborted) {
      console.warn("[chat:stream] client disconnected before completion");
      return;
    }

    console.error("[chat:stream] error:", err.message);
    reply = getFriendlyLLMReply(err, message);
    escalated = true;
    writeSSE(res, "chunk", { text: reply });
  }

  try {
    await saveConversation(sessionId, message, reply, contextChunks, escalated);
    writeSSE(res, "done", {
      escalated,
      usedContext: contextChunks.map((c) => c.title),
    });
  } catch (err) {
    console.error("[chat:stream] save error:", err.message);
    writeSSE(res, "error", { message: "The reply was sent, but saving the conversation failed." });
  } finally {
    responseFinished = true;
    res.end();
  }
});

// Fetch conversation history for a given session (used by the widget on reload)
router.get("/conversations/:sessionId", async (req, res) => {
  const convo = await Conversation.findOne({ sessionId: req.params.sessionId });
  res.json(convo || { sessionId: req.params.sessionId, messages: [] });
});

// List all conversations flagged for human follow-up (simple "agent inbox" view)
router.get("/conversations", async (req, res) => {
  const convos = await Conversation.find({}).sort({ updatedAt: -1 }).limit(50);
  res.json(convos);
});

module.exports = router;
