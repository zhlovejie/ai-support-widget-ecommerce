// Thin wrapper so the rest of the app does not care which LLM provider is used.
// Switch providers by changing LLM_PROVIDER in .env.

const PROVIDER = (process.env.LLM_PROVIDER || "openai").trim().toLowerCase();
const LLM_TIMEOUT_MS = toPositiveInt(process.env.LLM_TIMEOUT_MS, 30000);
const MAX_TOKENS = toPositiveInt(process.env.LLM_MAX_TOKENS, 400);

class LLMServiceError extends Error {
  constructor(provider, message, options = {}) {
    super(message);
    this.name = "LLMServiceError";
    this.provider = provider;
    this.status = options.status;
    this.code = options.code;
    this.retryAfter = options.retryAfter;
  }
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function hasChinese(text) {
  return /\p{Script=Han}/u.test(text || "");
}

function buildSystemPrompt(contextChunks, userMessage) {
  const contextText = contextChunks.length
    ? contextChunks.map((c, i) => `[${i + 1}] ${c.title}\n${c.content}`).join("\n\n")
    : "(no matching knowledge base entries found)";
  const languageInstruction = hasChinese(userMessage)
    ? "Reply in Simplified Chinese unless the customer clearly asks for another language."
    : "Reply in the same language as the customer's question.";

  return `You are a helpful customer support assistant for this business.
Answer the customer's question using ONLY the knowledge base context below.
If the answer is not in the context, say you're not sure and that you'll pass it to a human agent - do NOT make anything up.
Keep answers short, friendly, and to the point.
${languageInstruction}

Knowledge base context:
${contextText}`;
}

function getFriendlyLLMReply(err, userMessage = "") {
  const useChinese = hasChinese(userMessage);

  if (err instanceof LLMServiceError) {
    if (err.code === "timeout") {
      if (useChinese) return "抱歉，AI 服务响应时间过长。我已经将这个问题标记给人工客服跟进。";
      return "Sorry, the AI service is taking too long to respond. I've flagged this for a human agent to follow up.";
    }

    if (err.status === 429) {
      if (useChinese) return "抱歉，AI 服务现在有点忙。请稍后再试，或由人工客服继续跟进。";
      return "Sorry, the AI service is busy right now. Please try again in a moment, or a human agent can follow up.";
    }

    if (useChinese) return "抱歉，AI 服务暂时不可用。我已经将这个问题标记给人工客服跟进。";
    return "Sorry, the AI service is temporarily unavailable. I've flagged this for a human agent to follow up.";
  }

  if (useChinese) return "抱歉，生成回复时出了点问题。我已经将这个问题标记给人工客服跟进。";
  return "Sorry, something went wrong generating a reply. I've flagged this for a human agent to follow up.";
}

function createAbortControl(provider, parentSignal) {
  const controller = new AbortController();
  let timedOut = false;
  let cancelled = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, LLM_TIMEOUT_MS);

  function onParentAbort() {
    cancelled = true;
    controller.abort();
  }

  if (parentSignal) {
    if (parentSignal.aborted) {
      onParentAbort();
    } else {
      parentSignal.addEventListener("abort", onParentAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout);
      if (parentSignal) parentSignal.removeEventListener("abort", onParentAbort);
    },
    normalizeError(err) {
      if (err instanceof LLMServiceError) return err;

      if (timedOut) {
        return new LLMServiceError(provider, `${provider} request timed out after ${LLM_TIMEOUT_MS}ms`, {
          code: "timeout",
        });
      }

      if (cancelled) {
        return new LLMServiceError(provider, `${provider} request was cancelled`, {
          code: "cancelled",
        });
      }

      return err;
    },
  };
}

async function throwForBadResponse(provider, res) {
  const errText = await res.text().catch(() => "");
  throw new LLMServiceError(provider, `${provider} API error: ${res.status} ${errText}`, {
    status: res.status,
    retryAfter: res.headers.get("retry-after"),
  });
}

async function fetchJson(provider, url, requestOptions, parentSignal) {
  const control = createAbortControl(provider, parentSignal);

  try {
    const res = await fetch(url, { ...requestOptions, signal: control.signal });
    if (!res.ok) await throwForBadResponse(provider, res);
    return await res.json();
  } catch (err) {
    throw control.normalizeError(err);
  } finally {
    control.cleanup();
  }
}

