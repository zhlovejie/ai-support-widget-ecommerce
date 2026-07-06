# 🤖 AI Customer Support Widget (RAG-powered)

An embeddable AI chat widget that answers customer questions using **your own knowledge base** — not a generic chatbot. Drop one `<script>` tag into any website, manage FAQs from a simple admin panel, and let AI handle Tier-1 support 24/7.

![status](https://img.shields.io/badge/status-demo-blue) ![node](https://img.shields.io/badge/Node.js-18%2B-green) ![mongodb](https://img.shields.io/badge/MongoDB-8.x-47A248) ![license](https://img.shields.io/badge/license-MIT-lightgrey)

> 📹 **[Watch the 60-second demo video](#)** *(replace with your Loom/YouTube link)*

---

## What this demonstrates

This is a portfolio project built to show a common, high-demand freelance use case:
**"Add an AI support chatbot to my website that only answers from our own content."**

- ✅ Embeddable widget — one script tag, works on any site (WordPress, Shopify, custom builds)
- ✅ Retrieval-Augmented Generation (RAG) — answers are grounded in a real knowledge base, reducing hallucination
- ✅ Provider-agnostic LLM layer — swap between OpenAI, Anthropic, and DeepSeek by changing one env variable
- ✅ Human handoff — flags conversations the AI couldn't confidently answer, so nothing falls through the cracks
- ✅ Admin panel — non-technical staff can update the knowledge base without touching code
- ✅ Conversation history persisted in MongoDB

## Tech stack

| Layer | Tech |
|---|---|
| Frontend widget | Vanilla JavaScript, HTML, CSS (zero build step, easy to embed anywhere) |
| Backend | Node.js, Express |
| Database | MongoDB (Mongoose) |
| AI | OpenAI, Anthropic Claude, or DeepSeek API (configurable) |
| Retrieval | Lightweight term-overlap scoring (see note below) |

> **Note on retrieval:** this demo uses a dependency-free keyword-overlap scorer so it runs
> with zero extra cost or infra. For a production build I'd swap this for real vector
> embeddings + a vector store (MongoDB Atlas Vector Search, pgvector, or Pinecone) — the
> module interface (`retrieveContext(query, topK)`) is already designed to make that a
> drop-in replacement.

## Project structure

```
ai-support-demo/
├── api/
│   └── index.js         # Vercel serverless function entry point
├── public/              # Static storefront, admin panel, widget script, and CSS
│   ├── index.html       # Simulated client website with the widget embedded
│   ├── admin.html       # Knowledge base management UI
│   ├── widget.js        # The embeddable chat widget itself
│   └── styles.css
├── server/
│   ├── index.js         # Express app entry point
│   ├── db.js            # MongoDB connection
│   ├── seed.js          # Populates sample FAQ data for a quick demo
│   ├── models/          # Mongoose schemas (Document, Conversation)
│   ├── services/
│   │   ├── retrieval.js # RAG retrieval logic
│   │   └── llm.js       # OpenAI / Anthropic / DeepSeek API wrapper
│   └── routes/api.js    # REST API (knowledge base CRUD + chat)
├── package.json         # Root install/start scripts for local and Vercel deploys
└── vercel.json          # Vercel rewrites for /api/* and /health
```

## Getting started

```bash
npm install
cp server/.env.example server/.env  # then add your MongoDB URI + LLM API key
npm run seed               # optional: populate sample FAQ data
npm start
```

Then open:
- `http://localhost:4000/index.html` — the demo storefront with the chat widget
- `http://localhost:4000/admin.html` — manage the knowledge base

## Deploying to Vercel

Deploy from the repository root. Vercel serves the static frontend from `public/`
and routes `/api/*` requests to the serverless Express handler in `api/index.js`.

Set these environment variables in Vercel Project Settings:

- `MONGODB_URI`
- `LLM_PROVIDER`
- The matching provider key, such as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `DEEPSEEK_API_KEY`
- Optional runtime tuning: `LLM_TIMEOUT_MS`, `LLM_MAX_TOKENS`, `CHAT_RATE_LIMIT_WINDOW_MS`, `CHAT_RATE_LIMIT_MAX`

## Embedding on a real site

```html
<script src="https://your-domain.com/widget.js" data-api-base="https://your-domain.com/api"></script>
```

That's it — the widget is self-contained and styles itself, no CSS conflicts with the host page.

## API overview

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/documents` | List knowledge base entries |
| `POST` | `/api/documents` | Add a knowledge base entry |
| `DELETE` | `/api/documents/:id` | Remove an entry |
| `POST` | `/api/chat` | Send a user message, get an AI reply |
| `POST` | `/api/chat/stream` | Send a user message, stream the AI reply as Server-Sent Events |
| `GET` | `/api/conversations/:sessionId` | Fetch chat history for a session |
| `GET` | `/api/conversations` | List recent conversations (for an "agent inbox" view) |

## Roadmap / how I'd extend this for a client

- Real vector embeddings for better semantic matching on large knowledge bases
- Slack/email notification when a conversation is escalated to a human
- Language analytics and translation workflows for international teams
- Analytics dashboard (common questions, deflection rate, response time)

---

Built as a portfolio demo. Available for freelance work — feel free to reach out to discuss adapting this for your product's specific knowledge base and workflow.
