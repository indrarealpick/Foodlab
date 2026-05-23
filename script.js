/* ============================================================
   FoodLex — Main Application Script
   ============================================================ */

// ---- STATE ----
let vocab = null;
let state = {
  learned: {}, // { "en_word": true }
  streak: 0,
  lastStudyDate: null,
  totalSessions: 0
};

// Session state
let session = {
  mode: null, // 'flashcard' | 'typing'
  queue: [],
  index: 0,
  correct: 0,
  skipped: 0,
  categoryId: null,
  isFlipped: false,
  touchStartX: 0,
  touchStartY: 0
};

// ---- LOAD ----
async function init() {
  loadState();
  try {
    const res = await fetch('vocabulary.json');
    vocab = await res.json();
    state.totalWords = vocab.categories.reduce((s, c) => s + c.words.length, 0);
  } catch(e) {
    // Fallback: inline minimal data
    console.warn('Could not load vocabulary.json, using fallback');
    vocab = { categories: [] };
  }

  setTimeout(() => {
    document.getElementById('splash').classList.add('fade-out');
    setTimeout(() => {
      document.getElementById('splash').style.display = 'none';
      document.getElementById('app').classList.remove('hidden');
      renderHome();
      updateHeaderStats();
    }, 500);
  }, 1800);
}

// ---- STORAGE ----
function loadState() {
  try {
    const s = localStorage.getItem('foodlex_state');
    if (s) state = { ...state, ...JSON.parse(s) };
  } catch(e) {}
}
function saveState() {
  try {
    localStorage.setItem('foodlex_state', JSON.stringify(state));
  } catch(e) {}
}

// ---- HELPERS ----
function totalLearned() {
  return Object.keys(state.learned).length;
}
function totalWords() {
  if (!vocab) return 0;
  return vocab.categories.reduce((s, c) => s + c.words.length, 0);
}
function categoryLearned(catId) {
  if (!vocab) return 0;
  const cat = vocab.categories.find(c => c.id === catId);
  if (!cat) return 0;
  return cat.words.filter(w => state.learned[w.en]).length;
}
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning 👋';
  if (h < 17) return 'Good afternoon 👋';
  return 'Good evening 👋';
}
function showToast(msg, duration = 2000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(t._timer);
  t._timer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.classList.add('hidden'), 300);
  }, duration);
}

function updateHeaderStats() {
  document.getElementById('learned-count').textContent = totalLearned();
  document.getElementById('streak-count').textContent = state.streak || 0;
}

// ---- HOME ----
function renderHome() {
  document.getElementById('hero-greeting').textContent = getGreeting();
  renderProgress();
  renderCategories();
}

function renderProgress() {
  const learned = totalLearned();
  const total = totalWords();
  const pct = total > 0 ? Math.round((learned / total) * 100) : 0;
  const circumference = 264;
  const offset = circumference - (circumference * pct / 100);

  document.getElementById('progress-pct').textContent = pct + '%';
  document.getElementById('total-learned').textContent = learned;
  document.getElementById('total-words').textContent = total;
  document.getElementById('stat-learned').querySelector('#learned-count').textContent = learned;

  const ring = document.getElementById('ring-fill');
  if (ring) ring.style.strokeDashoffset = offset;
}

function renderCategories() {
  const grid = document.getElementById('category-grid');
  if (!vocab || !grid) return;
  grid.innerHTML = vocab.categories.map(cat => {
    const learned = categoryLearned(cat.id);
    const pct = Math.round((learned / cat.words.length) * 100);
    return `
      <div class="cat-card" style="--cat-color:${cat.color}" onclick="openCategory('${cat.id}')">
        <span class="cat-icon">${cat.icon}</span>
        <div class="cat-name">${cat.name}</div>
        <div class="cat-count">${learned}/${cat.words.length} words</div>
        <div class="cat-mini-bar">
          <div class="cat-mini-fill" style="width:${pct}%; background:${cat.color}"></div>
        </div>
      </div>
    `;
  }).join('');
}

