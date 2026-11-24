/* Dembi Dolloo Online Exam System – main application logic.
   All data (students, questions, progress, results) now lives in Postgres behind the /api routes. */

let currentUser = null;   // student object
let isAdmin = false;
let exam = null;          // { subject, questions[{text,options}], answers, index, endTime }
let clockOffset = 0;      // server time minus browser time, so the timer can't be cheated by changing the PC clock
let timer = null;
let submitting = false;
let pendingImport = null; // { subject, questions }
let banks = {};           // subject -> number of questions
const pendingSaves = new Set();

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const subjectLabel = k => k.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const slug = s => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fmtDate = iso => new Date(iso).toLocaleString();
const serverNow = () => Date.now() + clockOffset;

function showNotification(message, type = 'info') {
  const n = document.createElement('div');
  n.className = type === 'error' ? 'error-message' : type === 'success' ? 'success-message' : 'info-message';
  n.textContent = message;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 4000);
}

function showOnly(id) {
  ['login-section', 'registration-section', 'admin-dashboard', 'student-dashboard']
    .forEach(s => $(s).classList.toggle('hidden', s !== id));
}

/* central error handler: an expired login sends the user back to the login page */
function fail(e) {
  console.error(e);
  if (e.status === 401 && (currentUser || isAdmin)) {
    clearInterval(timer);
    currentUser = null; isAdmin = false; exam = null;
    showOnly('login-section');
    return showNotification('Your session expired. Please log in again.', 'error');
  }
  showNotification(e.message || 'Something went wrong', 'error');
}

function setBusy(btn, busy, label) {
  btn.disabled = busy;
  if (label) btn.innerHTML = busy ? '<span class="loading-spinner"></span> Please wait...' : label;
}

/* ---------- login / registration navigation ---------- */
function switchToAdminLogin() {
  $('admin-login-form').classList.remove('hidden');
  $('student-login-form').classList.add('hidden');
  $('tab-admin').className = 'btn btn-primary grow';
  $('tab-student').className = 'btn btn-secondary grow';
}
function switchToStudentLogin() {
  $('admin-login-form').classList.add('hidden');
  $('student-login-form').classList.remove('hidden');
  $('tab-admin').className = 'btn btn-secondary grow';
  $('tab-student').className = 'btn btn-primary grow';
}
function switchToRegistration() { showOnly('registration-section'); }
function switchToLogin() { showOnly('login-section'); }

/* ---------- auth ---------- */
async function registerStudent() {
  const fullname = $('reg-fullname').value.trim();
  const email = $('reg-email').value.trim();
  const username = $('reg-username').value.trim();
  const password = $('reg-password').value;
  const stream = $('reg-stream').value;

  if (!fullname || !email || !username || !password || !stream) return showNotification('Please fill all fields', 'error');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showNotification('Please enter a valid email address', 'error');
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return showNotification('Username must be 3-20 characters (letters, numbers, underscore)', 'error');
  if (password.length < 6) return showNotification('Password must be at least 6 characters', 'error');

  try {
    await api('auth/register', { method: 'POST', body: { fullname, email, username, password, stream } });
    ['reg-fullname', 'reg-email', 'reg-username', 'reg-password', 'reg-stream'].forEach(id => $(id).value = '');
    showNotification('Registration successful! Please log in.', 'success');
    switchToLogin();
  } catch (e) { fail(e); }
}

async function loginStudent() {
  const username = $('student-username').value.trim();
  const password = $('student-password').value;
  if (!username || !password) return showNotification('Please enter username and password', 'error');
  try {
    const r = await api('auth/login', { method: 'POST', body: { role: 'student', username, password } });
    currentUser = r.user;
    isAdmin = false;
    $('student-username').value = '';
    $('student-password').value = '';
    showStudentDashboard();
  } catch (e) { fail(e); }
}

async function loginAdmin() {
  const password = $('admin-password').value;
  try {
    await api('auth/login', { method: 'POST', body: { role: 'admin', password } });
    isAdmin = true;
    currentUser = null;
    $('admin-password').value = '';
    showAdminDashboard();
  } catch (e) { fail(e); }
}

