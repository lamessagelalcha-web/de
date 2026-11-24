import { getSql } from '../../lib/db.js';
import { route } from '../../lib/http.js';
import { requireAdmin } from '../../lib/auth.js';

export default route(['GET'], async (req, res) => {
  requireAdmin(req);
  const sql = getSql();
  const [users, results, active] = await Promise.all([
    sql`SELECT username, email, fullname, stream FROM users ORDER BY created_at`,
    sql`SELECT u.username, r.subject, r.score, r.correct, r.total, r.created_at AS date
        FROM results r JOIN users u ON u.id = r.user_id ORDER BY r.created_at`,
    sql`SELECT count(*)::int AS n FROM exam_sessions`
  ]);
  res.json({ users, results, activeExams: active[0].n });
});