// ---- NAVIGATION ----
function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const v = document.getElementById('view-' + viewId);
  if (v) v.classList.add('active');

  // Update bottom nav
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === viewId);
  });

  // Scroll to top
  window.scrollTo({ top: 0 });
}

function openCategory(catId) {
  showCategorySelect('flashcard-or-typing', catId);
}

function showCategorySelect(mode, preselectedCat) {
  const modeEl = document.getElementById('cat-select-mode');
  const title = document.getElementById('cat-select-title');
  const grid = document.getElementById('cat-grid-select');

  if (mode === 'flashcard') {
    title.textContent = 'Choose Category — Flashcard';
    modeEl.textContent = 'Select a category to start flashcard session';
    session.pendingMode = 'flashcard';
  } else if (mode === 'typing') {
    title.textContent = 'Choose Category — Typing';
    modeEl.textContent = 'Select a category to start typing practice';
    session.pendingMode = 'typing';
  } else {
    title.textContent = 'Choose Category';
    modeEl.textContent = 'Select a category to study';
    session.pendingMode = preselectedCat ? 'flashcard' : 'flashcard';
  }

  grid.innerHTML = `
    <div class="cat-select-card all-words" onclick="startSession('${session.pendingMode}', 'all')">
      <span class="csc-icon">🌟</span>
      <div class="csc-name">All Categories</div>
      <div class="csc-count">${totalWords()} words</div>
    </div>
    ${vocab.categories.map(cat => `
      <div class="cat-select-card" onclick="startSession('${session.pendingMode}', '${cat.id}')">
        <span class="csc-icon">${cat.icon}</span>
        <div class="csc-name">${cat.name}</div>
        <div class="csc-count">${cat.words.length} words</div>
      </div>
    `).join('')}
  `;
  showView('category-select');
}

// ---- SESSION ----
function buildQueue(catId) {
  if (!vocab) return [];
  let words = [];
  if (catId === 'all') {
    vocab.categories.forEach(cat => {
      cat.words.forEach(w => words.push({ ...w, catId: cat.id, catName: cat.name, catIcon: cat.icon, catColor: cat.color }));
    });
  } else {
    const cat = vocab.categories.find(c => c.id === catId);
    if (cat) {
      words = cat.words.map(w => ({ ...w, catId: cat.id, catName: cat.name, catIcon: cat.icon, catColor: cat.color }));
    }
  }
  // Shuffle
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }
  return words;
}

function startSession(mode, catId) {
  const queue = buildQueue(catId);
  if (!queue.length) { showToast('No words found!'); return; }

  session = {
    mode,
    queue,
    index: 0,
    correct: 0,
    skipped: 0,
    categoryId: catId,
    isFlipped: false,
    touchStartX: 0,
    touchStartY: 0,
    pendingMode: mode,
    lastCatId: catId
  };

  if (mode === 'flashcard') {
    startFlashcard();
  } else if (mode === 'typing') {
    startTyping();
  }
}

// ---- FLASHCARD MODE ----
function startFlashcard() {
  showView('flashcard');
  const catId = session.categoryId;
  let catName = catId === 'all' ? 'All Categories' : (vocab.categories.find(c => c.id === catId)?.name || '');
  document.getElementById('fc-category-name').textContent = catName;
  renderFlashcard();
  setupFlashcardSwipe();
}

function renderFlashcard() {
  const word = session.queue[session.index];
  if (!word) return;

  document.getElementById('fc-total').textContent = session.queue.length;
  document.getElementById('fc-current').textContent = session.index + 1;
  document.getElementById('fc-bar').style.width = ((session.index / session.queue.length) * 100) + '%';

  const badge = document.getElementById('fc-badge');
  badge.textContent = word.catIcon + ' ' + word.catName;
  badge.style.background = word.catColor + '22';
  badge.style.color = word.catColor;

  document.getElementById('fc-word').textContent = word.en;
  document.getElementById('fc-word-back').textContent = word.en;
  document.getElementById('fc-meaning').textContent = word.id;
  document.getElementById('fc-desc').textContent = word.desc || '';

  const card = document.getElementById('flashcard');
  card.classList.remove('flipped', 'swipe-out-left', 'swipe-out-right');
  session.isFlipped = false;

  // Show/hide learned indicator
  const isLearned = state.learned[word.en];
  badge.style.border = isLearned ? `1px solid ${word.catColor}` : 'none';
}

