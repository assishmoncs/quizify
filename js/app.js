let allQuestions = [];
let questions = [];
let currentMode = '';
let quizIndex = 0;
let quizAnswers = [];
let quizResults = [];
let timerInterval = null;
let timerSeconds = 0;
let fileName = '';
let parseMeta = { skipped: 0, total: 0, warnings: [] };

const sectionIds = [
  'upload-section',
  'mode-section',
  'read-section',
  'quiz-section',
  'test-section',
  'result-section'
];

const quizCollections = ['questions', 'quiz', 'quizzes', 'items', 'data', 'entries'];
const questionTextKeys = ['question', 'q', 'ques', 'text', 'prompt', 'title', 'Question'];
const explanationKeys = ['explanation', 'explain', 'rationale', 'reason', 'note', 'details'];
const answerKeys = [
  'correct',
  'answer',
  'correct_answer',
  'answer_index',
  'answer_letter',
  'answer_text',
  'correctAnswer',
  'correctIndex',
  'correctOption',
  'correct_choice',
  'correctChoice',
  'correct_option',
  'solution',
  'solutionIndex',
  'solutionText'
];

const dom = {
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
};

dom.fileInput.addEventListener('change', handleFileSelection);
dom.themeToggle.addEventListener('click', toggleTheme);

initializeTheme();
updateTimerDisplay();

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
  if (!file) {
    return;
  }

  clearMessages();

  if (!file.name.toLowerCase().endsWith('.json')) {
    showError('Please choose a valid JSON file with a .json extension.');
    dom.fileInput.value = '';
    return;
  }

  if (file.size === 0) {
    showError('The selected file is empty.');
    dom.fileInput.value = '';
    return;
  }

  fileName = file.name;
  const reader = new FileReader();

  reader.onload = ({ target }) => {
    try {
      const result = parseJSON(target.result);
      allQuestions = result.questions;
      questions = cloneQuestions(allQuestions);
      parseMeta = result.meta;
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

  items.forEach((item, index) => {
    try {
      const question = normalizeQuestion(item);
      if (question) {
        normalized.push(question);
      } else {
        invalidEntries.push(index + 1);
      }
    } catch (error) {
      invalidEntries.push(index + 1);
    }
  });

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

  for (const key of quizCollections) {
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
  return items.flatMap((item) => {
    if (Array.isArray(item)) {
      return flattenEntries(item);
    }

    if (item && typeof item === 'object') {
      for (const key of quizCollections) {
        if (Array.isArray(item[key])) {
          return flattenEntries(item[key]);
        }
      }
    }

    return [item];
  });
}

function normalizeQuestion(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const question = getFirstValue(item, questionTextKeys);
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

  const explanation = getFirstValue(item, explanationKeys);
  return {
    question: String(question).trim(),
    options,
    correct,
    explanation: explanation ? String(explanation).trim() : null
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

  const answerValue = getFirstPresentValue(item, answerKeys);
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

function isQuestionLike(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return questionTextKeys.some((key) => key in value);
}

function renderLoadedState() {
  clearMessages();
  dom.fileInfo.textContent = buildLoadedText();
  dom.parserDetails.innerHTML = buildParserDetailsMarkup();
  dom.uploadSummary.textContent = `${questions.length} valid question${questions.length === 1 ? '' : 's'} ready from ${fileName}`;
}

function buildLoadedText() {
  const skippedText = parseMeta.skipped ? `, ${parseMeta.skipped} skipped` : '';
  return `Loaded ${questions.length} question${questions.length === 1 ? '' : 's'} from ${fileName}${skippedText}.`;
}

function buildParserDetailsMarkup() {
  const supported = [
    'Arrays of question objects',
    'Wrapped collections like questions, quiz, items, data, or entries',
    'Standalone question objects or keyed question maps',
    'Options as arrays, keyed objects, option1..10, choice1..10, or A..F fields',
    'Answers as index, 1-based number, letter, option text, boolean, or option objects marked correct'
  ];

  const warningMarkup = parseMeta.warnings
    .map((warning) => `<p class="info-note warning-note">${esc(warning)}</p>`)
    .join('');

  return `
    <div class="info-chip-row">
      ${supported.map((item) => `<span class="info-chip">${esc(item)}</span>`).join('')}
    </div>
    ${warningMarkup}
  `;
}

function clearMessages() {
  dom.uploadError.textContent = '';
  dom.uploadError.classList.add('hidden');
  dom.uploadSummary.textContent = '';
}

function showError(message) {
  dom.uploadError.textContent = message;
  dom.uploadError.classList.remove('hidden');
}

function resetLoadedData() {
  allQuestions = [];
  questions = [];
  currentMode = '';
  quizIndex = 0;
  quizAnswers = [];
  quizResults = [];
  fileName = '';
  parseMeta = { skipped: 0, total: 0, warnings: [] };
  stopTimer();
  dom.fileInfo.textContent = '';
  dom.parserDetails.innerHTML = '';
  dom.uploadSummary.textContent = '';
}

function showSection(id) {
  sectionIds.forEach((sectionId) => {
    const section = document.getElementById(sectionId);
    if (!section) {
      return;
    }

    if (sectionId === id) {
      section.classList.add('active');
      section.classList.remove('hidden');
    } else {
      section.classList.remove('active');
      section.classList.add('hidden');
    }
  });

  const immersiveSections = ['read-section', 'quiz-section', 'test-section', 'result-section'];
  document.body.classList.toggle('immersive-mode', immersiveSections.includes(id));
}

function goBack() {
  stopTimer();
  quizIndex = 0;
  quizAnswers = [];
  quizResults = [];
  currentMode = '';
  showSection(allQuestions.length ? 'mode-section' : 'upload-section');
}

function resetQuiz() {
  stopTimer();
  questions = cloneQuestions(allQuestions);
  quizIndex = 0;
  quizAnswers = [];
  quizResults = [];
  currentMode = '';
  renderLoadedState();
  showSection('mode-section');
}

function cloneQuestions(source) {
  return source.map((question) => ({
    ...question,
    options: [...question.options]
  }));
}

function shuffleArray(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

function shuffleQuestions() {
  if (!questions.length) {
    showSection('upload-section');
    showError('Load a quiz file before shuffling questions.');
    return;
  }

  questions = shuffleArray(cloneQuestions(questions));
  renderLoadedState();
}

function shuffleOptions() {
  if (!questions.length) {
    showSection('upload-section');
    showError('Load a quiz file before shuffling options.');
    return;
  }

  questions = questions.map((question) => {
    const paired = question.options.map((option, index) => ({
      option,
      isCorrect: index === question.correct
    }));
    shuffleArray(paired);
    return {
      ...question,
      options: paired.map((entry) => entry.option),
      correct: paired.findIndex((entry) => entry.isCorrect)
    };
  });

  renderLoadedState();
}

function exportResult() {
  if (!questions.length || !quizResults.length) {
    return;
  }

  const payload = {
    fileName,
    mode: currentMode,
    total: questions.length,
    correct: quizResults.filter((result) => result === 'correct').length,
    wrong: quizResults.filter((result) => result === 'wrong').length,
    skipped: quizResults.filter((result) => result === 'skipped').length,
    score: calcPercent(),
    answers: questions.map((question, index) => ({
      question: question.question,
      userAnswer:
        quizAnswers[index] !== undefined &&
        quizAnswers[index] !== null &&
        quizAnswers[index] !== -1
          ? question.options[quizAnswers[index]]
          : null,
      correctAnswer: question.options[question.correct],
      result: quizResults[index] || 'unanswered'
    }))
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
  const total = questions.length;
  const correct = quizResults.filter((result) => result === 'correct').length;
  return total ? Math.round((correct / total) * 100) : 0;
}

function startRead() {
  if (!ensureQuestionsLoaded()) {
    return;
  }

  stopTimer();
  currentMode = 'read';
  dom.readCount.textContent = `${questions.length} question${questions.length === 1 ? '' : 's'}`;
  dom.readContainer.innerHTML = '';

  questions.forEach((question, index) => {
    const card = document.createElement('article');
    card.className = 'read-question';
    card.innerHTML = `
      <div class="q-number">Question ${index + 1}</div>
      <div class="q-text">${esc(question.question)}</div>
      <div class="options-grid">
        ${question.options
          .map((option, optionIndex) => {
            const className = optionIndex === question.correct ? 'opt-btn correct' : 'opt-btn';
            return `<button class="${className}" disabled>${optionLabel(optionIndex)} ${esc(option)}</button>`;
          })
          .join('')}
      </div>
      ${renderExplanation(question.explanation)}
    `;
    dom.readContainer.appendChild(card);
  });

  showSection('read-section');
}

function startQuiz() {
  if (!ensureQuestionsLoaded()) {
    return;
  }

  stopTimer();
  currentMode = 'quiz';
  quizIndex = 0;
  quizAnswers = new Array(questions.length).fill(null);
  quizResults = new Array(questions.length).fill(null);
  renderQuizQuestion();
  showSection('quiz-section');
}

function renderQuizQuestion() {
  const question = questions[quizIndex];
  const total = questions.length;
  const selectedAnswer = quizAnswers[quizIndex];
  const locked = selectedAnswer !== null;

  dom.quizProgress.textContent = `Question ${quizIndex + 1} of ${total}`;
  dom.quizFill.style.width = `${((quizIndex + 1) / total) * 100}%`;

  dom.quizContainer.innerHTML = `
    <div class="q-number">Question ${quizIndex + 1}</div>
    <div class="q-text">${esc(question.question)}</div>
    <div class="options-grid">
      ${question.options
        .map((option, index) => {
          const classes = ['opt-btn'];
          if (locked) {
            if (index === question.correct) {
              classes.push('correct');
            } else if (index === selectedAnswer) {
              classes.push('selected-wrong');
            } else if (selectedAnswer === -1) {
              classes.push('skipped-option');
            }
          }
          return `<button class="${classes.join(' ')}" ${locked ? 'disabled' : ''} onclick="quizAnswer(${index})">${optionLabel(index)} ${esc(option)}</button>`;
        })
        .join('')}
    </div>
    ${locked ? renderExplanation(question.explanation) : ''}
  `;

  dom.quizSkip.classList.toggle('hidden', locked);
  dom.quizNext.classList.toggle('hidden', !locked);
}

function quizAnswer(index) {
  const question = questions[quizIndex];
  quizAnswers[quizIndex] = index;
  quizResults[quizIndex] = index === question.correct ? 'correct' : 'wrong';
  renderQuizQuestion();
}

function quizSkip() {
  quizAnswers[quizIndex] = -1;
  quizResults[quizIndex] = 'skipped';
  quizNext();
}

function quizNext() {
  if (quizIndex < questions.length - 1) {
    quizIndex += 1;
    renderQuizQuestion();
    return;
  }

  showResult('quiz');
}

function startTest() {
  if (!ensureQuestionsLoaded()) {
    return;
  }

  currentMode = 'test';
  quizAnswers = new Array(questions.length).fill(null);
  quizResults = new Array(questions.length).fill(null);
  startTimerIfSet();
  renderTestSheet();
  showSection('test-section');
}

function renderTestSheet() {
  dom.testContainer.innerHTML = '';

  questions.forEach((question, questionIndex) => {
    const selectedAnswer = quizAnswers[questionIndex];
    const card = document.createElement('article');
    card.className = `test-card${selectedAnswer !== null ? ' answered' : ''}`;
    card.innerHTML = `
      <div class="q-number">Question ${questionIndex + 1}</div>
      <div class="q-text">${esc(question.question)}</div>
      <div class="options-grid">
        ${question.options
          .map((option, optionIndex) => {
            const classes = ['opt-btn'];
            if (selectedAnswer === optionIndex) {
              classes.push('selected');
            }
            return `<button class="${classes.join(' ')}" type="button" onclick="testAnswer(${questionIndex}, ${optionIndex})">${optionLabel(optionIndex)} ${esc(option)}</button>`;
          })
          .join('')}
      </div>
    `;
    dom.testContainer.appendChild(card);
  });

  updateTestProgress();
}

function testAnswer(questionIndex, optionIndex) {
  quizAnswers[questionIndex] = optionIndex;
  renderTestSheet();
}

function updateTestProgress() {
  const answered = quizAnswers.filter((answer) => answer !== null).length;
  const total = questions.length;
  dom.testProgress.textContent = `${answered} of ${total} answered`;
  dom.testFill.style.width = `${total ? (answered / total) * 100 : 0}%`;
}

function testSubmit(force = false) {
  if (!force) {
    const shouldSubmit = window.confirm('Submit the test now? You will not be able to change your answers after this.');
    if (!shouldSubmit) {
      return;
    }
  }

  stopTimer();

  questions.forEach((question, index) => {
    if (quizAnswers[index] === null) {
      quizResults[index] = 'skipped';
    } else if (quizAnswers[index] === question.correct) {
      quizResults[index] = 'correct';
    } else {
      quizResults[index] = 'wrong';
    }
  });

  showResult('test');
}

function startTimerIfSet() {
  stopTimer();
  const minutes = Number.parseInt(dom.timerInput.value, 10);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    dom.timerDisplay.classList.add('hidden');
    dom.timerDisplay.classList.remove('warning');
    return;
  }

  timerSeconds = minutes * 60;
  dom.timerDisplay.classList.remove('hidden', 'warning');
  updateTimerDisplay();

  timerInterval = window.setInterval(() => {
    timerSeconds -= 1;
    updateTimerDisplay();

    if (timerSeconds <= 60) {
      dom.timerDisplay.classList.add('warning');
    }

    if (timerSeconds <= 0) {
      testSubmit(true);
    }
  }, 1000);
}

function updateTimerDisplay() {
  const minutes = Math.max(0, Math.floor(timerSeconds / 60));
  const seconds = Math.max(0, timerSeconds % 60);
  dom.timerValue.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function stopTimer() {
  if (timerInterval) {
    window.clearInterval(timerInterval);
    timerInterval = null;
  }
  dom.timerDisplay.classList.add('hidden');
  dom.timerDisplay.classList.remove('warning');
  timerSeconds = 0;
  updateTimerDisplay();
}

function showResult(mode) {
  currentMode = mode;

  const correct = quizResults.filter((result) => result === 'correct').length;
  const wrong = quizResults.filter((result) => result === 'wrong').length;
  const skipped = quizResults.filter((result) => result === 'skipped').length;
  const total = questions.length;
  const percent = total ? Math.round((correct / total) * 100) : 0;

  dom.resultPercent.textContent = `${percent}%`;
  dom.resultTitle.textContent = mode === 'quiz' ? 'Quiz Complete' : 'Test Results';
  dom.resultCorrect.textContent = String(correct);
  dom.resultWrong.textContent = String(wrong);
  dom.resultSkipped.textContent = String(skipped);
  dom.resultTotal.textContent = String(total);

  dom.reviewContainer.innerHTML = '<div class="review-header">Answer Review</div>';

  questions.forEach((question, index) => {
    const state = quizResults[index] || 'skipped';
    const userAnswerIndex = quizAnswers[index];
    const userAnswer =
      userAnswerIndex !== null && userAnswerIndex !== -1 && userAnswerIndex >= 0
        ? question.options[userAnswerIndex]
        : 'Not answered';

    const card = document.createElement('article');
    card.className = `review-item r-${state}`;
    card.innerHTML = `
      <div class="r-badge">${stateLabel(state)}</div>
      <div class="r-question">Q${index + 1}. ${esc(question.question)}</div>
      <div class="r-answer">Your answer: <strong>${esc(userAnswer)}</strong></div>
      <div class="r-answer">Correct answer: <strong>${esc(question.options[question.correct])}</strong></div>
      ${renderExplanation(question.explanation)}
    `;
    dom.reviewContainer.appendChild(card);
  });

  showSection('result-section');
}

function startMode(mode) {
  if (mode === 'read') {
    startRead();
    return;
  }

  if (mode === 'quiz') {
    startQuiz();
    return;
  }

  if (mode === 'test') {
    startTest();
  }
}

function ensureQuestionsLoaded() {
  if (questions.length) {
    return true;
  }

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