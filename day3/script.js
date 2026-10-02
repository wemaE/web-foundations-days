let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

// 1. searchNotes(word): return notes whose text contains word (case-insensitive) using filter, toLowerCase, and includes
function searchNotes(word) {
  const searchTerm = word.toLowerCase();
  return notes.filter((note) => note.text.toLowerCase().includes(searchTerm));
}

// 2. longestNote(): return the note object with the most characters, or null if empty
function longestNote() {
  if (notes.length === 0) {
    return null;
  }
  let longest = notes[0];
  for (let i = 1; i < notes.length; i++) {
    if (notes[i].text.length > longest.text.length) {
      longest = notes[i];
    }
  }
  return longest;
}

// 3. countByCategory(): loop through notes and return an object counting personal, work, and study
function countByCategory() {
  const counts = { personal: 0, work: 0, study: 0 };
  for (const note of notes) {
    if (counts.hasOwnProperty(note.category)) {
      counts[note.category]++;
    }
  }
  return counts;
}

// 4. getSummary(): use countByCategory() and template literal (note for 1, notes otherwise)
function getSummary() {
  const counts = countByCategory();
  const total = notes.length;
  const noteWord = total === 1 ? "note" : "notes";
  return `${total} ${noteWord}: ${counts.personal} personal, ${counts.work} work, ${counts.study} study`;
}

// 5. isDuplicate(text): use some() comparing trimmed lowercase text
function isDuplicate(text) {
  const cleaned = text.trim().toLowerCase();
  return notes.some((note) => note.text.trim().toLowerCase() === cleaned);
}

// 6. addNote(text, category): add only when valid, log rejection reason, assign unique numeric id
function addNote(text, category) {
  const validCategories = ["personal", "work", "study"];

  if (typeof text !== "string" || text.trim().length < 1 || text.trim().length > 200) {
    console.log("Rejection: Note text must be between 1 and 200 characters.");
    return false;
  }

  if (isDuplicate(text)) {
    console.log("Rejection: Note text already exists (duplicate).");
    return false;
  }

  if (!validCategories.includes(category)) {
    console.log(`Rejection: Invalid category "${category}". Must be personal, work, or study.`);
    return false;
  }

  const nextId = notes.length > 0 ? Math.max(...notes.map((n) => n.id)) + 1 : 1;
  notes.push({ id: nextId, text: text.trim(), category: category });
  return true;
}

// ==========================================
// Tests
// ==========================================

console.log("--- Testing searchNotes() ---");
// Normal case: search for existing word (case-insensitive)
console.log(searchNotes("javascript")); // Expected: [{ id: 4, text: "Revise JavaScript arrays", category: "study" }]
// Edge case: search with no matching results
console.log(searchNotes("nonexistent word")); // Expected: []

console.log("--- Testing longestNote() ---");
// Normal case: note with the most characters
console.log(longestNote()); // Expected: { id: 3, text: "Email the project report to Grace", category: "work" }
// Edge case: empty notes array (safe test without destroying starting data)
const savedNotesForLongest = [...notes];
notes = [];
console.log(longestNote()); // Expected: null
notes = savedNotesForLongest; // Restored

console.log("--- Testing countByCategory() ---");
// Normal case: count categories in starting data
console.log(countByCategory()); // Expected: { personal: 2, work: 1, study: 2 }
// Edge case: count when notes is empty
const savedNotesForCount = [...notes];
notes = [];
console.log(countByCategory()); // Expected: { personal: 0, work: 0, study: 0 }
notes = savedNotesForCount; // Restored

console.log("--- Testing getSummary() ---");
// Normal case: summary for multiple notes
console.log(getSummary()); // Expected: "5 notes: 2 personal, 1 work, 2 study"
// Edge case: summary for exactly 1 note (singular "note")
const savedNotesForSummary = [...notes];
notes = [{ id: 1, text: "Quick task", category: "personal" }];
console.log(getSummary()); // Expected: "1 note: 1 personal, 0 work, 0 study"
notes = savedNotesForSummary; // Restored

console.log("--- Testing isDuplicate() ---");
// Normal case: duplicate with extra whitespace and different casing
console.log(isDuplicate("  call MUM  ")); // Expected: true
// Edge case: text does not exist
console.log(isDuplicate("Brand new unique note")); // Expected: false

console.log("--- Testing addNote() ---");
// Normal case: adding a valid new note
console.log(addNote("Read a chapter of JavaScript book", "study")); // Expected: true (note added with id 6)
// Edge case 1: reject duplicate text
console.log(addNote("Buy milk and bread", "personal")); // Expected: false (logs rejection message)
// Edge case 2: reject invalid category
console.log(addNote("Plan weekend trip", "leisure")); // Expected: false (logs rejection message)
// Edge case 3: reject empty text
console.log(addNote("", "work")); // Expected: false (logs rejection message)
