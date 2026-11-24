import { isInt } from './http.js';

export const EXAM_SECONDS = 2 * 60 * 60;   // 2 hours per exam
export const SUBMIT_GRACE_MS = 60 * 1000;  // late answers accepted for 60s after the timer ends

/* what the browser may see: the questions WITHOUT the correct answers */
export function publicSession(row) {
  return {
    subject: row.subject,
    questions: row.questions.map(q => ({ text: q.text, options: q.options })),
    answers: row.answers,
    index: Math.min(row.current_index, row.questions.length - 1),
    endTime: new Date(row.end_time).getTime()
  };
}

/* keep only well-formed { questionIndex: optionIndex } pairs */
export function cleanAnswers(input, questions) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input)) {
    const q = Number(k);
    if (isInt(q) && isInt(v) && questions[q] && v >= 0 && v < questions[q].options.length) out[q] = v;
  }
  return out;
}
