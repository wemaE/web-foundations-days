# QuickNotes App

QuickNotes is a lightweight, responsive note-taking web application built with vanilla HTML, CSS, and JavaScript that enables users to effortlessly capture, categorize, search, and manage daily thoughts and tasks. Designed with a clean and distraction-free interface, the application organizes notes into Personal, Work, and Study categories with distinct visual indicators, enforces strict input validation, updates note counters reactively, and persists all data locally in the browser so notes remain accessible across sessions.

## Features

- **Categorized Note Creation**: Add notes categorized as **Personal**, **Work**, or **Study**, tagged with a readable creation date and color-coded left borders.
- **Form Validation**: Automatically validates note inputs against empty submissions or whitespace-only entries (`Note cannot be empty.`) and caps note length at 200 characters (`Note cannot exceed 200 characters.`), clearing error messages upon successful addition.
- **Dynamic Note Counter**: Displays real-time status messages reflecting list state: `"You have no notes yet."`, `"You have 1 note."`, or `"You have N notes."`.
- **Individual & Bulk Deletion**: Delete individual notes with dedicated delete buttons, or clear the entire notebook with a confirmation prompt (`Clear All`).
- **Case-Insensitive Live Search**: Instantly filter notes by content or category as you type, showing `"No notes match your search."` when no items match the query.
- **Persistent Storage**: Utilizes `localStorage` with `JSON.stringify` and `JSON.parse` to persist notes across browser reloads and sessions.
- **Responsive Layout**: Designed with modern CSS Flexbox, rounded card containers, and a 600px mobile breakpoint that gracefully stacks form controls.

## Local Run Instructions

To run the application locally on your computer:

1. Clone or download the repository:
   ```bash
   git clone https://github.com/wemaE/web-foundations-days.git
   cd web-foundations-days/quicknotes-app
   ```

2. Open `index.html` in your web browser:
   - **Directly via Browser**: Double-click `index.html` or drag it into any modern web browser (Google Chrome, Firefox, Safari, Edge).
   - **Using Python HTTP Server**:
     ```bash
     python -m http.server 8000
     ```
     Then navigate to `http://localhost:8000` in your browser.
   - **Using Node / NPX**:
     ```bash
     npx serve .
     ```

## What I Learned

1. **State Management & DOM Manipulation**: Managing an in-memory array of note objects as the single source of truth, synchronizing DOM updates through dedicated render functions, and implementing efficient event delegation for dynamically created elements.
2. **Client-Side Data Persistence**: Leveraging `localStorage` alongside `JSON.stringify` and `JSON.parse` to serialize and restore state seamlessly across page refreshes and browser restarts, while handling edge cases such as empty or corrupted data.
3. **Form Validation & User Feedback**: Implementing robust input validation for empty/whitespace inputs and maximum length constraints, providing immediate accessible error feedback via `#error-message`, and resetting form states upon successful submission.
4. **Responsive CSS Design**: Building clean visual hierarchy with semantic HTML5 elements, CSS Flexbox layouts, category-specific visual accents, and responsive media queries that adapt controls for mobile viewports.
