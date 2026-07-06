// AI Support Widget - drop this script tag on any site to add AI-powered support.

(function () {
  const scriptTag = document.currentScript;
  const API_BASE = (scriptTag && scriptTag.getAttribute("data-api-base")) || "/api";
  const sessionId = getOrCreateSessionId();

  injectMarkup();

  const launcher = document.getElementById("ai-support-launcher");
  const win = document.getElementById("ai-support-window");
  const closeBtn = document.getElementById("ai-support-close");
  const messagesEl = document.getElementById("ai-support-messages");
  const form = document.getElementById("ai-support-form");
  const input = document.getElementById("ai-support-input-field");

  launcher.addEventListener("click", () => {
    win.classList.toggle("open");
    if (win.classList.contains("open")) loadHistory();
  });
  closeBtn.addEventListener("click", () => win.classList.remove("open"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    appendMessage("user", text);
    const assistantEl = appendMessage("assistant", "typing...", true);

    try {
      const res = await fetch(`${API_BASE}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        assistantEl.classList.remove("typing");
        assistantEl.textContent = data.error || "Sorry, something went wrong.";
        return;
      }

      await readAssistantStream(res, assistantEl);
    } catch (err) {
      assistantEl.classList.remove("typing");
      assistantEl.textContent = "Sorry, I couldn't reach the server. Please try again.";
    }
  });

  async function loadHistory() {
    if (messagesEl.dataset.loaded) return;
    messagesEl.dataset.loaded = "1";
    try {
      const res = await fetch(`${API_BASE}/conversations/${sessionId}`);
      const data = await res.json();
      (data.messages || []).forEach((m) => appendMessage(m.role, m.content));
      if (!data.messages || data.messages.length === 0) {
        appendMessage("assistant", "Hi! How can I help you today?");
      }
    } catch (err) {
      appendMessage("assistant", "Hi! How can I help you today?");
    }
  }

  function appendMessage(role, text, isTyping) {
    const el = document.createElement("div");
    el.className = "msg " + role + (isTyping ? " typing" : "");
    el.textContent = text;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  async function readAssistantStream(res, assistantEl) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let reply = "";

    assistantEl.textContent = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const eventText of events) {
        const event = parseSSEEvent(eventText);
        if (!event) continue;

        if (event.event === "chunk") {
          reply += event.data.text || "";
          assistantEl.classList.remove("typing");
          assistantEl.textContent = reply;
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        if (event.event === "error" && !reply) {
          assistantEl.classList.remove("typing");
          assistantEl.textContent = event.data.message || "Sorry, something went wrong.";
        }
      }
    }

    if (!reply && !assistantEl.textContent) {
      assistantEl.classList.remove("typing");
      assistantEl.textContent = "Sorry, something went wrong.";
    }
  }

  function parseSSEEvent(eventText) {
    const lines = eventText.split(/\r?\n/);
    let event = "message";
    let data = "";

    lines.forEach((line) => {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data += line.slice(5).trim();
    });

    if (!data) return null;

    try {
      return { event, data: JSON.parse(data) };
    } catch (err) {
      return null;
    }
  }

  function getOrCreateSessionId() {
    const key = "ai_support_session_id";
    let id = localStorage.getItem(key);
    if (!id) {
      id = "sess_" + Math.random().toString(36).slice(2) + Date.now();
      localStorage.setItem(key, id);
    }
    return id;
  }

  function injectMarkup() {
    const launcherEl = document.createElement("button");
    launcherEl.id = "ai-support-launcher";
    launcherEl.textContent = "Chat";
    launcherEl.setAttribute("aria-label", "Open support chat");

    const windowEl = document.createElement("div");
    windowEl.id = "ai-support-window";
    windowEl.innerHTML = `
      <div class="ai-support-header">
        <div>
          <div class="title">Support Assistant</div>
          <div class="subtitle">Usually replies instantly</div>
        </div>
        <button id="ai-support-close" aria-label="Close support chat">x</button>
      </div>
      <div class="ai-support-messages" id="ai-support-messages"></div>
      <form class="ai-support-input" id="ai-support-form">
        <input id="ai-support-input-field" type="text" placeholder="Type your question..." autocomplete="off" />
        <button type="submit">Send</button>
      </form>
    `;

    document.body.appendChild(launcherEl);
    document.body.appendChild(windowEl);
  }
})();
