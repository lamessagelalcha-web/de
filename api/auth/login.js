import bcrypt from 'bcryptjs';
import { getSql } from '../../lib/db.js';
import { route, readBody, bad, HttpError } from '../../lib/http.js';
import { startSession, adminPasswordMatches } from '../../lib/auth.js';

export default route(['POST'], async (req, res) => {
  const b = readBody(req);

  if (b.role === 'admin') {
    if (!adminPasswordMatches(b.password || '')) throw new HttpError(401, 'Invalid admin password');
    startSession(req, res, { role: 'admin' });
    return res.json({ role: 'admin' });
  }

  const username = String(b.username || '').trim();
  const password = String(b.password || '');
  if (!username || !password) throw bad('Please enter username and password');

  const [u] = await getSql()`SELECT id, username, email, fullname, stream, password_hash
                              FROM users WHERE lower(username) = lower(${username})`;
  const ok = u && await bcrypt.compare(password, u.password_hash);
  if (!ok) throw new HttpError(401, 'Invalid username or password');

  startSession(req, res, { role: 'student', uid: u.id });
  res.json({ role: 'student', user: { username: u.username, email: u.email, fullname: u.fullname, stream: u.stream } });
});
