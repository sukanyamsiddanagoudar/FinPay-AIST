const jwt = require("jsonwebtoken");
const { AppError } = require("../errors");

// Verifies the JWT. The student identity comes ONLY from the verified token (design: owner-only access).
module.exports = function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new AppError(401, "UNAUTHENTICATED", "Please sign in."));
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET || "development_secret_change_me");
    req.user = { id: p.id, name: p.name };
    next();
  } catch {
    next(new AppError(401, "UNAUTHENTICATED", "Your session has expired. Please sign in again."));
  }
};
