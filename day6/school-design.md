# School Database Design & Architecture

This document describes the schema architecture, relational modeling, performance indexing strategy, and database paradigm evaluation for the school management database implemented in [`school.sql`](school.sql).

---

## 1. Table Definitions & Purpose

The database schema models an academic institution tracking students, the course catalog, and class enrolments.

### `students` Table
- **Purpose**: Stores core demographic and account details for every learner registered at the school.
- **Attributes**:
  - `id` (`INTEGER PRIMARY KEY AUTOINCREMENT`): Unique numeric surrogate key identifying each student.
  - `name` (`TEXT NOT NULL`): The full legal name of the student.
  - `email` (`TEXT NOT NULL UNIQUE`): Primary communication handle and login identifier. Enforced with a `UNIQUE` constraint to avoid duplicate student profiles.
  - `enrolled_date` (`TEXT NOT NULL DEFAULT CURRENT_DATE`): ISO-8601 formatted date representing when the student was admitted to the school.

### `courses` Table
- **Purpose**: Serves as the official curriculum catalog of courses offered by the academic institution.
- **Attributes**:
  - `id` (`INTEGER PRIMARY KEY AUTOINCREMENT`): Unique numeric surrogate key for the course.
  - `code` (`TEXT NOT NULL UNIQUE`): Official institutional course code (e.g., `CS101`, `WEB201`, `DB301`). Enforced as unique to prevent duplicate catalog entries.
  - `title` (`TEXT NOT NULL`): Descriptive title of the course.
  - `credits` (`INTEGER NOT NULL DEFAULT 3`): Academic credit units awarded upon successful completion.

### `enrolments` Table
- **Purpose**: Acts as an associative junction (bridge) table linking students to courses, representing active class registrations and academic outcomes.
- **Attributes**:
  - `id` (`INTEGER PRIMARY KEY AUTOINCREMENT`): Unique surrogate key for each enrolment record.
  - `student_id` (`INTEGER NOT NULL`): Foreign key referencing `students(id)`.
  - `course_id` (`INTEGER NOT NULL`): Foreign key referencing `courses(id)`.
  - `enrolment_date` (`TEXT NOT NULL DEFAULT CURRENT_DATE`): The date the student registered for the course.
  - `grade` (`TEXT`): Letter grade assigned for the course (e.g., `A`, `B+`, `A-`). Nullable initially while a course is in progress.
  - `UNIQUE (student_id, course_id)`: Composite constraint ensuring a student cannot be enrolled in the same course more than once simultaneously.
  - `FOREIGN KEY (...) ON DELETE CASCADE`: Ensures referential integrity; deleting a student or a course cascades to clean up associated enrolment entries.

---

## 2. Relationships & Why the Junction Table is Needed

### Understanding the Relationships
In an academic setting, relationships between entities naturally fall into two primary structural forms:

1. **One-to-Many ($1:N$) Relationship**:
   - A single student can have multiple course enrolments over time ($1 \text{ student} \to N \text{ enrolments}$).
   - A single course can be taken by multiple enrolled students ($1 \text{ course} \to N \text{ enrolments}$).

2. **Many-to-Many ($M:N$) Relationship**:
   - A student enrolls in many courses.
   - A course contains many students.
   - Therefore, the conceptual relationship between `students` and `courses` is **Many-to-Many ($M:N$)**.

### Why the `enrolments` Junction Table is Essential
Relational database management systems (RDBMS) adhering to the relational model cannot directly represent an $M:N$ relationship between two tables without severe design flaws:

- **Violates First Normal Form (1NF)**: If we attempted to store a comma-separated list of course IDs inside a single `students.courses` column (e.g., `"1, 2, 3"`), we violate the atomicity requirement of 1NF. Querying, indexing, joining, or updating individual courses would require costly string parsing, regex operations, and full table scans.
- **Avoids Redundant Columns**: Adding repeated columns like `course_1`, `course_2`, `course_3` in `students` imposes an arbitrary limit on course registrations, wastes disk storage with `NULL` values, and requires schema alterations whenever registration capacity increases.
- **Avoids Massive Data Duplication**: Placing foreign keys on either table directly creates redundant rows. Duplicating student information for every course they attend introduces insert, update, and deletion anomalies.
- **Captures Relationship-Specific Attributes**: An enrolment is an independent event with its own lifecycle and metadata—such as `enrolment_date` and `grade`. Neither the `students` table nor the `courses` table can logically hold these attributes because a grade belongs strictly to the **intersection** of a specific student in a specific course.

The `enrolments` bridge table decomposes the $M:N$ relationship into two clean, normalized $1:N$ relationships (`students` $\to$ `enrolments` and `courses` $\to$ `enrolments`), guaranteeing referential integrity, flexible queries, and optimal storage.

---

## 3. Recommended Performance Index

### Recommended Index
```sql
CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);
```

### Rationale & Impact
While SQLite automatically creates an internal B-tree index for primary keys and unique constraints (including `UNIQUE(student_id, course_id)`), **foreign key columns on the "many" side of a relationship are not automatically indexed by default**.

The existing composite unique constraint `UNIQUE(student_id, course_id)` provides an index where `student_id` is the leading column. This optimizes lookups where `student_id` is filtered (such as finding all courses for a given student). However, it **cannot** be efficiently utilized when searching or joining strictly by `course_id`.

By creating an explicit index on `enrolments(course_id)`:
1. **Accelerates Reverse Joins**: Querying all students enrolled in a course (`JOIN enrolments e ON c.id = e.course_id`) improves from an $O(N)$ full table scan of the entire `enrolments` table to an $O(\log N)$ logarithmic index seek.
2. **Speeds Up Aggregate Operations**: Aggregations like `COUNT(e.id) ... GROUP BY c.id` can leverage index scanning rather than loading unindexed rows into memory.
3. **Enhances Foreign Key Integrity Checks**: When deleting a row from `courses`, SQLite's `PRAGMA foreign_keys = ON` must inspect `enrolments` to execute the cascade. With an index on `course_id`, foreign key cascade validation runs almost instantaneously.

---

## 4. Architectural Evaluation: SQL vs. NoSQL

For an academic school management and course registration system, a **relational (SQL) database is definitively the superior architectural choice**. 

Academic records demand strict consistency, entity normalization, and complex relational querying. Student enrolments represent a quintessential relational data model with many-to-many associations among students, courses, grades, instructors, and departments. In a NoSQL document database (such as MongoDB), designers are forced to either embed course subdocuments inside student records or maintain manual references. Embedding courses inside student documents causes acute data duplication and dangerous update anomalies: if a course title or credit count changes, hundreds of embedded student documents must be modified simultaneously across uncoordinated writes, risking widespread catalog divergence. Furthermore, school systems require strict **ACID transactions** to manage class registration caps, grade submissions, and prerequisite checks; a relational database guarantees that concurrent enrolments do not oversubscribe a classroom through atomic row locking and unique constraints. Finally, administrative workflows require complex ad-hoc reporting—such as joining tables to identify unenrolled students, computing class grade distributions via `GROUP BY`, or calculating student GPAs—all of which are native, declarative, and high-performance in SQL, but awkward and error-prone in document-oriented aggregation pipelines.
