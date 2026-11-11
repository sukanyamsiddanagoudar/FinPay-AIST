require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const { pool } = require("./src/config/db");
const { errorHandler } = require("./src/middleware/errors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "20kb" }));

// Health check: open /api/health in the browser to confirm the database connection and tables.
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT COUNT(*) AS n FROM wallet_tier");
    res.json({ status: "ok", database: "connected" });
  } catch (err) {
    const hints = {
      ER_NO_SUCH_TABLE: "Connected to MySQL, but the FinPay tables are missing. Run database/schema.sql.",
      ER_BAD_DB_ERROR: "That database does not exist. Run database/schema.sql or fix DB_NAME in .env.",
      ER_ACCESS_DENIED_ERROR: "Wrong DB_USER or DB_PASSWORD in .env.",
      ECONNREFUSED: "MySQL is not reachable. Is it running? Check DB_HOST / DB_PORT in .env.",
    };
    res.status(503).json({ status: "error", database: "not connected", reason: err.code || "UNKNOWN", hint: hints[err.code] || "Check the DB_* values in .env." });
  }
});

app.use("/api/auth", require("./src/routes/auth.routes"));
app.use("/api/wallet", require("./src/routes/wallet.routes"));
app.use("/api", require("./src/routes/payment.routes"));
app.use("/api", (req, res) => res.status(404).json({ code: "NOT_FOUND", message: "Unknown API route." }));

app.use(express.static(path.join(__dirname, "frontend")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "frontend", "index.html")));
app.use(errorHandler);

const PORT = Number(process.env.PORT || 5050);
const server = app.listen(PORT, () => {
  console.log(`FinPay running at http://localhost:${PORT}`);
  if (!process.env.JWT_SECRET) console.warn("Warning: JWT_SECRET is not set in .env - using an insecure development secret.");
});
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") console.error(`Port ${PORT} is already in use. Change PORT in .env (for example PORT=5051) and start again.`);
  else console.error("Server error:", err.code || err.message);
  process.exit(1);
});
