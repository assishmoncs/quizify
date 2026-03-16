// Quizify — app.js

// ── State ──────────────────────────────────────────────────────────────────
let allQuestions = [];
let questions = [];
let currentMode = '';
let quizIndex = 0;
let quizAnswers = [];   // null=unanswered, -1=skipped, N=chosen index
let quizResults = [];   // 'correct','wrong','skipped'
let timerInterval = null;
let timerSeconds = 0;
let fileName = '';

// ── Parser ─────────────────────────────────────────────────────────────────
function parseJSON(raw) {
  let data;
  try { data = JSON.parse(raw); } catch(e) { throw new Error('Invalid JSON: ' + e.message); }
  let items = [];
  if (Array.isArray(data)) {
    items = data;
  } else if (data && typeof data === 'object') {
    if (Array.isArray(data.questions)) items = data.questions;
    else items = [data];
  }
  if (!items.length) throw new Error('No questions found in JSON.');
  const normalized = items.map((item, i) => normalize(item, i));
  const valid = normalized.filter(q => q !== null);
  if (!valid.length) throw new Error('No valid questions could be parsed.');
  return valid;
}

function normalize(item, idx) {
  // ── Extract question text ──
  const qText = item.question || item.q || item.ques || item.text || item.Question || '';
  if (!qText) return null;

  // ── Extract options ──
  let options = [];
  if (Array.isArray(item.options) && item.options.length) {
    options = item.options.map(String);
  } else if (Array.isArray(item.choices) && item.choices.length) {
    options = item.choices.map(String);
  } else if (Array.isArray(item.answers) && item.answers.length) {
    options = item.answers.map(String);
  } else {
    // option1..option4 or A..D
    const keys1 = ['option1','option2','option3','option4'];
    const keys2 = ['Option1','Option2','Option3','Option4'];
    const keys3 = ['A','B','C','D'];
    const try1 = keys1.map(k => item[k]).filter(v => v !== undefined && v !== '');
    const try2 = keys2.map(k => item[k]).filter(v => v !== undefined && v !== '');
    const try3 = keys3.map(k => item[k]).filter(v => v !== undefined && v !== '');
    if (try1.length >= 2) options = try1.map(String);
    else if (try2.length >= 2) options = try2.map(String);
    else if (try3.length >= 2) options = try3.map(String);
  }
  if (options.length < 2) return null;

  // ── Extract correct answer ──
  let correct = -1;
  const ca = item.correct !== undefined ? item.correct
           : item.answer !== undefined ? item.answer
           : item.correct_answer !== undefined ? item.correct_answer
           : item.answer_index !== undefined ? item.answer_index
           : item.answer_letter !== undefined ? item.answer_letter
           : item.answer_text !== undefined ? item.answer_text
           : item.correctAnswer !== undefined ? item.correctAnswer
           : undefined;
  if (ca === undefined) return null;

  if (typeof ca === 'number') {
    // 0-based or 1-based
    if (ca >= 0 && ca < options.length) correct = ca;
    else if (ca >= 1 && ca <= options.length) correct = ca - 1;
  } else if (typeof ca === 'string') {
    const s = ca.trim();
    // Letter A/B/C/D
    const letterMap = {A:0,B:1,C:2,D:3,a:0,b:1,c:2,d:3};
    if (letterMap[s] !== undefined && letterMap[s] < options.length) {
      correct = letterMap[s];
    } else {
      // Try matching text to option
      const idx2 = options.findIndex(o => o.trim().toLowerCase() === s.toLowerCase());
      if (idx2 !== -1) correct = idx2;
      else {
        // Try numeric string
        const n = parseInt(s, 10);
        if (!isNaN(n)) {
          if (n >= 0 && n < options.length) correct = n;
          else if (n >= 1 && n <= options.length) correct = n - 1;
        }
      }
    }
  }
  if (correct === -1) return null;

  const explanation = item.explanation || item.explain || item.rationale || item.reason || null;
  return { question: String(qText), options, correct, explanation: explanation ? String(explanation) : null };
}

