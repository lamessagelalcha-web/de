import { getSql } from '../../lib/db.js';
import { route, readBody, HttpError } from '../../lib/http.js';
import { requireStudent } from '../../lib/auth.js';
import { cleanAnswers, SUBMIT_GRACE_MS } from '../../lib/exam.js';

export default route(['POST'], async (req, res) => {
  const { uid } = requireStudent(req);
  const sql = getSql();

  const [row] = await sql`SELECT subject, questions, answers, end_time FROM exam_sessions WHERE user_id = ${uid}`;
  if (!row) throw new HttpError(404, 'No exam in progress (it may already have been submitted)');

  // answers sent with the submit are accepted only until the timer (+ small grace) ends
  let answers = row.answers;
  if (Date.now() <= new Date(row.end_time).getTime() + SUBMIT_GRACE_MS) {
    answers = { ...answers, ...cleanAnswers(readBody(req).answers, row.questions) };
  }

  const total = row.questions.length;
  let correct = 0;
  row.questions.forEach((q, i) => { if (answers[i] === q.correct) correct++; });
  const score = Math.round((correct / total) * 100);

  // atomic: only records the result if THIS call removed the session (prevents double submits)
  const saved = await sql`
    WITH del AS (DELETE FROM exam_sessions WHERE user_id = ${uid} RETURNING user_id)
    INSERT INTO results (user_id, subject, score, correct, total)
    SELECT user_id, ${row.subject}::text, ${score}::int, ${correct}::int, ${total}::int FROM del
    RETURNING id`;
  if (!saved.length) throw new HttpError(409, 'This exam was already submitted');

  res.json({
    score, correct, total,
    details: row.questions.map((q, i) => ({
      text: q.text, options: q.options, correct: q.correct,
      answer: answers[i] === undefined ? null : answers[i]
    }))
  });
});