async function* streamSSELines(provider, url, requestOptions, parentSignal) {
  const control = createAbortControl(provider, parentSignal);

  try {
    const res = await fetch(url, { ...requestOptions, signal: control.signal });
    if (!res.ok) await throwForBadResponse(provider, res);
    if (!res.body) throw new LLMServiceError(provider, `${provider} did not return a response body`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        yield line.trimEnd();
      }
    }

    buffer += decoder.decode();
    if (buffer) {
      for (const line of buffer.split(/\r?\n/)) {
        if (line) yield line.trimEnd();
      }
    }
  } catch (err) {
    throw control.normalizeError(err);
  } finally {
    control.cleanup();
  }
}

function openAICompatibleRequest(provider, systemPrompt, userMessage, stream) {
  const config = {
    openai: {
      url: "https://api.openai.com/v1/chat/completions",
      key: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    },
    deepseek: {
      url: "https://api.deepseek.com/chat/completions",
      key: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      extraBody: {
        thinking: { type: process.env.DEEPSEEK_THINKING || "disabled" },
      },
    },
  }[provider];

  return {
    url: config.url,
    options: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.key}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: MAX_TOKENS,
        stream,
        ...(config.extraBody || {}),
      }),
    },
  };
}

function anthropicRequest(systemPrompt, userMessage, stream) {
  return {
    url: "https://api.anthropic.com/v1/messages",
    options: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        stream,
      }),
    },
  };
}

async function callOpenAICompatible(provider, systemPrompt, userMessage, parentSignal) {
  const request = openAICompatibleRequest(provider, systemPrompt, userMessage, false);
  const data = await fetchJson(provider, request.url, request.options, parentSignal);
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function callAnthropic(systemPrompt, userMessage, parentSignal) {
  const request = anthropicRequest(systemPrompt, userMessage, false);
  const data = await fetchJson("anthropic", request.url, request.options, parentSignal);
  const textBlock = data.content?.find((b) => b.type === "text");
  return textBlock ? textBlock.text.trim() : "";
}

async function* streamOpenAICompatible(provider, systemPrompt, userMessage, parentSignal) {
  const request = openAICompatibleRequest(provider, systemPrompt, userMessage, true);

  for await (const line of streamSSELines(provider, request.url, request.options, parentSignal)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("data:")) continue;

    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]") break;

    let data;
    try {
      data = JSON.parse(payload);
    } catch (err) {
      continue;
    }

    const delta = data.choices?.[0]?.delta;
    const text = delta?.content || delta?.refusal || "";
    if (text) yield text;
  }
}

async function* streamAnthropic(systemPrompt, userMessage, parentSignal) {
  const request = anthropicRequest(systemPrompt, userMessage, true);

  for await (const line of streamSSELines("anthropic", request.url, request.options, parentSignal)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("data:")) continue;

    let data;
    try {
      data = JSON.parse(trimmed.slice(5).trim());
    } catch (err) {
      continue;
    }

    if (data.type === "error") {
      throw new LLMServiceError("anthropic", data.error?.message || "Anthropic stream error", {
        code: data.error?.type,
      });
    }

    if (data.type === "content_block_delta" && data.delta?.type === "text_delta") {
      yield data.delta.text;
    }
  }
}

async function generateReply(userMessage, contextChunks, options = {}) {
  const systemPrompt = buildSystemPrompt(contextChunks, userMessage);

  if (PROVIDER === "anthropic") {
    return callAnthropic(systemPrompt, userMessage, options.signal);
  }

  if (PROVIDER === "deepseek") {
    return callOpenAICompatible("deepseek", systemPrompt, userMessage, options.signal);
  }

  return callOpenAICompatible("openai", systemPrompt, userMessage, options.signal);
}

async function* generateReplyStream(userMessage, contextChunks, options = {}) {
  const systemPrompt = buildSystemPrompt(contextChunks, userMessage);

  if (PROVIDER === "anthropic") {
    yield* streamAnthropic(systemPrompt, userMessage, options.signal);
    return;
  }

  if (PROVIDER === "deepseek") {
    yield* streamOpenAICompatible("deepseek", systemPrompt, userMessage, options.signal);
    return;
  }

  yield* streamOpenAICompatible("openai", systemPrompt, userMessage, options.signal);
}

module.exports = {
  LLMServiceError,
  generateReply,
  generateReplyStream,
  getFriendlyLLMReply,
};
