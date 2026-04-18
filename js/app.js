// Application State
const state = {
  allQuestions: [],
  questions: [],
  currentMode: '',
  quizIndex: 0,
  quizAnswers: [],
  quizResults: [],
  timerInterval: null,
  timerSeconds: 0,
  fileName: '',
  parseMeta: { skipped: 0, total: 0, warnings: [] }
};

// Constants
const CONSTANTS = {
  sectionIds: ['upload-section', 'mode-section', 'read-section', 'quiz-section', 'test-section', 'result-section'],
  quizCollections: ['questions', 'quiz', 'quizzes', 'items', 'data', 'entries'],
  questionTextKeys: ['question', 'q', 'ques', 'text', 'prompt', 'title', 'Question'],
  explanationKeys: ['explanation', 'explain', 'rationale', 'reason', 'note', 'details'],
  metadataKeys: ['topic', 'difficulty', 'tag', 'chapter', 'module', 'subject'],
  metadataTextKeys: ['text', 'label', 'name', 'title', 'value'],
  answerKeys: [
    'correct', 'answer', 'correct_answer', 'answer_index', 'answer_letter', 'answer_text',
    'correctAnswer', 'correctIndex', 'correctOption', 'correct_choice', 'correctChoice',
    'correct_option', 'solution', 'solutionIndex', 'solutionText'
  ]
};



// DOM Cache - lazy loaded for performance
const dom = {};

function getDom() {
  if (!dom.fileInput) {
    Object.assign(dom, {
      fileInput: document.getElementById('file-input'),
      uploadError: document.getElementById('upload-error'),
      uploadSummary: document.getElementById('upload-summary'),
      fileInfo: document.getElementById('file-info'),
      parserDetails: document.getElementById('parser-details'),
      timerDisplay: document.getElementById('timer-display'),
      timerValue: document.getElementById('timer-value'),
      timerInput: document.getElementById('timer-input'),
      themeToggle: document.getElementById('theme-toggle'),
      readCount: document.getElementById('read-count'),
      readContainer: document.getElementById('read-container'),
      quizProgress: document.getElementById('quiz-progress'),
      quizFill: document.getElementById('progress-fill'),
      quizContainer: document.getElementById('quiz-container'),
      quizSkip: document.getElementById('quiz-skip'),
      quizNext: document.getElementById('quiz-next'),
      testProgress: document.getElementById('test-progress'),
      testFill: document.getElementById('test-progress-fill'),
      testContainer: document.getElementById('test-container'),
      resultPercent: document.getElementById('result-percent'),
      resultTitle: document.getElementById('result-title'),
      resultCorrect: document.getElementById('result-correct'),
      resultWrong: document.getElementById('result-wrong'),
      resultSkipped: document.getElementById('result-skipped'),
      resultTotal: document.getElementById('result-total'),
      reviewContainer: document.getElementById('review-container')
    });
  }
  return dom;
}

