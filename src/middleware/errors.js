const { AppError } = require("../errors");

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Friendly messages for the most common setup problems (no balances, amounts or keys are ever included).
const DB_HINTS = {
  ER_NO_SUCH_TABLE: "The FinPay tables are missing in this database. Run database/schema.sql in MySQL.",
  ER_BAD_DB_ERROR: "The database named in .env (DB_NAME) does not exist. Run database/schema.sql, or fix DB_NAME.",
  ER_ACCESS_DENIED_ERROR: "MySQL refused the login. Check DB_USER and DB_PASSWORD in .env.",
  ER_BAD_FIELD_ERROR: "The database tables do not match this app. Re-run database/schema.sql on a fresh database.",
  ECONNREFUSED: "Cannot reach MySQL. Make sure MySQL is running and DB_HOST / DB_PORT in .env are correct.",
  ENOTFOUND: "Cannot find the MySQL host. Check DB_HOST in .env.",
  ETIMEDOUT: "MySQL did not respond in time. Check DB_HOST / DB_PORT in .env.",
  PROTOCOL_CONNECTION_LOST: "The MySQL connection was lost. Please try again.",
};

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof AppError) return res.status(err.status).json({ code: err.code, message: err.message });
  if (err.type === "entity.parse.failed") return res.status(400).json({ code: "BAD_JSON", message: "Request body is not valid JSON." });
  if (err.type === "entity.too.large") return res.status(413).json({ code: "TOO_LARGE", message: "Request is too large." });
  console.error("[finpay] request failed:", err.code || err.name); // code only: never log amounts, balances or keys
  const hint = DB_HINTS[err.code];
  if (hint) return res.status(503).json({ code: "DATABASE_UNAVAILABLE", message: hint });
  res.status(500).json({ code: "SERVER_ERROR", message: "Something went wrong. Please try again." });
}

module.exports = { wrap, errorHandler };
