import { getSql } from '../lib/db.js';
import { route, readBody, bad, isInt } from '../lib/http.js';
import { requireAny, requireAdmin } from '../lib/auth.js';

const SUBJECT = /^[a-z0-9-]{1,40}$/;

function cleanQuestions(list) {
  if (!Array.isArray(list) || !list.length) throw bad('No questions to save');
  if (list.length > 2000) throw bad('Too many questions in one import (max 2000)');
  return list.map((q, i) => {
    const text = String(q && q.text || '').trim();
    const options = Array.isArray(q && q.options) ? q.options.map(o => String(o).trim()) : [];
    if (!text || text.length > 5000) throw bad(`Question ${i + 1}: invalid text`);
    if (options.length < 2 || options.length > 8 || options.some(o => !o || o.length > 1000)) throw bad(`Question ${i + 1}: needs 2-8 non-empty options`);
    if (!isInt(q.correct) || q.correct < 0 || q.correct >= options.length) throw bad(`Question ${i + 1}: invalid correct answer`);
    return { text, options, correct: q.correct };
  });
}

export default route(['GET', 'POST', 'DELETE'], async (req, res) => {
  const sql = getSql();

  if (req.method === 'GET') {
    requireAny(req);
    const banks = await sql`SELECT subject, count(*)::int AS count FROM questions GROUP BY subject ORDER BY subject`;
    return res.json({ banks });
  }

  requireAdmin(req);

  if (req.method === 'POST') {
    const b = readBody(req);
    if (!SUBJECT.test(b.subject || '')) throw bad('Invalid subject');
    const subject = b.subject;
    const questions = cleanQuestions(b.questions);
    const replace = b.mode !== 'append';

    // one atomic statement: optionally delete the old bank, then insert the new questions in order
    await sql`
      WITH del AS (DELETE FROM questions WHERE subject = ${subject} AND ${replace}::boolean RETURNING 1),
      base AS (SELECT CASE WHEN ${replace}::boolean THEN 0
                           ELSE COALESCE((SELECT MAX(position) FROM questions WHERE subject = ${subject}), 0) END AS b)
      INSERT INTO questions (subject, position, text, options, correct)
      SELECT ${subject}::text, base.b + t.ord, t.q->>'text', t.q->'options', (t.q->>'correct')::int
      FROM base, jsonb_array_elements(${JSON.stringify(questions)}::jsonb) WITH ORDINALITY AS t(q, ord)`;

    const [{ n }] = await sql`SELECT count(*)::int AS n FROM questions WHERE subject = ${subject}`;
    return res.json({ saved: questions.length, total: n });
  }

  // DELETE ?subject=xxx  (results are kept, in-progress exams keep their own snapshot)
  const subject = String(req.query.subject || '');
  if (!SUBJECT.test(subject)) throw bad('Invalid subject');
  await sql`DELETE FROM questions WHERE subject = ${subject}`;
  res.json({ ok: true });
});