async function logout() {
  clearInterval(timer);
  try { await api('auth/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
  currentUser = null; isAdmin = false; exam = null;
  showOnly('login-section');
}

/* ---------- admin ---------- */
function showAdminDashboard() {
  showOnly('admin-dashboard');
  renderAdmin();
}

async function loadBanks() {
  const r = await api('banks');
  banks = {};
  r.banks.forEach(b => { banks[b.subject] = b.count; });
}

async function renderAdmin() {
  try {
    const [ov] = await Promise.all([api('admin/overview'), loadBanks()]);
    const { users, results } = ov;

    $('total-students').textContent = users.length;
    $('active-exams').textContent = ov.activeExams;
    $('total-attempts').textContent = results.length;

    const keys = Object.keys(banks);
    $('banks-table-body').innerHTML = keys.length
      ? keys.map(k => `<tr><td>${esc(subjectLabel(k))}</td><td>${banks[k]}</td>
          <td><button class="btn btn-danger btn-sm" onclick="resetQuestions('${esc(k)}')">Reset</button></td></tr>`).join('')
      : '<tr><td colspan="3" class="center muted">No questions imported yet. Import a PDF above.</td></tr>';

    let rows = '';
    users.forEach(u => {
      const mine = results.filter(r => r.username === u.username);
      const stream = u.stream === 'natural-science' ? 'Natural Science' : 'Social Science';
      const base = `<td>${esc(u.fullname)}</td><td>${esc(u.username)}</td><td>${esc(u.email)}</td><td>${stream}</td>`;
      if (!mine.length) rows += `<tr>${base}<td colspan="3"><span class="badge badge-warning">Pending</span></td></tr>`;
      else mine.forEach(r => rows += `<tr>${base}<td>${esc(subjectLabel(r.subject))}</td><td><strong>${r.score}%</strong> (${r.correct}/${r.total})</td><td>${fmtDate(r.date)}</td></tr>`);
    });
    $('students-table-body').innerHTML = rows || '<tr><td colspan="7" class="center muted">No students registered yet</td></tr>';
  } catch (e) { fail(e); }
}

function onSubjectChange() {
  $('custom-subject-group').classList.toggle('hidden', $('subject-select').value !== 'custom');
}

function chosenSubjectKey() {
  const sel = $('subject-select').value;
  if (!sel) { showNotification('Please select a subject', 'error'); return null; }
  if (sel === 'custom') {
    const k = slug($('custom-subject-name').value).slice(0, 40);
    if (!k) { showNotification('Please enter the custom subject name', 'error'); return null; }
    return k;
  }
  return sel;
}

async function readPdf() {
  const subject = chosenSubjectKey();
  if (!subject) return;
  const file = $('file-upload').files[0];
  if (!file) return showNotification('Please select a PDF file', 'error');
  if (!/\.pdf$/i.test(file.name)) return showNotification('Only PDF files are supported', 'error');

  const btn = $('read-pdf-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="loading-spinner"></span> Reading PDF...';
  try {
    const text = await PdfImport.extractText(file);
    const { questions, warnings } = PdfImport.parseQuestions(text);
    pendingImport = { subject, questions };
    renderPreview(subject, questions, warnings);
  } catch (e) {
    console.error(e);
    showNotification('Could not read PDF: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Read PDF & Preview';
  }
}

function renderPreview(subject, questions, warnings) {
  const box = $('import-preview');
  if (!questions.length) {
    box.innerHTML = `<div class="warn">No valid questions were found in this PDF. Check the format in the README.</div>` +
      warnings.slice(0, 10).map(w => `<div class="warn">${esc(w)}</div>`).join('');
    return;
  }
  const exists = banks[subject] || 0;
  box.innerHTML = `
    <div class="preview-box">
      <strong>${questions.length} question(s) found for ${esc(subjectLabel(subject))}</strong>
      ${warnings.length ? `<div class="warn">${warnings.length} item(s) skipped:<br>${warnings.slice(0, 8).map(esc).join('<br>')}${warnings.length > 8 ? '<br>...' : ''}</div>` : ''}
      <div class="preview-list">
        ${questions.map((q, i) => `<div class="pq"><strong>${i + 1}.</strong> ${esc(q.text)}<br>
          ${q.options.map((o, j) => `${j === q.correct ? '✅' : '▫️'} ${String.fromCharCode(65 + j)}. ${esc(o)}`).join(' &nbsp; ')}</div>`).join('')}
      </div>
      <div class="row gap10">
        <button class="btn btn-success" onclick="saveImport('replace')">${exists ? 'Replace existing (' + exists + ')' : 'Save Questions'}</button>
        ${exists ? '<button class="btn btn-primary" onclick="saveImport(\'append\')">Add to existing</button>' : ''}
        <button class="btn btn-secondary" onclick="cancelImport()">Cancel</button>
      </div>
    </div>`;
}

async function saveImport(mode) {
  if (!pendingImport) return;
  const { subject, questions } = pendingImport;
  const buttons = $('import-preview').querySelectorAll('button');
  buttons.forEach(b => b.disabled = true);
  try {
    const r = await api('banks', { method: 'POST', body: { subject, mode, questions } });
    showNotification(`${r.saved} question(s) saved for ${subjectLabel(subject)} (total ${r.total})`, 'success');
    cancelImport();
    $('file-upload').value = '';
    renderAdmin();
  } catch (e) {
    buttons.forEach(b => b.disabled = false);
    fail(e);
  }
}

function cancelImport() {
  pendingImport = null;
  $('import-preview').innerHTML = '';
}

async function resetQuestions(subject) {
  if (!confirm(`Delete all questions for ${subjectLabel(subject)}? Student results are kept.`)) return;
  try {
    await api('banks?subject=' + encodeURIComponent(subject), { method: 'DELETE' });
    showNotification(`Questions for ${subjectLabel(subject)} were reset.`, 'success');
    renderAdmin();
  } catch (e) { fail(e); }
}

/* ---------- student dashboard ---------- */
async function showStudentDashboard() {
  showOnly('student-dashboard');
  $('exam-start-section').classList.remove('hidden');
  $('exam-section').classList.add('hidden');
  $('results-section').classList.add('hidden');
  $('student-name').textContent = currentUser.fullname || currentUser.username;
  $('student-stream').textContent = currentUser.stream === 'natural-science' ? 'Natural Science' : 'Social Science';

  try {
    // resume an unfinished exam after a refresh / reopen (any computer, same account)
    const d = await api('exam/progress');
    if (d.exam) {
      setExam(d.exam, d.serverNow);
      if (exam.endTime <= serverNow()) return submitExam(true);
      showNotification('Resuming your exam in progress', 'info');
      return openExamScreen();
    }
    await Promise.all([renderExamButtons(), loadStudentResults()]);
  } catch (e) { fail(e); }
}

async function renderExamButtons() {
  await loadBanks();
  const keys = Object.keys(banks).filter(k => banks[k] > 0);
  const icons = { mathematics: '📐', english: '📚', aptitude: '🧠' };
  $('exam-buttons').innerHTML = keys.length
    ? keys.map(k => `<button class="btn btn-primary" onclick="startExam('${esc(k)}')">
        <span style="font-size:22px">${icons[k] || '📝'}</span><span>${esc(subjectLabel(k))}</span>
        <span style="font-size:12px;font-weight:400">${banks[k]} questions</span></button>`).join('')
    : '<p class="muted">No exams have been published yet. Please check back later.</p>';
}

async function loadStudentResults() {
  const { results } = await api('results');
  $('student-results-container').innerHTML = results.length
    ? `<table class="table"><thead><tr><th>Subject</th><th>Score</th><th>Date</th></tr></thead><tbody>${
        results.map(r => `<tr><td>${esc(subjectLabel(r.subject))}</td><td><strong>${r.score}%</strong> (${r.correct}/${r.total})</td><td>${fmtDate(r.date)}</td></tr>`).join('')
      }</tbody></table>`
    : '<p class="center muted">No exam results yet</p>';
}

/* ---------- exam ---------- */
function setExam(d, now) {
  clockOffset = now - Date.now();
  exam = {
    subject: d.subject,
    questions: d.questions,
    answers: d.answers || {},
    index: d.index || 0,
    endTime: d.endTime
  };
}

/* fire-and-forget save that submitExam can wait for */
function track(promise) {
  pendingSaves.add(promise);
  promise.catch(e => {
    if (e.status === 410) { showNotification('Time is up! Submitting your exam.', 'info'); submitExam(true); }
    else fail(e);
  }).finally(() => pendingSaves.delete(promise));
}

async function startExam(subject) {
  try {
    const d = await api('exam/start', { method: 'POST', body: { subject } });
    setExam(d.exam, d.serverNow);
    openExamScreen();
  } catch (e) {
    if (e.status === 409) return showStudentDashboard();   // an exam is already open – resume it
    fail(e);
  }
}

function openExamScreen() {
  $('exam-start-section').classList.add('hidden');
  $('results-section').classList.add('hidden');
  $('exam-section').classList.remove('hidden');
  $('exam-title').textContent = `${subjectLabel(exam.subject)} Exam`;
  renderNavigator();
  displayQuestion();
  startTimer();
}

function displayQuestion() {
  const q = exam.questions[exam.index];
  if (!q) return;
  $('exam-content').innerHTML = `
    <div class="question-card">
      <div class="question-number">Question ${exam.index + 1} of ${exam.questions.length}</div>
      <div class="question-text">${esc(q.text)}</div>
      <div class="options">
        ${q.options.map((o, i) => `<label class="option-label">
          <input type="radio" name="answer" ${exam.answers[exam.index] === i ? 'checked' : ''} onchange="selectAnswer(${i})">
          <span>${String.fromCharCode(65 + i)}. ${esc(o)}</span></label>`).join('')}
      </div>
    </div>`;
}

function selectAnswer(i) {
  exam.answers[exam.index] = i;
  renderNavigator();
  track(api('exam/progress', { method: 'PUT', body: { q: exam.index, a: i, index: exam.index } }));
}

function renderNavigator() {
  $('question-navigator').innerHTML = exam.questions.map((_, i) =>
    `<button class="q-nav-btn ${i === exam.index ? 'active' : ''} ${exam.answers[i] !== undefined ? 'answered' : ''}" onclick="goToQuestion(${i})">${i + 1}</button>`).join('');
}

function goToQuestion(i) {
  exam.index = i;
  displayQuestion();
  renderNavigator();
  api('exam/progress', { method: 'PUT', body: { index: i } }).catch(() => {});   // remember position; not critical
}
function nextQuestion() { if (exam.index < exam.questions.length - 1) goToQuestion(exam.index + 1); }
function previousQuestion() { if (exam.index > 0) goToQuestion(exam.index - 1); }

function startTimer() {
  clearInterval(timer);
  const tick = () => {
    const left = Math.ceil((exam.endTime - serverNow()) / 1000);
    if (left <= 0) { clearInterval(timer); showNotification('Time is up! Submitting your exam.', 'info'); return submitExam(true); }
    const h = String(Math.floor(left / 3600)).padStart(2, '0');
    const m = String(Math.floor((left % 3600) / 60)).padStart(2, '0');
    const s = String(left % 60).padStart(2, '0');
    $('timer-display').textContent = `Time Remaining: ${h}:${m}:${s}`;
  };
  tick();
  timer = setInterval(tick, 1000);
}

async function submitExam(auto) {
  if (!exam || submitting) return;
  if (!auto) {
    const unanswered = exam.questions.length - Object.keys(exam.answers).length;
    const msg = unanswered ? `You have ${unanswered} unanswered question(s). Submit anyway?` : 'Submit your exam now?';
    if (!confirm(msg)) return;
  }
  submitting = true;
  clearInterval(timer);
  try {
    await Promise.allSettled([...pendingSaves]);
    const r = await api('exam/submit', { method: 'POST', body: { answers: exam.answers } });

    $('exam-start-section').classList.add('hidden');
    $('exam-section').classList.add('hidden');
    $('results-section').classList.remove('hidden');
    $('final-score').textContent = r.score + '%';
    $('correct-count').textContent = r.correct;
    $('total-questions').textContent = r.total;
    $('results-detail').innerHTML = r.details.map((q, i) => {
      const ok = q.answer === q.correct;
      return `<div class="result-display ${ok ? '' : 'incorrect'}">
        <div style="font-weight:600;margin-bottom:10px">Question ${i + 1}: ${ok ? '✓ Correct' : '✗ Incorrect'}</div>
        <div style="margin-bottom:8px"><strong>Question:</strong> ${esc(q.text)}</div>
        <div style="margin-bottom:8px"><strong>Your Answer:</strong> ${q.answer !== null ? esc(q.options[q.answer]) : 'Not answered'}</div>
        <div><strong>Correct Answer:</strong> ${esc(q.options[q.correct])}</div></div>`;
    }).join('');
    exam = null;
  } catch (e) {
    if (e.status === 404 || e.status === 409) {   // already submitted elsewhere
      exam = null;
      showNotification(e.message, 'info');
      return backToDashboard();
    }
    fail(e);
    if (exam && exam.endTime > serverNow()) startTimer();
  } finally {
    submitting = false;
  }
}

async function exitExam() {
  if (!confirm('Exit the exam? Your answers will be discarded and the exam closed.')) return;
  clearInterval(timer);
  try {
    await Promise.allSettled([...pendingSaves]);
    await api('exam/progress', { method: 'DELETE' });
    exam = null;
    backToDashboard();
  } catch (e) { fail(e); if (exam) startTimer(); }
}

async function backToDashboard() {
  $('exam-section').classList.add('hidden');
  $('results-section').classList.add('hidden');
  $('exam-start-section').classList.remove('hidden');
  try { await Promise.all([renderExamButtons(), loadStudentResults()]); } catch (e) { fail(e); }
}

/* ---------- startup: restore the login (server-side cookie) ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  switchToStudentLogin();
  try {
    const me = await api('auth/me');
    if (me.role === 'admin') { isAdmin = true; return showAdminDashboard(); }
    if (me.role === 'student') { currentUser = me.user; return showStudentDashboard(); }
  } catch (e) { console.error(e); }
});

/* Enter key submits the login forms */
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (!$('login-section').classList.contains('hidden')) {
    $('admin-login-form').classList.contains('hidden') ? loginStudent() : loginAdmin();
  }
});
