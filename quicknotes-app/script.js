// QuickNotes App - Task 4: Add validation, delete and count

// State
let notes = [];

// DOM Elements
const noteForm = document.getElementById('note-form');
const noteInput = document.getElementById('note-input');
const categorySelect = document.getElementById('category-select');
const errorMessage = document.getElementById('error-message');
const noteCount = document.getElementById('note-count');
const notesList = document.getElementById('notes-list');

// Format readable creation date
function formatReadableDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
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
      <button type="button" class="delete-btn" data-id="${note.id}" aria-label="Delete note">Delete</button>
    `;

    notesList.appendChild(li);
  });

  updateNoteCount();
}

// Delete an individual note
function deleteNote(id) {
  notes = notes.filter((n) => n.id !== id);
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

    notes.push(newNote);
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

// Initial render & count
renderNotes();
