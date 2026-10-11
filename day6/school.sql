-- ============================================================================
-- Day 6 Assignment: School Database Schema and Queries
-- Database Engine: SQLite 3
-- ============================================================================

-- Enable SQLite foreign-key constraint enforcement
PRAGMA foreign_keys = ON;

-- Clean up existing tables to allow idempotent script execution
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- ============================================================================
-- 1. Table Definitions
-- ============================================================================

-- Students table: stores student personal information
CREATE TABLE students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    enrolled_date TEXT NOT NULL DEFAULT (CURRENT_DATE)
);

-- Courses table: stores catalog of course offerings
CREATE TABLE courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    credits INTEGER NOT NULL DEFAULT 3
);

-- Enrolments table: junction table establishing many-to-many relationship
CREATE TABLE enrolments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    enrolment_date TEXT NOT NULL DEFAULT (CURRENT_DATE),
    grade TEXT,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    UNIQUE (student_id, course_id)
);

-- ============================================================================
-- 2. Sample Data Insertion
-- ============================================================================

-- Insert students (4 students: 3 enrolled in courses, 1 with no enrolments)
INSERT INTO students (name, email, enrolled_date) VALUES
    ('Alice Johnson', 'alice.johnson@example.com', '2026-09-01'),
    ('Bob Smith', 'bob.smith@example.com', '2026-09-01'),
    ('Carol Williams', 'carol.williams@example.com', '2026-09-02'),
    ('David Brown', 'david.brown@example.com', '2026-09-05');

-- Insert courses (3 courses)
INSERT INTO courses (code, title, credits) VALUES
    ('CS101', 'Introduction to Computer Science', 4),
    ('WEB201', 'Web Development Foundations', 3),
    ('DB301', 'Database Systems & SQL', 3);

-- Insert enrolments (6 enrolments across 3 students; David Brown has 0 enrolments)
INSERT INTO enrolments (student_id, course_id, enrolment_date, grade) VALUES
    (1, 1, '2026-09-05', 'A'),   -- Alice in CS101
    (1, 2, '2026-09-06', 'B+'),  -- Alice in WEB201
    (1, 3, '2026-09-07', 'A-'),  -- Alice in DB301
    (2, 1, '2026-09-05', 'B'),   -- Bob in CS101
    (2, 2, '2026-09-08', 'B'),   -- Bob in WEB201
    (3, 3, '2026-09-09', 'C+');  -- Carol in DB301

-- ============================================================================
-- 3. Five Core SQL Operations
-- ============================================================================

-- Operation 1: List all courses for one student by name
-- Retrieves all courses taken by 'Alice Johnson' with course details and grades
SELECT
    s.name AS student_name,
    c.code AS course_code,
    c.title AS course_title,
    c.credits,
    e.grade
FROM students s
JOIN enrolments e ON s.id = e.student_id
JOIN courses c ON e.course_id = c.id
WHERE s.name = 'Alice Johnson'
ORDER BY c.code ASC;

-- Operation 2: List all students enrolled on one course
-- Retrieves all students enrolled in course 'CS101'
SELECT
    c.code AS course_code,
    c.title AS course_title,
    s.name AS student_name,
    s.email AS student_email,
    e.grade
FROM courses c
JOIN enrolments e ON c.id = e.course_id
JOIN students s ON e.student_id = s.id
WHERE c.code = 'CS101'
ORDER BY s.name ASC;

-- Operation 3: Count students per course using GROUP BY
-- Aggregates enrolments count for every course
SELECT
    c.code AS course_code,
    c.title AS course_title,
    COUNT(e.id) AS student_count
FROM courses c
LEFT JOIN enrolments e ON c.id = e.course_id
GROUP BY c.id, c.code, c.title
ORDER BY student_count DESC, c.code ASC;

-- Operation 4: Find students with no enrolments using LEFT JOIN
-- Identifies students that have no corresponding record in enrolments table
SELECT
    s.id AS student_id,
    s.name AS student_name,
    s.email AS student_email,
    s.enrolled_date
FROM students s
LEFT JOIN enrolments e ON s.id = e.student_id
WHERE e.id IS NULL
ORDER BY s.id ASC;

-- Operation 5: Update one enrolment's grade
-- Updates Alice Johnson's grade in WEB201 from 'B+' to 'A'
UPDATE enrolments
SET grade = 'A'
WHERE student_id = (SELECT id FROM students WHERE name = 'Alice Johnson')
  AND course_id = (SELECT id FROM courses WHERE code = 'WEB201');

-- Verification query confirming Operation 5 updated the grade successfully
SELECT
    s.name AS student_name,
    c.code AS course_code,
    c.title AS course_title,
    e.grade AS updated_grade
FROM enrolments e
JOIN students s ON e.student_id = s.id
JOIN courses c ON e.course_id = c.id
WHERE s.name = 'Alice Johnson'
  AND c.code = 'WEB201';
