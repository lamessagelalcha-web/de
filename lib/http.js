import { ensureSchema } from './db.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const bad = msg => new HttpError(400, msg);

/* Wraps an API handler: method check, no-store caching, schema init, JSON errors. */
export function route(methods, fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!methods.includes(req.method)) {
      res.setHeader('Allow', methods.join(', '));
      return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
      await ensureSchema();
      await fn(req, res);
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
      console.error(e);
      res.status(500).json({ error: 'Server error. Please try again.' });
    }
  };
}

export function readBody(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { throw bad('Invalid JSON'); } }
  return b && typeof b === 'object' ? b : {};
}

export const isInt = n => Number.isInteger(n);
