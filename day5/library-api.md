# Library API Specification - Books Resource

This document specifies the RESTful API endpoints for managing the **Books** resource in the Library Management System.

**Base URL**: `https://api.library.example.com/api/v1`

---

## Overview of Endpoints

| Method | Endpoint | Description | Success Status |
|---|---|---|---|
| `GET` | `/api/v1/books` | Retrieve a list of all library books | `200 OK` |
| `GET` | `/api/v1/books/{id}` | Retrieve details of a single book by ID | `200 OK` |
| `POST` | `/api/v1/books` | Create and catalog a new book | `201 Created` |
| `PUT` | `/api/v1/books/{id}` | Update an existing book's details | `200 OK` |
| `DELETE` | `/api/v1/books/{id}` | Remove a book from the library catalog | `204 No Content` |
| `GET` | `/api/v1/books?author={author}` | Filter library books by author name | `200 OK` |

---

## 1. List All Books

### Request
- **Method**: `GET`
- **Path**: `/api/v1/books`
- **Description**: Returns an array of all cataloged books in the library.
- **Headers**:
  ```http
  Accept: application/json
  ```
- **Request Body**: None

### Success Response (`200 OK`)
```json
{
  "total": 3,
  "books": [
    {
      "id": 1,
      "title": "To Kill a Mockingbird",
      "author": "Harper Lee",
      "isbn": "978-0446310789",
      "publishedYear": 1960,
      "genre": "Fiction",
      "availableCopies": 4
    },
    {
      "id": 2,
      "title": "1984",
      "author": "George Orwell",
      "isbn": "978-0451524935",
      "publishedYear": 1949,
      "genre": "Dystopian",
      "availableCopies": 2
    },
    {
      "id": 3,
      "title": "Animal Farm",
      "author": "George Orwell",
      "isbn": "978-0451526342",
      "publishedYear": 1945,
      "genre": "Satire",
      "availableCopies": 5
    }
  ]
}
```

---

## 2. Get Single Book by ID

### Request
- **Method**: `GET`
- **Path**: `/api/v1/books/{id}`
- **Description**: Returns detailed information for a specific book identified by its numeric ID.
- **Path Parameters**:
  - `id` (integer, required): Unique identifier of the book (e.g., `2`).
- **Request Body**: None

### Success Response (`200 OK`)
```json
{
  "id": 2,
  "title": "1984",
  "author": "George Orwell",
  "isbn": "978-0451524935",
  "publishedYear": 1949,
  "genre": "Dystopian",
  "availableCopies": 2
}
```

### Error Responses

#### `400 Bad Request` (Invalid ID Format)
Occurs when the provided `id` parameter is not a valid integer.
```json
{
  "error": "Bad Request",
  "status": 400,
  "message": "Invalid book ID 'abc'. Book ID must be a positive integer."
}
```

#### `404 Not Found` (Book Not Found)
Occurs when no book exists with the specified `id`.
```json
{
  "error": "Not Found",
  "status": 404,
  "message": "Book with ID 999 does not exist in the catalog."
}
```

---

## 3. Create a Book

### Request
- **Method**: `POST`
- **Path**: `/api/v1/books`
- **Description**: Catalogs a new book entry in the library system.
- **Headers**:
  ```http
  Content-Type: application/json
  Accept: application/json
  ```
- **Example Request Body**:
```json
{
  "title": "The Great Gatsby",
  "author": "F. Scott Fitzgerald",
  "isbn": "978-0743273565",
  "publishedYear": 1925,
  "genre": "Classic",
  "availableCopies": 3
}
```

### Success Response (`201 Created`)
- **Headers**:
  ```http
  Location: /api/v1/books/4
  ```
```json
{
  "id": 4,
  "title": "The Great Gatsby",
  "author": "F. Scott Fitzgerald",
  "isbn": "978-0743273565",
  "publishedYear": 1925,
  "genre": "Classic",
  "availableCopies": 3,
  "createdAt": "2026-10-11T20:55:00Z"
}
```

### Error Responses

#### `400 Bad Request` (Missing Required Fields or Validation Failure)
Occurs when required attributes (`title`, `author`, `isbn`) are omitted or invalid.
```json
{
  "error": "Bad Request",
  "status": 400,
  "message": "Validation failed.",
  "errors": [
    "Field 'title' is required and cannot be empty.",
    "Field 'publishedYear' must be a valid four-digit year."
  ]
}
```

---

## 4. Update a Book