function flipCard() {
  const card = document.getElementById('flashcard');
  session.isFlipped = !session.isFlipped;
  card.classList.toggle('flipped', session.isFlipped);
}

function nextFlashcard(result) {
  const word = session.queue[session.index];
  const card = document.getElementById('flashcard');

  if (result === 'got') {
    state.learned[word.en] = true;
    session.correct++;
    card.classList.add('swipe-out-right');
    showToast('✅ Got it! +1');
  } else {
    session.skipped++;
    card.classList.add('swipe-out-left');
  }

  saveState();
  updateHeaderStats();

  setTimeout(() => {
    session.index++;
    if (session.index >= session.queue.length) {
      showComplete();
    } else {
      renderFlashcard();
    }
  }, 350);
}

function setupFlashcardSwipe() {
  const fc = document.getElementById('flashcard');
  let startX = 0, startY = 0, isDragging = false, currentX = 0;

  function onStart(e) {
    const t = e.type === 'touchstart' ? e.touches[0] : e;
    startX = t.clientX; startY = t.clientY;
    isDragging = true; currentX = 0;
  }

  function onMove(e) {
    if (!isDragging) return;
    const t = e.type === 'touchmove' ? e.touches[0] : e;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dy) > Math.abs(dx) * 1.5) return;
    currentX = dx;
    fc.style.transform = `translateX(${dx}px) rotate(${dx * 0.05}deg)` + (session.isFlipped ? ' rotateY(180deg)' : '');
    const leftHint = document.getElementById('swipe-left');
    const rightHint = document.getElementById('swipe-right');
    if (dx < -40) { leftHint.style.opacity = Math.min(1, (-dx - 40) / 80); rightHint.style.opacity = 0; }
    else if (dx > 40) { rightHint.style.opacity = Math.min(1, (dx - 40) / 80); leftHint.style.opacity = 0; }
    else { leftHint.style.opacity = 0; rightHint.style.opacity = 0; }
    e.preventDefault();
  }

  function onEnd() {
    if (!isDragging) return;
    isDragging = false;
    fc.style.transform = '';
    document.getElementById('swipe-left').style.opacity = 0;
    document.getElementById('swipe-right').style.opacity = 0;
    if (currentX > 80) nextFlashcard('got');
    else if (currentX < -80) nextFlashcard('skip');
  }

  fc.addEventListener('touchstart', onStart, { passive: true });
  fc.addEventListener('touchmove', onMove, { passive: false });
  fc.addEventListener('touchend', onEnd);
  fc.addEventListener('mousedown', onStart);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onEnd);
}

// ---- TYPING MODE ----
function startTyping() {
  showView('typing');
  renderTypingQuestion();
}

function renderTypingQuestion() {
  const word = session.queue[session.index];
  if (!word) return;

  document.getElementById('type-total').textContent = session.queue.length;
  document.getElementById('type-current').textContent = session.index + 1;
  document.getElementById('type-bar').style.width = ((session.index / session.queue.length) * 100) + '%';

  document.getElementById('type-word').textContent = word.id;
  document.getElementById('type-desc').textContent = word.desc || '';

  const input = document.getElementById('type-input');
  input.value = '';
  input.className = '';
  input.disabled = false;
  input.focus();

  document.getElementById('type-feedback').classList.add('hidden');
  document.getElementById('type-submit').disabled = false;
}

