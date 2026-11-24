import bcrypt from 'bcryptjs';
import { getSql } from '../../lib/db.js';
import { route, readBody, bad, HttpError } from '../../lib/http.js';

export default route(['POST'], async (req, res) => {
  const sql = getSql();
  const b = readBody(req);
  const fullname = String(b.fullname || '').trim();
  const email = String(b.email || '').trim();
  const username = String(b.username || '').trim();
  const password = String(b.password || '');
  const stream = b.stream;

  if (!fullname || !email || !username || !password || !stream) throw bad('Please fill all fields');
  if (fullname.length > 100 || email.length > 150) throw bad('Name or email is too long');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Please enter a valid email address');
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) throw bad('Username must be 3-20 characters (letters, numbers, underscore)');
  if (password.length < 6 || password.length > 72) throw bad('Password must be 6-72 characters');
  if (!['natural-science', 'social-science'].includes(stream)) throw bad('Invalid stream');

  const clash = await sql`SELECT lower(username) = lower(${username}) AS u FROM users
                          WHERE lower(username) = lower(${username}) OR lower(email) = lower(${email}) LIMIT 1`;
  if (clash.length) throw new HttpError(409, clash[0].u ? 'Username already exists' : 'Email already registered');

  const hash = await bcrypt.hash(password, 10);
  try {
    await sql`INSERT INTO users (username, email, fullname, stream, password_hash)
              VALUES (${username}, ${email}, ${fullname}, ${stream}, ${hash})`;
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Username or email already registered');
    throw e;
  }
  res.status(201).json({ ok: true });
});
