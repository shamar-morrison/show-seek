// Lightweight mock for firebase-functions/v2/https
class HttpsError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'HttpsError';
  }
}

const onCall = (_options, handler) => handler;
const onRequest = (_options, handler) => handler;

module.exports = { HttpsError, onCall, onRequest };
