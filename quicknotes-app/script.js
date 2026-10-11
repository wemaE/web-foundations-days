// QuickNotes App - Task 5: Add localStorage and search

// State
let notes = [];

// Storage keys
const STORAGE_KEY = 'quicknotes';
const FALLBACK_STORAGE_KEY = 'notes';

// DOM Elements
const noteForm = document.getElementById('note-form');
const noteInput = document.getElementById('note-input');
const categorySelect = document.getElementById('category-select');
const errorMessage = document.getElementById('error-message');
const searchInput = document.getElementById('search-input');
const noteCount = document.getElementById('note-count');
const notesList = document.getElementById('notes-list');
const clearAllBtn = document.getElementById('clear-all-btn');

// Format readable creation date
function formatReadableDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

// Persist notes with localStorage and JSON.stringify
function saveNotes() {
  const serialized = JSON.stringify(notes);
  localStorage.setItem(STORAGE_KEY, serialized);
  localStorage.setItem(FALLBACK_STORAGE_KEY, serialized);
}

// Restore notes on page load with localStorage and JSON.parse
function loadNotes() {
  const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(FALLBACK_STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        notes = parsed;
      }
    } catch (e) {
      console.error('Error parsing saved notes from localStorage:', e);
      notes = [];
    }
  }
}

// Update note count message
function updateNoteCount() {
  if (!noteCount) return;

  const count = notes.length;
  if (count === 0) {
    noteCount.textContent = 'You have no notes yet.';
  } else if (count === 1) {
    noteCount.textContent = 'You have 1 note.';
  } else {
    noteCount.textContent = `You have ${count} notes.`;
  }
}

// Render notes to the DOM (supports filtered list for search)
function renderNotes() {
  if (!notesList) return;

  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  let displayNotes = notes;

  if (query) {
    displayNotes = notes.filter((note) =>
      note.text.toLowerCase().includes(query) ||
      note.category.toLowerCase().includes(query)
    );
  }

  notesList.innerHTML = '';

  // Show "No notes match your search." when search returns empty but notes exist
  if (query && displayNotes.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-message';
    li.textContent = 'No notes match your search.';
    notesList.appendChild(li);
    updateNoteCount();
    return;
  }

  displayNotes.forEach((note) => {
    const li = document.createElement('li');
    li.className = `note-card category-${note.category.toLowerCase()}`;
    li.setAttribute('data-id', note.id);

    li.innerHTML = `
      <div class="note-content">
        <div class="note-meta">
          <span class="category-badge badge-${note.category.toLowerCase()}">${escapeHtml(note.category)}</span>
          <span class="note-date">${escapeHtml(note.createdAt)}</span>
        </div>
        <p class="note-text">${escapeHtml(note.text)}</p>
      </div>
      <button type="button" class="delete-btn" data-id="${note.id}" aria-label="Delete note">Delete</button>
    `;

    notesList.appendChild(li);
  });

  updateNoteCount();
}

// Delete an individual note
function deleteNote(id) {
  notes = notes.filter((n) => n.id !== id);
  saveNotes();
  renderNotes();
}

// Basic HTML escaping
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Validate note input
function validateNote(text) {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { valid: false, error: 'Note cannot be empty.' };
  }
  if (trimmed.length > 200 || text.length > 200) {
    return { valid: false, error: 'Note cannot exceed 200 characters.' };
  }
  return { valid: true, error: '' };
}

// Handle Form Submission
if (noteForm) {
  noteForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const rawText = noteInput.value;
    const validation = validateNote(rawText);

    if (!validation.valid) {
      if (errorMessage) {
        errorMessage.textContent = validation.error;
      }
      return;
    }

    // Clear errors after valid submission
    if (errorMessage) {
      errorMessage.textContent = '';
    }

    const newNote = {
      id: Date.now(),
      text: rawText.trim(),
      category: categorySelect.value,
      createdAt: formatReadableDate(new Date())
    };

    notes.unshift(newNote);
    saveNotes();

    // If a search query is active, clear it so user sees their new note
    if (searchInput && searchInput.value) {
      searchInput.value = '';
    }

    renderNotes();

    // Clear input after adding
    noteInput.value = '';
    noteInput.focus();
  });
}

// Clear error on input typing
if (noteInput && errorMessage) {
  noteInput.addEventListener('input', () => {
    if (errorMessage.textContent) {
      errorMessage.textContent = '';
    }
  });
}

// Case-insensitive live search
if (searchInput) {
  searchInput.addEventListener('input', () => {
    renderNotes();
  });
}

// Event Delegation for Delete Buttons
if (notesList) {
  notesList.addEventListener('click', (event) => {
    const target = event.target;
    if (target && target.classList.contains('delete-btn')) {
      const id = Number(target.getAttribute('data-id'));
      deleteNote(id);
    }
  });
}

// Clear All with confirmation dialog
if (clearAllBtn) {
  clearAllBtn.addEventListener('click', () => {
    if (notes.length === 0) return;

    if (confirm('Delete all notes?')) {
      notes = [];
      saveNotes();
      if (searchInput) {
        searchInput.value = '';
      }
      renderNotes();
    }
  });
}

// Initialize on page load
loadNotes();
renderNotes();

// Export for Node/Jest testing if running in module environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getNotes: () => notes,
    setNotes: (newNotes) => { notes = newNotes; },
    validateNote,
    formatReadableDate,
    renderNotes,
    deleteNote,
    saveNotes,
    loadNotes,
    updateNoteCount
  };
}
