// QuickNotes Day 4 - Character Counter, LocalStorage & Theme

// DOM Elements
const noteText = document.getElementById('note-text');
const charCount = document.getElementById('char-count');
const wordCount = document.getElementById('word-count');
const clearBtn = document.getElementById('clear-btn');
const themeToggle = document.getElementById('theme-toggle');

// Calculate word count from given text
function getWordCount(text) {
  const trimmed = text.trim();
  if (trimmed === '') {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

// Update character and word counters, including warning / over-limit states
function updateCounters() {
  const text = noteText.value;
  const chars = text.length;
  const words = getWordCount(text);

  // Live counters text
  charCount.textContent = `${chars} / 200 characters`;
  wordCount.textContent = `${words} words`;

  // Warning above 180 characters and over-limit styling above 200
  if (chars > 200) {
    charCount.classList.remove('warning');
    charCount.classList.add('over');
  } else if (chars > 180) {
    charCount.classList.add('warning');
    charCount.classList.remove('over');
  } else {
    charCount.classList.remove('warning');
    charCount.classList.remove('over');
  }
}

// Save draft to localStorage
function saveDraft() {
  localStorage.setItem('draft', noteText.value);
  localStorage.setItem('noteDraft', noteText.value);
}

// Restore draft from localStorage
function restoreDraft() {
  const savedDraft =
    localStorage.getItem('draft') ??
    localStorage.getItem('noteDraft');

  if (savedDraft !== null && savedDraft !== undefined) {
    noteText.value = savedDraft;
  }
  updateCounters();
}

// Clear note text, counters, and saved draft
function clearNote() {
  noteText.value = '';
  updateCounters();
  localStorage.removeItem('draft');
  localStorage.removeItem('noteDraft');
}

// Apply theme to body and update toggle button label
function applyTheme(isDark) {
  if (isDark) {
    document.body.classList.add('dark');
    themeToggle.textContent = 'Light mode';
  } else {
    document.body.classList.remove('dark');
    themeToggle.textContent = 'Dark mode';
  }
}

// Toggle between light and dark themes and persist to localStorage
function toggleTheme() {
  const isDark = !document.body.classList.contains('dark');
  applyTheme(isDark);
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// Restore saved theme from localStorage
function restoreTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    applyTheme(true);
  } else {
    applyTheme(false);
  }
}

// Event Listeners
if (noteText) {
  noteText.addEventListener('input', () => {
    updateCounters();
    saveDraft();
  });

  // Escape clears the textarea
  noteText.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      clearNote();
    }
  });
}

if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    clearNote();
  });
}

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    toggleTheme();
  });
}

// Global Escape key listener in case textarea is not focused
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    clearNote();
  }
});

// Initialization
restoreTheme();
restoreDraft();

// Export for Node/Jest environments if applicable
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getWordCount,
    updateCounters,
    saveDraft,
    restoreDraft,
    clearNote,
    applyTheme,
    toggleTheme,
    restoreTheme,
  };
}
