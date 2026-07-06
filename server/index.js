require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const connectDB = require("./db");
const apiRoutes = require("./routes/api");

const app = express();

app.use(cors());
app.use(express.json());

// Serve the demo frontend locally. On Vercel, static files are served from /public.
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/api", async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(500).json({ error: "Database connection failed." });
  }
});

app.use("/api", apiRoutes);

async function main() {
  await connectDB();
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`[server] AI support demo running at http://localhost:${PORT}`);
    console.log(`[server] Demo site:  http://localhost:${PORT}/index.html`);
    console.log(`[server] Admin panel: http://localhost:${PORT}/admin.html`);
  });
}

if (require.main === module) {
  main();
}

module.exports = app;
