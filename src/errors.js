// An error the API deliberately sends to the client (safe message, no internals).
class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
module.exports = { AppError };