### Request
- **Method**: `PUT`
- **Path**: `/api/v1/books/{id}`
- **Description**: Replaces all attributes of an existing book record.
- **Path Parameters**:
  - `id` (integer, required): Unique identifier of the book to update.
- **Headers**:
  ```http
  Content-Type: application/json
  Accept: application/json
  ```
- **Example Request Body**:
```json
{
  "title": "1984: Special Anniversary Edition",
  "author": "George Orwell",
  "isbn": "978-0451524935",
  "publishedYear": 1949,
  "genre": "Dystopian Classic",
  "availableCopies": 6
}
```

### Success Response (`200 OK`)
```json
{
  "id": 2,
  "title": "1984: Special Anniversary Edition",
  "author": "George Orwell",
  "isbn": "978-0451524935",
  "publishedYear": 1949,
  "genre": "Dystopian Classic",
  "availableCopies": 6,
  "updatedAt": "2026-10-11T20:56:00Z"
}
```

### Error Responses

#### `400 Bad Request` (Malformed Payload or Invalid Values)
Occurs when the request body contains invalid data types or negative inventory values.
```json
{
  "error": "Bad Request",
  "status": 400,
  "message": "Invalid field value: 'availableCopies' cannot be negative."
}
```

#### `404 Not Found` (Book Not Found)
Occurs when attempting to update a book that does not exist.
```json
{
  "error": "Not Found",
  "status": 404,
  "message": "Cannot update book. Book with ID 888 was not found."
}
```

---

## 5. Delete a Book

### Request
- **Method**: `DELETE`
- **Path**: `/api/v1/books/{id}`
- **Description**: Removes an existing book record from the catalog.
- **Path Parameters**:
  - `id` (integer, required): Unique identifier of the book to delete.
- **Request Body**: None

### Success Response (`204 No Content`)
- **Status**: `204 No Content`
- **Response Body**: Empty

### Error Responses

#### `400 Bad Request` (Active Loans Block Deletion)
Occurs when trying to delete a book currently checked out by patrons.
```json
{
  "error": "Bad Request",
  "status": 400,
  "message": "Cannot delete book with ID 2: 2 copies are currently on active loan."
}
```

#### `404 Not Found` (Book Not Found)
Occurs when attempting to delete a book ID that does not exist.
```json
{
  "error": "Not Found",
  "status": 404,
  "message": "Book with ID 555 does not exist."
}
```

---

## 6. Filter Books by Author (Query Parameter)

### Request
- **Method**: `GET`
- **Path**: `/api/v1/books?author={authorName}`
- **Description**: Retrieves all books authored by the specified author name (case-insensitive search).
- **Query Parameters**:
  - `author` (string, required): Author's full or partial name (e.g. `George Orwell`).
- **Example Request**:
  ```http
  GET /api/v1/books?author=George%20Orwell HTTP/1.1
  Host: api.library.example.com
  Accept: application/json
  ```
- **Request Body**: None

### Success Response (`200 OK`)
```json
{
  "filter": {
    "author": "George Orwell"
  },
  "total": 2,
  "books": [
    {
      "id": 2,
      "title": "1984",
      "author": "George Orwell",
      "isbn": "978-0451524935",
      "publishedYear": 1949,
      "genre": "Dystopian",
      "availableCopies": 2
    },
    {
      "id": 3,
      "title": "Animal Farm",
      "author": "George Orwell",
      "isbn": "978-0451526342",
      "publishedYear": 1945,
      "genre": "Satire",
      "availableCopies": 5
    }
  ]
}
```

### Error Responses

#### `400 Bad Request` (Empty Query Parameter)
Occurs when the `author` query parameter is provided but contains no value or only whitespace.
```json
{
  "error": "Bad Request",
  "status": 400,
  "message": "The 'author' query parameter must contain at least 2 characters."
}
```

#### `404 Not Found` (Author Not Found / No Matches)
When no books match the requested author filter in strict query mode:
```json
{
  "error": "Not Found",
  "status": 404,
  "message": "No books found for author 'Unknown Author Name'."
}
```

---

## Common Error Handling Summary

All errors returned by this API adhere to a standard JSON format with appropriate HTTP status codes:

- **`400 Bad Request`**: Malformed JSON syntax, invalid query/path parameters, missing mandatory fields, or violated business rules.
- **`404 Not Found`**: Target book ID does not exist, or filtered resource was not found.
- **`500 Internal Server Error`**: Unexpected server-side failure.