// ── File Upload ────────────────────────────────────────────────────────────
document.getElementById('file-input').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  fileName = file.name;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      allQuestions = parseJSON(ev.target.result);
      questions = [...allQuestions];
      showSection('mode-section');
      document.getElementById('file-info').textContent =
        `✓ Loaded: ${fileName}  —  ${questions.length} question${questions.length!==1?'s':''}`;
      document.getElementById('upload-error').classList.add('hidden');
    } catch(err) {
      showError(err.message);
    }
  };
  reader.readAsText(file);
});

function showError(msg) {
  const el = document.getElementById('upload-error');
  el.textContent = '⚠ ' + msg;
  el.classList.remove('hidden');
}

// ── Section Helpers ────────────────────────────────────────────────────────
function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) { el.classList.remove('hidden'); el.classList.add('active'); }
}

function goBack() {
  stopTimer();
  quizIndex = 0;
  quizAnswers = [];
  quizResults = [];
  currentMode = '';
  showSection('mode-section');
  document.getElementById('timer-display').classList.add('hidden');
}

function resetQuiz() {
  stopTimer();
  questions = [...allQuestions];
  quizIndex = 0; quizAnswers = []; quizResults = []; currentMode = '';
  showSection('mode-section');
  document.getElementById('timer-display').classList.add('hidden');
  document.getElementById('file-info').textContent =
    `✓ Loaded: ${fileName}  —  ${questions.length} question${questions.length!==1?'s':''}`;
}

// ── Utilities ──────────────────────────────────────────────────────────────
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function shuffleQuestions() {
  questions = shuffleArray([...questions]);
  document.getElementById('file-info').textContent =
    `✓ Loaded: ${fileName}  —  ${questions.length} questions (shuffled)`;
}

function shuffleOptions() {
  questions = questions.map(q => {
    const paired = q.options.map((opt, i) => ({ opt, isCorrect: i === q.correct }));
    shuffleArray(paired);
    const newCorrect = paired.findIndex(p => p.isCorrect);
    return { ...q, options: paired.map(p => p.opt), correct: newCorrect };
  });
  document.getElementById('file-info').textContent =
    `✓ Loaded: ${fileName}  —  ${questions.length} questions (options shuffled)`;
}

