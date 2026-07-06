require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const connectDB = require("./db");
const apiRoutes = require("./routes/api");

async function main() {
  await connectDB();

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Serve the demo frontend (host page + widget script + admin panel) as static files
  app.use(express.static(path.join(__dirname, "..", "client")));

  app.use("/api", apiRoutes);

  app.get("/health", (req, res) => res.json({ status: "ok" }));

  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`[server] AI support demo running at http://localhost:${PORT}`);
    console.log(`[server] Demo site:  http://localhost:${PORT}/index.html`);
    console.log(`[server] Admin panel: http://localhost:${PORT}/admin.html`);
  });
}

main();