function checkTypingAnswer() {
  const word = session.queue[session.index];
  const input = document.getElementById('type-input');
  const answer = input.value.trim().toLowerCase();
  const correct = word.en.toLowerCase();

  // Flexible check: allow partial match or synonyms
  const isCorrect = answer === correct ||
    correct.startsWith(answer) && answer.length >= Math.max(3, correct.length * 0.7) ||
    answer.includes(correct) || correct.includes(answer) && answer.length >= 3;

  input.disabled = true;
  document.getElementById('type-submit').disabled = true;

  const feedback = document.getElementById('type-feedback');
  const icon = document.getElementById('feedback-icon');
  const correctEl = document.getElementById('feedback-correct');
  const yoursEl = document.getElementById('feedback-yours');

  feedback.classList.remove('hidden');

  if (isCorrect) {
    input.classList.add('correct');
    icon.textContent = '✅';
    correctEl.textContent = word.en;
    correctEl.style.color = 'var(--green)';
    yoursEl.textContent = input.value;
    state.learned[word.en] = true;
    session.correct++;
    saveState();
    updateHeaderStats();
    showToast('✅ Correct! +1');
  } else {
    input.classList.add('wrong');
    icon.textContent = '❌';
    correctEl.textContent = 'Correct: ' + word.en;
    correctEl.style.color = 'var(--orange)';
    yoursEl.textContent = input.value || '(empty)';
    session.skipped++;
    showToast('❌ The answer was: ' + word.en, 2500);
  }
}

function nextTypingQuestion() {
  session.index++;
  if (session.index >= session.queue.length) {
    showComplete();
  } else {
    renderTypingQuestion();
  }
}

// ---- COMPLETE ----
function showComplete() {
  // Update streak
  const today = new Date().toDateString();
  if (state.lastStudyDate !== today) {
    state.streak = (state.streak || 0) + 1;
    state.lastStudyDate = today;
  }
  saveState();
  updateHeaderStats();

  document.getElementById('c-correct').textContent = session.correct;
  document.getElementById('c-skipped').textContent = session.skipped;
  document.getElementById('c-total').textContent = session.queue.length;
  const pct = Math.round((session.correct / session.queue.length) * 100);
  let msg = pct >= 90 ? '🏆 Outstanding! You\'re a food vocab master!' :
            pct >= 70 ? '⭐ Great work! Keep it up!' :
            pct >= 50 ? '💪 Good effort! Practice makes perfect!' :
            '📚 Keep studying! You\'ll get there!';
  document.getElementById('complete-score').textContent = msg;

  showView('complete');
  renderHome();
}

// ---- REVIEW VIEW ----
function renderReview() {
  const list = document.getElementById('review-list');
  const learned = Object.keys(state.learned);
  document.getElementById('review-count-badge').textContent = learned.length + ' words';

  if (!learned.length) {
    list.innerHTML = `<div class="review-empty"><span class="empty-icon">📭</span><p>No learned words yet!<br>Start studying to build your collection.</p></div>`;
    return;
  }

  const allWords = [];
  if (vocab) {
    vocab.categories.forEach(cat => {
      cat.words.forEach(w => {
        if (state.learned[w.en]) allWords.push({ ...w, catId: cat.id, catName: cat.name, catIcon: cat.icon, catColor: cat.color });
      });
    });
  }

  list.innerHTML = allWords.map(w => `
    <div class="review-item">
      <div class="review-badge" style="background:${w.catColor}22; font-size:1.2rem">${w.catIcon}</div>
      <div class="review-words">
        <div class="review-en">${w.en}</div>
        <div class="review-id">${w.id}</div>
        <div class="review-desc">${w.desc || ''}</div>
      </div>
    </div>
  `).join('');
}

// ---- SEARCH ----
function doSearch(query) {
  if (!query.trim() || !vocab) return;
  const q = query.toLowerCase();
  const results = [];
  vocab.categories.forEach(cat => {
    cat.words.forEach(w => {
      if (w.en.toLowerCase().includes(q) || w.id.toLowerCase().includes(q) || (w.desc && w.desc.toLowerCase().includes(q))) {
        results.push({ ...w, catName: cat.name, catIcon: cat.icon });
      }
    });
  });

  document.getElementById('search-result-count').textContent = results.length + ' results';
  const list = document.getElementById('search-results-list');
  if (!results.length) {
    list.innerHTML = `<div class="search-empty"><p>No results for "<strong>${query}</strong>"</p></div>`;
  } else {
    list.innerHTML = results.map(w => `
      <div class="search-item">
        <div class="search-en">${w.en}</div>
        <div class="search-id">${w.id}</div>
        <div class="search-desc">${w.desc || ''}</div>
        <div class="search-cat">${w.catIcon} ${w.catName}</div>
      </div>
    `).join('');
  }
  showView('search');
}