function exportResult() {
  const data = {
    fileName, mode: currentMode,
    total: questions.length,
    correct: quizResults.filter(r=>r==='correct').length,
    wrong: quizResults.filter(r=>r==='wrong').length,
    skipped: quizResults.filter(r=>r==='skipped').length,
    score: calcPercent(),
    answers: questions.map((q,i) => ({
      question: q.question,
      userAnswer: quizAnswers[i] !== undefined && quizAnswers[i] !== null && quizAnswers[i] !== -1 ? q.options[quizAnswers[i]] : null,
      correctAnswer: q.options[q.correct],
      result: quizResults[i] || 'unanswered'
    }))
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'quizify-result.json';
  a.click();
}

function calcPercent() {
  const total = questions.length;
  const correct = quizResults.filter(r=>r==='correct').length;
  return total ? Math.round((correct/total)*100) : 0;
}

// ── READ MODE ──────────────────────────────────────────────────────────────
function startRead() {
  const container = document.getElementById('read-container');
  document.getElementById('read-count').textContent = `— ${questions.length} questions`;
  container.innerHTML = '';
  questions.forEach((q, i) => {
    const div = document.createElement('div');
    div.className = 'read-question';
    let opts = q.options.map((opt, j) => {
      const cls = j === q.correct ? 'opt-btn correct' : 'opt-btn';
      return `<button class="${cls}" disabled>${String.fromCharCode(65+j)}. ${esc(opt)}</button>`;
    }).join('');
    let exp = q.explanation ? `<div class="explanation"><strong>Explanation</strong>${esc(q.explanation)}</div>` : '';
    div.innerHTML = `
      <div class="q-number">Q ${i+1}</div>
      <div class="q-text">${esc(q.question)}</div>
      <div class="options-grid">${opts}</div>${exp}`;
    container.appendChild(div);
  });
  showSection('read-section');
}

// ── QUIZ MODE ──────────────────────────────────────────────────────────────
function startQuiz() {
  quizIndex = 0;
  quizAnswers = new Array(questions.length).fill(null);
  quizResults = new Array(questions.length).fill(null);
  renderQuizQuestion();
  showSection('quiz-section');
}

function renderQuizQuestion() {
  const q = questions[quizIndex];
  const total = questions.length;
  document.getElementById('quiz-progress').textContent = `Question ${quizIndex+1} of ${total}`;
  document.getElementById('progress-fill').style.width = ((quizIndex+1)/total*100)+'%';
  renderNavigator('quiz-navigator', 'quiz');
  const answered = quizAnswers[quizIndex];
  const locked = answered !== null;
  let opts = q.options.map((opt, j) => {
    let cls = 'opt-btn';
    if (locked) {
      if (j === q.correct) cls += ' correct';
      else if (j === answered) cls += ' selected-wrong';
    }
    const dis = locked ? 'disabled' : '';
    return `<button class="${cls}" ${dis} onclick="quizAnswer(${j})">${String.fromCharCode(65+j)}. ${esc(opt)}</button>`;
  }).join('');
  let exp = '';
  if (locked && q.explanation) exp = `<div class="explanation"><strong>Explanation</strong>${esc(q.explanation)}</div>`;
  document.getElementById('quiz-container').innerHTML = `
    <div class="q-number">Q ${quizIndex+1} / ${total}</div>
    <div class="q-text">${esc(q.question)}</div>
    <div class="options-grid">${opts}</div>${exp}`;
  const skipBtn = document.getElementById('quiz-skip');
  const nextBtn = document.getElementById('quiz-next');
  if (locked) { skipBtn.classList.add('hidden'); nextBtn.classList.remove('hidden'); }
  else { skipBtn.classList.remove('hidden'); nextBtn.classList.add('hidden'); }
}

function quizAnswer(j) {
  const q = questions[quizIndex];
  quizAnswers[quizIndex] = j;
  quizResults[quizIndex] = j === q.correct ? 'correct' : 'wrong';
  renderQuizQuestion();
}

function quizSkip() {
  quizAnswers[quizIndex] = -1;
  quizResults[quizIndex] = 'skipped';
  quizNext();
}

function quizNext() {
  if (quizIndex < questions.length - 1) {
    quizIndex++;
    renderQuizQuestion();
  } else {
    showResult('quiz');
  }
}

// ── TEST MODE ──────────────────────────────────────────────────────────────
function startTest() {
  quizIndex = 0;
  quizAnswers = new Array(questions.length).fill(null);
  quizResults = new Array(questions.length).fill(null);
  startTimerIfSet();
  renderTestQuestion();
  showSection('test-section');
}

function renderTestQuestion() {
  const q = questions[quizIndex];
  const total = questions.length;
  document.getElementById('test-progress').textContent = `Question ${quizIndex+1} of ${total}`;
  document.getElementById('test-progress-fill').style.width = ((quizIndex+1)/total*100)+'%';
  renderNavigator('test-navigator', 'test');
  const selected = quizAnswers[quizIndex];
  let opts = q.options.map((opt, j) => {
    let cls = 'opt-btn';
    if (selected === j) cls += ' selected-correct'; // neutral highlight in test
    return `<button class="${cls}" onclick="testAnswer(${j})">${String.fromCharCode(65+j)}. ${esc(opt)}</button>`;
  }).join('');
  document.getElementById('test-container').innerHTML = `
    <div class="q-number">Q ${quizIndex+1} / ${total}</div>
    <div class="q-text">${esc(q.question)}</div>
    <div class="options-grid">${opts}</div>`;
  document.getElementById('test-prev').disabled = quizIndex === 0;
  // Style selected in test mode (non-colored)
  // Already handled via class above
}

function testAnswer(j) {
  quizAnswers[quizIndex] = j;
  renderTestQuestion();
}

function testPrev() {
  if (quizIndex > 0) { quizIndex--; renderTestQuestion(); }
}

function testNext() {
  if (quizIndex < questions.length - 1) { quizIndex++; renderTestQuestion(); }
}

function testSubmit() {
  if (!confirm('Submit the test? You cannot change answers after submission.')) return;
  stopTimer();
  // Score answers
  questions.forEach((q, i) => {
    if (quizAnswers[i] === null) quizResults[i] = 'skipped';
    else if (quizAnswers[i] === q.correct) quizResults[i] = 'correct';
    else quizResults[i] = 'wrong';
  });
  showResult('test');
}

// ── NAVIGATOR ──────────────────────────────────────────────────────────────
function renderNavigator(containerId, mode) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  questions.forEach((_, i) => {
    const btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.textContent = i + 1;
    if (i === quizIndex) btn.classList.add('current');
    if (mode === 'quiz' && quizResults[i]) {
      btn.classList.add(quizResults[i] === 'correct' ? 'correct-nav' : quizResults[i] === 'skipped' ? 'skipped' : 'wrong-nav');
    }
    if (mode === 'test' && quizAnswers[i] !== null) btn.classList.add('answered');
    if (mode === 'test' && quizAnswers[i] === null && i < quizIndex) btn.classList.add('skipped');
    btn.onclick = () => { quizIndex = i; mode === 'quiz' ? renderQuizQuestion() : renderTestQuestion(); };
    container.appendChild(btn);
  });
}

