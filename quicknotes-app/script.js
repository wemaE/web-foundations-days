// QuickNotes App - Task 3: Add notes with categories

// State
let notes = [];

// DOM Elements
const noteForm = document.getElementById('note-form');
const noteInput = document.getElementById('note-input');
const categorySelect = document.getElementById('category-select');
const notesList = document.getElementById('notes-list');

// Format readable creation date
function formatReadableDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

// Render notes to the DOM
function renderNotes() {
  notesList.innerHTML = '';

  notes.forEach((note) => {
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
      <button type="button" class="delete-btn" aria-label="Delete note">Delete</button>
    `;

    notesList.appendChild(li);
  });
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

// Handle Form Submission
if (noteForm) {
  noteForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const text = noteInput.value.trim();
    if (!text) return;

    const newNote = {
      id: Date.now(),
      text: text,
      category: categorySelect.value,
      createdAt: formatReadableDate(new Date())
    };

    notes.push(newNote);
    renderNotes();

    // Clear input after adding
    noteInput.value = '';
    noteInput.focus();
  });
}

// Initial render
renderNotes();
