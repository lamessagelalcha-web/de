/* PDF question importer.
   1) extractText(file)  -> reads the PDF with pdf.js and returns clean text lines
   2) parseQuestions(text) -> turns the text into question objects

   Supported layout (see README):
     1. Question text
     A. option   B. option   C. option   D. option
     Answer: B
   or put all answers at the end:
     Answer Key
     1-B  2-C  3-A ...
*/

const PdfImport = {
  async extractText(file) {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('pdf.js could not be loaded. Connect to the internet (or host pdf.js locally) and reload.');
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const lines = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      // group text pieces that share (roughly) the same vertical position into one line
      const rows = [];
      content.items.forEach(it => {
        if (!it.str || !it.str.trim()) return;
        const y = it.transform[5], x = it.transform[4];
        let row = rows.find(r => Math.abs(r.y - y) < 3);
        if (!row) { row = { y, parts: [] }; rows.push(row); }
        row.parts.push({ x, s: it.str });
      });
      rows.sort((a, b) => b.y - a.y);
      rows.forEach(r => {
        r.parts.sort((a, b) => a.x - b.x);
        lines.push(r.parts.map(p => p.s).join(' ').replace(/\s+/g, ' ').trim());
      });
    }
    return lines.join('\n');
  },

  parseQuestions(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const qs = [];
    const warnings = [];
    let cur = null;
    let keyMode = false;
    const keyMap = {};

    const qStart = /^(?:Q(?:uestion)?\s*)?(\d{1,3})\s*[.)\-:]\s*(.+)$/i;
    const optStart = /^\(?([A-H])[.)]\s*(.+)$/i;
    const ansLine = /^(?:answer|ans|correct(?:\s*answer)?)\s*[:\-.=]?\s*\(?([A-H])\)?\b/i;
    const keyHeader = /^(?:answer\s*key|answers|answer\s*sheet|key)\b/i;

    const addOptions = (q, line) => {
      // handles "A. x B. y C. z D. w" on a single line too
      const parts = line.split(/\s+(?=\(?[A-H][.)]\s)/i);
      parts.forEach(part => {
        const m = part.match(optStart);
        if (m) q.options.push({ letter: m[1].toUpperCase(), text: m[2].trim() });
        else if (q.options.length) q.options[q.options.length - 1].text += ' ' + part;
      });
    };

    for (const line of lines) {
      if (keyHeader.test(line) && !ansLine.test(line)) { keyMode = true; if (cur) qs.push(cur); cur = null; continue; }

      if (keyMode) {
        const re = /(\d{1,3})\s*[.):\-]?\s*\(?([A-H])\)?(?![a-z])/gi;
        let m;
        while ((m = re.exec(line)) !== null) keyMap[parseInt(m[1], 10)] = m[2].toUpperCase();
        continue;
      }

      const a = line.match(ansLine);
      if (a && cur) { cur.answer = a[1].toUpperCase(); continue; }

      const expected = qs.length + (cur && !qs.includes(cur) ? 1 : 0) + 1;
      const qm = line.match(qStart);
      if (qm && parseInt(qm[1], 10) === expected && !(cur && cur.options.length === 0 && false)) {
        if (cur) qs.push(cur);
        cur = { num: parseInt(qm[1], 10), text: qm[2].trim(), options: [], answer: null };
        continue;
      }

      if (!cur) continue;

      if (optStart.test(line)) { addOptions(cur, line); continue; }

      // continuation line
      if (cur.options.length) cur.options[cur.options.length - 1].text += ' ' + line;
      else cur.text += ' ' + line;
    }
    if (cur) qs.push(cur);

    // build final question objects
    const result = [];
    qs.forEach(q => {
      const letter = q.answer || keyMap[q.num];
      if (q.options.length < 2) { warnings.push(`Question ${q.num}: fewer than 2 options found – skipped.`); return; }
      if (!letter) { warnings.push(`Question ${q.num}: no answer found – skipped.`); return; }
      const idx = q.options.findIndex(o => o.letter === letter);
      if (idx === -1) { warnings.push(`Question ${q.num}: answer "${letter}" does not match any option – skipped.`); return; }
      result.push({
        id: result.length + 1,
        text: q.text,
        options: q.options.map(o => o.text),
        correct: idx
      });
    });

    return { questions: result, warnings };
  }
};
