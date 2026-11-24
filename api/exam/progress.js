import { getSql } from '../../lib/db.js';
import { route, readBody, bad, HttpError, isInt } from '../../lib/http.js';
import { requireStudent } from '../../lib/auth.js';
import { publicSession, SUBMIT_GRACE_MS } from '../../lib/exam.js';

export default route(['GET', 'PUT', 'DELETE'], async (req, res) => {
  const { uid } = requireStudent(req);
  const sql = getSql();

  if (req.method === 'GET') {
    const [row] = await sql`SELECT subject, questions, answers, current_index, end_time FROM exam_sessions WHERE user_id = ${uid}`;
    return res.json({ exam: row ? publicSession(row) : null, serverNow: Date.now() });
  }

  if (req.method === 'DELETE') {            // student exits the exam
    await sql`DELETE FROM exam_sessions WHERE user_id = ${uid}`;
    return res.json({ ok: true });
  }

  // PUT { q, a, index }  save one answer and/or the current question
  const { q, a, index } = readBody(req);
  const [row] = await sql`SELECT questions, end_time FROM exam_sessions WHERE user_id = ${uid}`;
  if (!row) throw new HttpError(404, 'No exam in progress');
  if (Date.now() > new Date(row.end_time).getTime() + SUBMIT_GRACE_MS) throw new HttpError(410, 'Time is up');

  const n = row.questions.length;
  const idx = isInt(index) && index >= 0 && index < n ? index : null;

  if (q !== undefined || a !== undefined) {
    if (!isInt(q) || q < 0 || q >= n || !isInt(a) || a < 0 || a >= row.questions[q].options.length) throw bad('Invalid answer');
    await sql`UPDATE exam_sessions
              SET answers = answers || jsonb_build_object(${String(q)}::text, ${a}::int),
                  current_index = COALESCE(${idx}::int, current_index)
              WHERE user_id = ${uid}`;
  } else if (idx !== null) {
    await sql`UPDATE exam_sessions SET current_index = ${idx}::int WHERE user_id = ${uid}`;
  }
  res.json({ ok: true });
});