// Initialize
function init() {
  const d = getDom();
  d.fileInput?.addEventListener('change', handleFileSelection);
  d.themeToggle?.addEventListener('click', toggleTheme);
  initializeTheme();
  updateTimerDisplay();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function initializeTheme() {
  const savedTheme = window.localStorage.getItem('quizify-theme');
  const preferredTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(savedTheme || preferredTheme);
}

function toggleTheme() {
  const nextTheme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  window.localStorage.setItem('quizify-theme', theme);
  dom.themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}

function handleFileSelection(event) {
  const [file] = event.target.files || [];
  if (!file) return;

  const d = getDom();
  clearMessages();

  if (!file.name.toLowerCase().endsWith('.json')) {
    showError('Please choose a valid JSON file with a .json extension.');
    d.fileInput.value = '';
    return;
  }

  if (file.size === 0) {
    showError('The selected file is empty.');
    d.fileInput.value = '';
    return;
  }

  state.fileName = file.name;
  const reader = new FileReader();

  reader.onload = ({ target }) => {
    try {
      const result = parseJSON(target.result);
      state.allQuestions = result.questions;
      state.questions = cloneQuestions(state.allQuestions);
      state.parseMeta = result.meta;
      renderLoadedState();
      showSection('mode-section');
    } catch (error) {
      resetLoadedData();
      showSection('upload-section');
      showError(error.message);
    }
  };

  reader.onerror = () => {
    resetLoadedData();
    showError('The file could not be read. Please try again.');
  };

  reader.readAsText(file);
}

function parseJSON(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('The file does not contain readable JSON.');
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error.message}`);
  }

  const items = extractQuestionItems(data);
  if (!items.length) {
    throw new Error('No questions were found in the uploaded JSON.');
  }

  const normalized = [];
  const invalidEntries = [];

  for (let i = 0; i < items.length; i++) {
    try {
      const question = normalizeQuestion(items[i]);
      if (question) {
        normalized.push(question);
      } else {
        invalidEntries.push(i + 1);
      }
    } catch {
      invalidEntries.push(i + 1);
    }
  }

  if (!normalized.length) {
    throw new Error('No valid questions could be parsed from this JSON.');
  }

  const warnings = [];
  if (invalidEntries.length) {
    warnings.push(
      `${invalidEntries.length} entr${invalidEntries.length === 1 ? 'y was' : 'ies were'} skipped because required quiz fields were missing or invalid.`
    );
  }

  return {
    questions: normalized,
    meta: {
      total: items.length,
      skipped: invalidEntries.length,
      warnings
    }
  };
}

function extractQuestionItems(data) {
  if (Array.isArray(data)) {
    return flattenEntries(data);
  }

  if (!data || typeof data !== 'object') {
    return [];
  }

  for (const key of CONSTANTS.quizCollections) {
    if (Array.isArray(data[key])) {
      return flattenEntries(data[key]);
    }
  }

  if (Array.isArray(data.results)) {
    return flattenEntries(data.results);
  }

  const objectValues = Object.values(data);
  if (objectValues.length && objectValues.every(isQuestionLike)) {
    return flattenEntries(objectValues);
  }

  return [data];
}

function flattenEntries(items) {
  const result = [];
  for (const item of items) {
    if (Array.isArray(item)) {
      result.push(...flattenEntries(item));
    } else if (item && typeof item === 'object') {
      let found = false;
      for (const key of CONSTANTS.quizCollections) {
        if (Array.isArray(item[key])) {
          result.push(...flattenEntries(item[key]));
          found = true;
          break;
        }
      }
      if (!found) result.push(item);
    } else {
      result.push(item);
    }
  }
  return result;
}

function normalizeQuestion(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const question = getFirstValue(item, CONSTANTS.questionTextKeys);
  if (!question) {
    return null;
  }

  const optionDetails = extractOptions(item);
  let options = optionDetails.options;
  let correct = optionDetails.correctIndex;
  if (correct === -1) {
    correct = resolveCorrectAnswer(item, options);
  }

  if ((!options.length || correct === -1) && typeof item.answer === 'boolean') {
    options = ['True', 'False'];
    correct = item.answer ? 0 : 1;
  }

  if (!options.length || options.length < 2 || correct === -1) {
    return null;
  }

  const explanation = getFirstValue(item, CONSTANTS.explanationKeys);
  return {
    question: String(question).trim(),
    options,
    correct,
    explanation: explanation ? String(explanation).trim() : null,
    meta: extractQuestionMeta(item)
  };
}

function extractOptions(item) {
  const listCandidates = ['options', 'choices', 'answers', 'answerOptions', 'items'];
  for (const key of listCandidates) {
    if (Array.isArray(item[key]) && item[key].length) {
      const normalized = normalizeOptionArray(item[key]);
      if (normalized.options.length >= 2) {
        return normalized;
      }
    }
  }

  const objectCandidates = ['options', 'choices', 'answers'];
  for (const key of objectCandidates) {
    if (item[key] && typeof item[key] === 'object' && !Array.isArray(item[key])) {
      const normalized = normalizeOptionObject(item[key]);
      if (normalized.options.length >= 2) {
        return normalized;
      }
    }
  }

  const indexedOptions = [];
  for (let index = 1; index <= 10; index += 1) {
    const value =
      item[`option${index}`] ??
      item[`Option${index}`] ??
      item[`choice${index}`] ??
      item[`Choice${index}`];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      indexedOptions.push(String(value).trim());
    }
  }
  if (indexedOptions.length >= 2) {
    return { options: indexedOptions, correctIndex: -1 };
  }

  const letterValues = ['A', 'B', 'C', 'D', 'E', 'F']
    .map((key) => item[key] ?? item[key.toLowerCase()])
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
    .map((value) => String(value).trim());
  if (letterValues.length >= 2) {
    return { options: letterValues, correctIndex: -1 };
  }

  return { options: [], correctIndex: -1 };
}

function normalizeOptionArray(optionArray) {
  const options = [];
  let correctIndex = -1;

  optionArray.forEach((entry, index) => {
    if (typeof entry === 'string' || typeof entry === 'number') {
      options.push(String(entry).trim());
      return;
    }

    if (!entry || typeof entry !== 'object') {
      return;
    }

    const text = normalizeOptionValue(entry);
    if (!text) {
      return;
    }

    options.push(text);
    if (entry.correct === true || entry.isCorrect === true || entry.answer === true) {
      correctIndex = options.length - 1;
    } else if (typeof entry.id === 'number' && entry.id === entry.correct) {
      correctIndex = options.length - 1;
    } else if (typeof entry.value === 'boolean' && entry.value === true) {
      correctIndex = options.length - 1;
    }

    if (entry.index === index && entry.correct === true) {
      correctIndex = options.length - 1;
    }
  });

  return { options, correctIndex };
}

function normalizeOptionObject(optionObject) {
  const options = [];
  let correctIndex = -1;

  Object.values(optionObject).forEach((entry) => {
    const text = normalizeOptionValue(entry);
    if (!text) {
      return;
    }

    options.push(text);
    if (entry && typeof entry === 'object' && (entry.correct === true || entry.isCorrect === true || entry.answer === true)) {
      correctIndex = options.length - 1;
    }
  });

  return { options, correctIndex };
}

function normalizeOptionValue(value) {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim();
  }

  if (!value || typeof value !== 'object') {
    return '';
  }

  const fields = ['text', 'label', 'option', 'value', 'answer', 'content', 'title', 'name'];
  for (const field of fields) {
    if (typeof value[field] === 'string' || typeof value[field] === 'number') {
      return String(value[field]).trim();
    }
  }

  return '';
}

function resolveCorrectAnswer(item, options) {
  if (!options.length) {
    return -1;
  }

  const arraySources = ['options', 'choices', 'answers', 'answerOptions', 'items'];
  for (const key of arraySources) {
    if (Array.isArray(item[key])) {
      const normalized = normalizeOptionArray(item[key]);
      if (normalized.correctIndex > -1 && normalized.correctIndex < options.length) {
        return normalized.correctIndex;
      }
    }
  }

  const answerValue = getFirstPresentValue(item, CONSTANTS.answerKeys);
  if (answerValue !== undefined) {
    const resolved = resolveCorrectIndexFromValue(answerValue, options);
    if (resolved !== -1) {
      return resolved;
    }
  }

  if (typeof item.correctOption === 'object' && item.correctOption !== null) {
    const correctText = normalizeOptionValue(item.correctOption);
    const resolved = resolveCorrectIndexFromValue(correctText, options);
    if (resolved !== -1) {
      return resolved;
    }
  }

  return -1;
}

function resolveCorrectIndexFromValue(value, options) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 0 && value < options.length) {
      return value;
    }
    if (value >= 1 && value <= options.length) {
      return value - 1;
    }
  }

  if (typeof value === 'boolean' && options.length === 2) {
    return value ? 0 : 1;
  }

  if (typeof value !== 'string') {
    return -1;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return -1;
  }

  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric)) {
    return resolveCorrectIndexFromValue(numeric, options);
  }

  const letterMatch = trimmed.match(/^[A-F]$/i);
  if (letterMatch) {
    const index = letterMatch[0].toUpperCase().charCodeAt(0) - 65;
    return index < options.length ? index : -1;
  }

  const prefixMatch = trimmed.match(/^([A-F])[\).\-\s:]/i);
  if (prefixMatch) {
    const index = prefixMatch[1].toUpperCase().charCodeAt(0) - 65;
    return index < options.length ? index : -1;
  }

  return options.findIndex((option) => option.trim().toLowerCase() === trimmed.toLowerCase());
}

function getFirstValue(source, keys) {
  const value = getFirstPresentValue(source, keys);
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}

function getFirstPresentValue(source, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }
  return undefined;
}

function normalizeMetaValue(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (Array.isArray(value)) {
    const values = [];
    const queue = [...value];

    while (queue.length) {
      const entry = queue.shift();
      if (Array.isArray(entry)) {
        queue.push(...entry);
        continue;
      }

      const normalized = normalizeMetaValue(entry);
      if (typeof normalized === 'string') {
        values.push(normalized);
      } else if (Array.isArray(normalized)) {
        values.push(...normalized);
      }
    }

    return values.length ? values : null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const normalized = String(value).trim();
    return normalized ? normalized : null;
  }

  if (typeof value === 'object') {
    const text = getFirstPresentValue(value, CONSTANTS.metadataTextKeys);
    if (text !== undefined && text !== null) {
      const normalized = String(text).trim();
      return normalized ? normalized : null;
    }
  }

  return null;
}

function extractQuestionMeta(item) {
  const meta = {};
  const lowerKeyMap = {};
  for (const [key, value] of Object.entries(item)) {
    lowerKeyMap[key.toLowerCase()] = value;
  }

  for (const key of CONSTANTS.metadataKeys) {
    const value = lowerKeyMap[key];
    const normalized = normalizeMetaValue(value);
    if (normalized !== null) {
      meta[key] = normalized;
    }
  }
  return meta;
}

function isQuestionLike(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return CONSTANTS.questionTextKeys.some((key) => key in value);
}

function renderLoadedState() {
  const d = getDom();
  clearMessages();
  d.fileInfo.textContent = buildLoadedText();
  d.parserDetails.innerHTML = buildParserDetailsMarkup();
  d.uploadSummary.textContent = `${state.questions.length} valid question${state.questions.length === 1 ? '' : 's'} ready from ${state.fileName}`;
}

function buildLoadedText() {
  const skippedText = state.parseMeta.skipped ? `, ${state.parseMeta.skipped} skipped` : '';
  return `Loaded ${state.questions.length} question${state.questions.length === 1 ? '' : 's'} from ${state.fileName}${skippedText}.`;
}

function buildParserDetailsMarkup() {
  return state.parseMeta.warnings
    .map((warning) => `<p class="info-note warning-note">${esc(warning)}</p>`)
    .join('');
}



function buildQuestionHeader(questionNumber, questionText, meta) {
  const metaMarkup = buildQuestionMetaMarkup(meta);
  return `
    <div class="q-number">Question ${questionNumber}</div>
    ${metaMarkup}
    <div class="q-text">${esc(questionText)}</div>
  `;
}

function buildQuestionMetaMarkup(meta) {
  const tags = [];
  if (!meta || typeof meta !== 'object') {
    return '';
  }

  for (const key of CONSTANTS.metadataKeys) {
    const value = meta[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        const tag = sanitizeTag(item);
        if (tag) {
          tags.push(tag);
        }
      }
    } else {
      const tag = sanitizeTag(value);
      if (tag) {
        tags.push(tag);
      }
    }
  }

  if (!tags.length) {
    return '';
  }

  return `<div class="q-meta-tags">${tags.map((tag) => `<span class="q-meta-tag">${esc(tag)}</span>`).join('')}</div>`;
}

function sanitizeTag(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return trimmed;
}

function buildReviewMarkup(state, index, questionText, userAnswer, correctAnswer, explanation) {
  return `
    <div class="r-badge">${stateLabel(state)}</div>
    <div class="r-question">Q${index + 1}. ${esc(questionText)}</div>
    <div class="r-answer">Your answer: <strong>${esc(userAnswer)}</strong></div>
    <div class="r-answer">Correct answer: <strong>${esc(correctAnswer)}</strong></div>
    ${renderExplanation(explanation)}
  `;
}

function clearMessages() {
  const d = getDom();
  d.uploadError.textContent = '';
  d.uploadError.classList.add('hidden');
  d.uploadSummary.textContent = '';
}

function showError(message) {
  const d = getDom();
  d.uploadError.textContent = message;
  d.uploadError.classList.remove('hidden');
}

function resetLoadedData() {
  const d = getDom();
  state.allQuestions = [];
  state.questions = [];
  state.currentMode = '';
  state.quizIndex = 0;
  state.quizAnswers = [];
  state.quizResults = [];
  state.fileName = '';
  state.parseMeta = { skipped: 0, total: 0, warnings: [] };
  stopTimer();
  d.fileInfo.textContent = '';
  d.parserDetails.innerHTML = '';
  d.uploadSummary.textContent = '';
}

function showSection(id) {
  for (const sectionId of CONSTANTS.sectionIds) {
    const section = document.getElementById(sectionId);
    if (!section) continue;

    const isTarget = sectionId === id;
    section.classList.toggle('active', isTarget);
    section.classList.toggle('hidden', !isTarget);
  }

  const immersiveSections = ['read-section', 'quiz-section', 'test-section', 'result-section'];
  document.body.classList.toggle('immersive-mode', immersiveSections.includes(id));
}

function goBack() {
  stopTimer();
  state.quizIndex = 0;
  state.quizAnswers = [];
  state.quizResults = [];
  state.currentMode = '';
  showSection(state.allQuestions.length ? 'mode-section' : 'upload-section');
}

function resetQuiz() {
  stopTimer();
  state.questions = cloneQuestions(state.allQuestions);
  state.quizIndex = 0;
  state.quizAnswers = [];
  state.quizResults = [];
  state.currentMode = '';
  renderLoadedState();
  showSection('mode-section');
}

function cloneQuestions(source) {
  return source.map((question) => ({
    ...question,
    options: [...question.options],
    meta: cloneMeta(question.meta)
  }));
}

function cloneMeta(meta) {
  if (!meta || typeof meta !== 'object') {
    return {};
  }

  const cloned = {};
  for (const key of Object.keys(meta)) {
    cloned[key] = cloneMetaValue(meta[key]);
  }
  return cloned;
}

function cloneMetaValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneMetaValue(entry));
  }
  if (value && typeof value === 'object') {
    const cloned = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      cloned[key] = cloneMetaValue(nestedValue);
    }
    return cloned;
  }
  return value;
}

function shuffleArray(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

function shuffleQuestions() {
  if (!state.questions.length) {
    showSection('upload-section');
    showError('Load a quiz file before shuffling questions.');
    return;
  }

  state.questions = shuffleArray(cloneQuestions(state.questions));
  renderLoadedState();
}

function shuffleOptions() {
  if (!state.questions.length) {
    showSection('upload-section');
    showError('Load a quiz file before shuffling options.');
    return;
  }

  for (let i = 0; i < state.questions.length; i++) {
    const q = state.questions[i];
    const paired = q.options.map((option, idx) => ({ option, isCorrect: idx === q.correct }));
    shuffleArray(paired);
    state.questions[i] = {
      ...q,
      options: paired.map((entry) => entry.option),
      correct: paired.findIndex((entry) => entry.isCorrect)
    };
  }

  renderLoadedState();
}

function exportResult() {
  if (!state.questions.length || !state.quizResults.length) {
    return;
  }

  let correct = 0, wrong = 0, skipped = 0;
  for (const result of state.quizResults) {
    if (result === 'correct') correct++;
    else if (result === 'wrong') wrong++;
    else if (result === 'skipped') skipped++;
  }

  const answers = [];
  for (let i = 0; i < state.questions.length; i++) {
    const q = state.questions[i];
    const ans = state.quizAnswers[i];
    answers.push({
      question: q.question,
      userAnswer: ans !== undefined && ans !== null && ans !== -1 ? q.options[ans] : null,
      correctAnswer: q.options[q.correct],
      result: state.quizResults[i] || 'unanswered'
    });
  }

  const payload = {
    fileName: state.fileName,
    mode: state.currentMode,
    total: state.questions.length,
    correct,
    wrong,
    skipped,
    score: calcPercent(),
    answers
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'quizify-result.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function calcPercent() {
  const total = state.questions.length;
  if (!total) return 0;
  let correct = 0;
  for (const result of state.quizResults) {
    if (result === 'correct') correct++;
  }
  return Math.round((correct / total) * 100);
}

function startRead() {
  if (!ensureQuestionsLoaded()) return;

  const d = getDom();
  stopTimer();
  state.currentMode = 'read';
  d.readCount.textContent = `${state.questions.length} question${state.questions.length === 1 ? '' : 's'}`;

  const fragment = document.createDocumentFragment();
  for (let i = 0; i < state.questions.length; i++) {
    const q = state.questions[i];
    const card = document.createElement('article');
    card.className = 'read-question';
    let optionsHtml = '';
    for (let j = 0; j < q.options.length; j++) {
      const className = j === q.correct ? 'opt-btn correct' : 'opt-btn';
      optionsHtml += `<button class="${className}" disabled>${optionLabel(j)} ${esc(q.options[j])}</button>`;
    }
    card.innerHTML = `
      ${buildQuestionHeader(i + 1, q.question, q.meta)}
      <div class="options-grid">${optionsHtml}</div>
      ${renderExplanation(q.explanation)}
    `;
    fragment.appendChild(card);
  }
  d.readContainer.innerHTML = '';
  d.readContainer.appendChild(fragment);

  showSection('read-section');
}

function startQuiz() {
  if (!ensureQuestionsLoaded()) return;

  stopTimer();
  state.currentMode = 'quiz';
  state.quizIndex = 0;
  state.quizAnswers = new Array(state.questions.length).fill(null);
  state.quizResults = new Array(state.questions.length).fill(null);
  renderQuizQuestion();
  showSection('quiz-section');
}

function renderQuizQuestion() {
  const d = getDom();
  const q = state.questions[state.quizIndex];
  const total = state.questions.length;
  const selectedAnswer = state.quizAnswers[state.quizIndex];
  const locked = selectedAnswer !== null;

  d.quizProgress.textContent = `Question ${state.quizIndex + 1} of ${total}`;
  d.quizFill.style.width = `${((state.quizIndex + 1) / total) * 100}%`;

  let optionsHtml = '';
  for (let i = 0; i < q.options.length; i++) {
    const classes = ['opt-btn'];
    if (locked) {
      if (i === q.correct) classes.push('correct');
      else if (i === selectedAnswer) classes.push('selected-wrong');
      else if (selectedAnswer === -1) classes.push('skipped-option');
    }
    optionsHtml += `<button class="${classes.join(' ')}" ${locked ? 'disabled' : ''} onclick="quizAnswer(${i})">${optionLabel(i)} ${esc(q.options[i])}</button>`;
  }

  d.quizContainer.innerHTML = `
    ${buildQuestionHeader(state.quizIndex + 1, q.question, q.meta)}
    <div class="options-grid">${optionsHtml}</div>
    ${locked ? renderExplanation(q.explanation) : ''}
  `;

  d.quizSkip.classList.toggle('hidden', locked);
  d.quizNext.classList.toggle('hidden', !locked);
}

function quizAnswer(index) {
  const q = state.questions[state.quizIndex];
  state.quizAnswers[state.quizIndex] = index;
  state.quizResults[state.quizIndex] = index === q.correct ? 'correct' : 'wrong';
  renderQuizQuestion();
}

function quizSkip() {
  state.quizAnswers[state.quizIndex] = -1;
  state.quizResults[state.quizIndex] = 'skipped';
  quizNext();
}

function quizNext() {
  if (state.quizIndex < state.questions.length - 1) {
    state.quizIndex++;
    renderQuizQuestion();
  } else {
    showResult('quiz');
  }
}

function startTest() {
  if (!ensureQuestionsLoaded()) return;

  state.currentMode = 'test';
  state.quizAnswers = new Array(state.questions.length).fill(null);
  state.quizResults = new Array(state.questions.length).fill(null);
  startTimerIfSet();
  renderTestSheet();
  showSection('test-section');
}

function renderTestSheet() {
  const d = getDom();
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < state.questions.length; i++) {
    const q = state.questions[i];
    const selectedAnswer = state.quizAnswers[i];
    const card = document.createElement('article');
    card.className = `test-card${selectedAnswer !== null ? ' answered' : ''}`;

    let optionsHtml = '';
    for (let j = 0; j < q.options.length; j++) {
      const classes = ['opt-btn'];
      if (selectedAnswer === j) classes.push('selected');
      optionsHtml += `<button class="${classes.join(' ')}" type="button" onclick="testAnswer(${i}, ${j})">${optionLabel(j)} ${esc(q.options[j])}</button>`;
    }

    card.innerHTML = `
      ${buildQuestionHeader(i + 1, q.question, q.meta)}
      <div class="options-grid">${optionsHtml}</div>
    `;
    fragment.appendChild(card);
  }

  d.testContainer.innerHTML = '';
  d.testContainer.appendChild(fragment);
  updateTestProgress();
}

function testAnswer(questionIndex, optionIndex) {
  state.quizAnswers[questionIndex] = optionIndex;
  renderTestSheet();
}

function updateTestProgress() {
  const d = getDom();
  let answered = 0;
  for (const ans of state.quizAnswers) {
    if (ans !== null) answered++;
  }
  const total = state.questions.length;
  d.testProgress.textContent = `${answered} of ${total} answered`;
  d.testFill.style.width = total ? `${(answered / total) * 100}%` : '0%';
}

function testSubmit(force = false) {
  if (!force && !window.confirm('Submit the test now? You will not be able to change your answers after this.')) {
    return;
  }

  stopTimer();

  for (let i = 0; i < state.questions.length; i++) {
    const q = state.questions[i];
    if (state.quizAnswers[i] === null) {
      state.quizResults[i] = 'skipped';
    } else if (state.quizAnswers[i] === q.correct) {
      state.quizResults[i] = 'correct';
    } else {
      state.quizResults[i] = 'wrong';
    }
  }

  showResult('test');
}

function startTimerIfSet() {
  stopTimer();
  const d = getDom();
  const minutes = Number.parseInt(d.timerInput.value, 10);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    d.timerDisplay.classList.add('hidden');
    d.timerDisplay.classList.remove('warning');
    return;
  }

  state.timerSeconds = minutes * 60;
  d.timerDisplay.classList.remove('hidden', 'warning');
  updateTimerDisplay();

  state.timerInterval = window.setInterval(() => {
    state.timerSeconds--;
    updateTimerDisplay();

    if (state.timerSeconds <= 60) {
      d.timerDisplay.classList.add('warning');
    }

    if (state.timerSeconds <= 0) {
      testSubmit(true);
    }
  }, 1000);
}

function updateTimerDisplay() {
  const d = getDom();
  const minutes = Math.max(0, Math.floor(state.timerSeconds / 60));
  const seconds = Math.max(0, state.timerSeconds % 60);
  d.timerValue.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function stopTimer() {
  const d = getDom();
  if (state.timerInterval) {
    window.clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  d.timerDisplay.classList.add('hidden');
  d.timerDisplay.classList.remove('warning');
  state.timerSeconds = 0;
  updateTimerDisplay();
}

function showResult(mode) {
  state.currentMode = mode;
  const d = getDom();

  let correct = 0, wrong = 0, skipped = 0;
  for (const result of state.quizResults) {
    if (result === 'correct') correct++;
    else if (result === 'wrong') wrong++;
    else if (result === 'skipped') skipped++;
  }

  const total = state.questions.length;
  const percent = total ? Math.round((correct / total) * 100) : 0;

  d.resultPercent.textContent = `${percent}%`;
  d.resultTitle.textContent = mode === 'quiz' ? 'Quiz Complete' : 'Test Results';
  d.resultCorrect.textContent = String(correct);
  d.resultWrong.textContent = String(wrong);
  d.resultSkipped.textContent = String(skipped);
  d.resultTotal.textContent = String(total);

  const fragment = document.createDocumentFragment();
  const header = document.createElement('div');
  header.className = 'review-header';
  header.textContent = 'Answer Review';
  fragment.appendChild(header);

  for (let i = 0; i < state.questions.length; i++) {
    const q = state.questions[i];
    const resultState = state.quizResults[i] || 'skipped';
    const userAnswerIndex = state.quizAnswers[i];
    const userAnswer = userAnswerIndex !== null && userAnswerIndex !== -1 && userAnswerIndex >= 0
      ? q.options[userAnswerIndex]
      : 'Not answered';

    const card = document.createElement('article');
    card.className = `review-item r-${resultState}`;
    card.innerHTML = buildReviewMarkup(
      resultState,
      i,
      q.question,
      userAnswer,
      q.options[q.correct],
      q.explanation
    );
    fragment.appendChild(card);
  }

  d.reviewContainer.innerHTML = '';
  d.reviewContainer.appendChild(fragment);
  showSection('result-section');
}

function startMode(mode) {
  switch (mode) {
    case 'read': startRead(); break;
    case 'quiz': startQuiz(); break;
    case 'test': startTest(); break;
  }
}

function ensureQuestionsLoaded() {
  if (state.questions.length) return true;
  showSection('upload-section');
  showError('Upload a quiz JSON file before starting a mode.');
  return false;
}

function renderExplanation(text) {
  if (!text) {
    return '';
  }

  return `<div class="explanation"><strong>Explanation</strong><span>${esc(text)}</span></div>`;
}

function optionLabel(index) {
  return `${String.fromCharCode(65 + index)}.`;
}

function stateLabel(state) {
  if (state === 'correct') {
    return 'Correct';
  }
  if (state === 'wrong') {
    return 'Wrong';
  }
  return 'Skipped';
}

function esc(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
