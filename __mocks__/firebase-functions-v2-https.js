// Lightweight mock for firebase-functions/v2/https
class HttpsError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'HttpsError';
  }
}

module.exports = { HttpsError };