// ── TIMER ──────────────────────────────────────────────────────────────────
function startTimerIfSet() {
  const mins = parseInt(document.getElementById('timer-input').value, 10);
  if (!mins || mins <= 0) return;
  timerSeconds = mins * 60;
  const display = document.getElementById('timer-display');
  display.classList.remove('hidden');
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timerSeconds--;
    updateTimerDisplay();
    if (timerSeconds <= 60) display.classList.add('warning');
    if (timerSeconds <= 0) { stopTimer(); testSubmit(); }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(timerSeconds / 60);
  const s = timerSeconds % 60;
  document.getElementById('timer-value').textContent =
    String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

// ── RESULT SCREEN ──────────────────────────────────────────────────────────
function showResult(mode) {
  currentMode = mode;
  const correct = quizResults.filter(r=>r==='correct').length;
  const wrong = quizResults.filter(r=>r==='wrong').length;
  const skipped = quizResults.filter(r=>r==='skipped').length;
  const total = questions.length;
  const pct = total ? Math.round((correct/total)*100) : 0;
  document.getElementById('result-percent').textContent = pct + '%';
  document.getElementById('result-title').textContent = mode === 'quiz' ? 'Quiz Complete!' : 'Test Results';
  document.getElementById('result-correct').textContent = correct;
  document.getElementById('result-wrong').textContent = wrong;
  document.getElementById('result-skipped').textContent = skipped;
  document.getElementById('result-total').textContent = total;
  // Review
  const rev = document.getElementById('review-container');
  rev.innerHTML = `<div class="review-header">Review Answers</div>`;
  questions.forEach((q, i) => {
    const res = quizResults[i] || 'skipped';
    const userIdx = quizAnswers[i];
    const userAns = (userIdx !== null && userIdx !== -1 && userIdx >= 0) ? q.options[userIdx] : 'Not answered';
    const div = document.createElement('div');
    div.className = `review-item r-${res}`;
    const badge = res === 'correct' ? '✓ Correct' : res === 'wrong' ? '✗ Wrong' : '— Skipped';
    let expHtml = q.explanation ? `<div class="explanation" style="margin-top:8px"><strong>Explanation</strong>${esc(q.explanation)}</div>` : '';
    div.innerHTML = `
      <div class="r-badge">${badge}</div>
      <div class="r-question">Q${i+1}: ${esc(q.question)}</div>
      <div class="r-answer">Your answer: <strong>${esc(userAns)}</strong> &nbsp;|&nbsp; Correct: <strong>${esc(q.options[q.correct])}</strong></div>
      ${expHtml}`;
    rev.appendChild(div);
  });
  showSection('result-section');
}

// ── MODE DISPATCHER ────────────────────────────────────────────────────────
function startMode(mode) {
  if (mode === 'read') startRead();
  else if (mode === 'quiz') startQuiz();
  else if (mode === 'test') startTest();
}

// ── Escape HTML ────────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
