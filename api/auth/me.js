import { getSql } from '../../lib/db.js';
import { route } from '../../lib/http.js';
import { getSession } from '../../lib/auth.js';

export default route(['GET'], async (req, res) => {
  const s = getSession(req);
  if (!s) return res.json({ role: null });
  if (s.role === 'admin') return res.json({ role: 'admin' });

  const [u] = await getSql()`SELECT username, email, fullname, stream FROM users WHERE id = ${s.uid}`;
  if (!u) return res.json({ role: null });
  res.json({ role: 'student', user: u });
});
