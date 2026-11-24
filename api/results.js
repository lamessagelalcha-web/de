import { getSql } from '../lib/db.js';
import { route } from '../lib/http.js';
import { requireStudent } from '../lib/auth.js';

export default route(['GET'], async (req, res) => {
  const { uid } = requireStudent(req);
  const results = await getSql()`SELECT subject, score, correct, total, created_at AS date
                                 FROM results WHERE user_id = ${uid} ORDER BY created_at DESC`;
  res.json({ results });
});