// ---- EVENT LISTENERS ----
document.addEventListener('DOMContentLoaded', () => {

  // Bottom nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.view;
      if (v === 'home') { renderHome(); showView('home'); }
      else if (v === 'flashcard') showCategorySelect('flashcard');
      else if (v === 'typing') showCategorySelect('typing');
      else if (v === 'review') { renderReview(); showView('review'); }
    });
  });

  // Mode cards
  document.getElementById('mode-flashcard')?.addEventListener('click', () => showCategorySelect('flashcard'));
  document.getElementById('mode-type')?.addEventListener('click', () => showCategorySelect('typing'));
  document.getElementById('mode-review')?.addEventListener('click', () => { renderReview(); showView('review'); });

  // Flashcard controls
  document.getElementById('flashcard')?.addEventListener('click', flipCard);
  document.getElementById('fc-flip')?.addEventListener('click', flipCard);
  document.getElementById('fc-got')?.addEventListener('click', () => nextFlashcard('got'));
  document.getElementById('fc-skip')?.addEventListener('click', () => nextFlashcard('skip'));
  document.getElementById('fc-back')?.addEventListener('click', () => { renderHome(); showView('home'); });

  // Typing controls
  document.getElementById('type-back')?.addEventListener('click', () => { renderHome(); showView('home'); });
  document.getElementById('type-submit')?.addEventListener('click', checkTypingAnswer);
  document.getElementById('type-next')?.addEventListener('click', nextTypingQuestion);
  document.getElementById('type-skip')?.addEventListener('click', () => { session.skipped++; nextTypingQuestion(); });
  document.getElementById('type-hint')?.addEventListener('click', () => {
    const word = session.queue[session.index];
    if (word) showToast('💡 Hint: ' + word.en.substring(0, Math.ceil(word.en.length / 2)) + '...', 3000);
  });
  document.getElementById('type-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (!document.getElementById('type-feedback').classList.contains('hidden')) {
        nextTypingQuestion();
      } else {
        checkTypingAnswer();
      }
    }
  });

  // Back buttons
  document.getElementById('cat-back')?.addEventListener('click', () => { renderHome(); showView('home'); });
  document.getElementById('review-back')?.addEventListener('click', () => { renderHome(); showView('home'); });
  document.getElementById('search-back')?.addEventListener('click', () => { renderHome(); showView('home'); });

  // Complete buttons
  document.getElementById('c-again')?.addEventListener('click', () => {
    startSession(session.mode || 'flashcard', session.categoryId || 'all');
  });
  document.getElementById('c-home')?.addEventListener('click', () => { renderHome(); showView('home'); });

  // Reset
  document.getElementById('reset-all-btn')?.addEventListener('click', () => {
    if (confirm('Reset all progress? This cannot be undone.')) {
      state.learned = {}; state.streak = 0;
      saveState(); renderHome(); updateHeaderStats();
      showToast('Progress reset ✓');
    }
  });

  // Search
  document.getElementById('search-toggle')?.addEventListener('click', () => {
    const bar = document.getElementById('search-bar');
    bar.classList.toggle('hidden');
    if (!bar.classList.contains('hidden')) document.getElementById('search-input').focus();
  });
  document.getElementById('search-close')?.addEventListener('click', () => {
    document.getElementById('search-bar').classList.add('hidden');
    document.getElementById('search-input').value = '';
  });
  document.getElementById('search-input')?.addEventListener('input', (e) => {
    if (e.target.value.length >= 2) doSearch(e.target.value);
  });
  document.getElementById('search-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.value.length >= 1) doSearch(e.target.value);
  });

  // Init app
  init();
});
