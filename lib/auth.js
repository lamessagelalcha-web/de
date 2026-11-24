import crypto from 'node:crypto';
import { HttpError } from './http.js';

const COOKIE = 'dd_token';
const MAX_AGE_DAYS = 7;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error('AUTH_SECRET is missing or too short');
  return s;
}
const mac = body => crypto.createHmac('sha256', secret()).update(body).digest('base64url');

export function signToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + MAX_AGE_DAYS * 864e5 })).toString('base64url');
  return body + '.' + mac(body);
}

export function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const good = mac(body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

function readCookie(req, name) {
  const h = req.headers.cookie || '';
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function startSession(req, res, payload) {
  const secure = (req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `${COOKIE}=${signToken(payload)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${MAX_AGE_DAYS * 86400}${secure}`);
}
export function endSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

export const getSession = req => verifyToken(readCookie(req, COOKIE));

export function requireStudent(req) {
  const s = getSession(req);
  if (!s || s.role !== 'student') throw new HttpError(401, 'Please log in');
  return s; // { role, uid }
}
export function requireAdmin(req) {
  const s = getSession(req);
  if (!s || s.role !== 'admin') throw new HttpError(401, 'Admin login required');
  return s;
}
export function requireAny(req) {
  const s = getSession(req);
  if (!s) throw new HttpError(401, 'Please log in');
  return s;
}

/* constant-time comparison of the admin password */
export function adminPasswordMatches(input) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error('ADMIN_PASSWORD is not set');
  const h = v => crypto.createHash('sha256').update(String(v)).digest();
  return crypto.timingSafeEqual(h(input), h(expected));
}
