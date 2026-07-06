const app = require("../server/index");

module.exports = (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = url.searchParams.get("path");

  if (path) {
    url.searchParams.delete("path");
    const query = url.searchParams.toString();
    req.url = `/api/${path}${query ? `?${query}` : ""}`;
  } else if (!req.url.startsWith("/api") && req.url !== "/health") {
    req.url = `/api${req.url}`;
  }

  return app(req, res);
};
