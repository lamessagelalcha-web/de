import { getSql } from '../../lib/db.js';
import { route, readBody, bad, HttpError } from '../../lib/http.js';
import { requireStudent } from '../../lib/auth.js';
import { EXAM_SECONDS, publicSession } from '../../lib/exam.js';

export default route(['POST'], async (req, res) => {
  const { uid } = requireStudent(req);
  const sql = getSql();
  const subject = String(readBody(req).subject || '');
  if (!/^[a-z0-9-]{1,40}$/.test(subject)) throw bad('Invalid subject');

  const bank = await sql`SELECT text, options, correct FROM questions WHERE subject = ${subject} ORDER BY position, id`;
  if (!bank.length) throw new HttpError(404, 'No questions available for this subject');

  const end = new Date(Date.now() + EXAM_SECONDS * 1000);
  const rows = await sql`INSERT INTO exam_sessions (user_id, subject, questions, end_time)
                         VALUES (${uid}, ${subject}, ${JSON.stringify(bank)}::jsonb, ${end.toISOString()})
                         ON CONFLICT (user_id) DO NOTHING
                         RETURNING subject, questions, answers, current_index, end_time`;
  if (!rows.length) throw new HttpError(409, 'You already have an exam in progress');
  res.json({ exam: publicSession(rows[0]), serverNow: Date.now() });
});
