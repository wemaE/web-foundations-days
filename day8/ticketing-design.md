# TicketHub: Event Ticketing System Design

This document details the system design, capacity planning, data model, API architecture, and high-concurrency booking mechanisms for **TicketHub**, a scalable concert and event ticketing platform engineered to handle both standard day-to-day operations and high-velocity flash sales.

---

## 1. Requirements

### 1.1 Functional Requirements
- **Event Discovery & Browsing**: Users can search, filter (by artist, venue, genre, date), and view detailed event pages.
- **Interactive Seat Map & Availability**: Users can inspect real-time seat availability across venue sections, rows, and pricing tiers.
- **Temporary Seat Holds (Cart Reservation)**: Users can lock up to 4 contiguous seats for a limited window (e.g., 10 minutes) while completing payment.
- **Secure Payment & Order Processing**: Users can purchase held seats via credit cards, digital wallets, or third-party payment gateways (Stripe/Adyen) with instant transaction confirmation.
- **Order History & Digital Ticket Issuance**: Upon successful payment, users receive a verified booking confirmation with cryptographic QR codes and downloadable PDF/wallet passes.
- **Automated Hold Expiration**: If a user abandons checkout or the 10-minute hold window elapses, reserved seats are atomically released back into the available pool.

### 1.2 Non-Functional Requirements
- **Response Speed (Low Latency)**:
  - Static event details and catalog browsing served in $< 50\text{ ms}$ via edge caching.
  - Seat availability queries served in $< 150\text{ ms}$.
  - Seat hold and checkout mutation transactions executed in $< 500\text{ ms}$.
- **Reliability & Availability**:
  - Target 99.99% availability for browsing and read operations.
  - Graceful degradation during traffic surges via rate-limiting and a virtual waiting room.
- **Correctness & Zero Double-Booking (High Consistency)**:
  - Absolute ACID consistency on seat allocation. Under no circumstance may the same physical seat be sold or concurrently held by two different users.
- **Fairness During High-Demand Sales**:
  - Virtual Waiting Room (FIFO / randomized queue) to prevent queue-jumping, distribute load, and thwart automated bot attacks.
  - Per-account ticket caps (maximum 4 tickets per transaction) to prevent scalping.
- **Security & Regulatory Compliance**:
  - PCI-DSS Level 1 compliance: payment credentials are tokenized directly through the payment gateway SDK; no raw card numbers touch TicketHub application servers or databases.
  - Transport-layer encryption (TLS 1.3), rate-limiting per IP/user, and Cloudflare Turnstile/CAPTCHA verification on high-demand sale endpoints.

---

## 2. Traffic Estimates & Capacity Planning

### 2.1 Given Facts & Core Metrics
- **Registered User Base**: 2,000,000 (2 million) registered users.
- **Normal Daily Visitors**: 50,000 visitors per day.
- **Pages per Visitor (Normal)**: 10 page views per visitor.
- **Normal Daily Ticket Volume**: 5,000 tickets sold per day.
- **Concert Flash Sale Demand**: 200,000 people competing for 20,000 available seats within the first 10 minutes.
- **Time Constants**: 86,400 seconds per day; 600 seconds per 10-minute flash sale window.

---

### 2.2 Normal Day Calculations (24-Hour Horizon)

#### 1. Normal Daily Page Views
$$\text{Normal Daily Page Views} = 50{,}000 \text{ visitors} \times 10 \text{ pages/visitor} = 500{,}000 \text{ page views/day}$$

#### 2. Average Page Views per Second
$$\text{Average Page Views/sec} = \frac{500{,}000 \text{ page views}}{86{,}400 \text{ seconds}} \approx 5.787 \approx 5.79 \text{ page views/sec}$$

#### 3. Average HTTP Requests per Second (Including Assets & API Calls)
- *Supplied Fact*: 500,000 page views per day.
- *Explicit Engineering Assumption*: Each page view generates on average 5 HTTP requests (1 HTML page document, 1 API call for dynamic pricing/availability, and 3 cacheable static/CDN assets).
$$\text{Total Daily Requests} = 500{,}000 \times 5 = 2{,}500{,}000 \text{ requests/day}$$
$$\text{Average Requests/sec (24h)} = \frac{2{,}500{,}000}{86{,}400} \approx 28.94 \text{ requests/sec}$$

#### 4. Normal Ticket Sales Velocity
$$\text{Normal Ticket Sales/sec} = \frac{5{,}000 \text{ tickets}}{86{,}400 \text{ seconds}} \approx 0.0579 \text{ tickets/sec} \approx 3.47 \text{ tickets/minute}$$

---

### 2.3 Popular Concert Flash Sale Calculations (First 10 Minutes)

#### 1. Average Arrival Rate per Second
- *Supplied Fact*: 200,000 users arrive within 10 minutes ($600\text{ seconds}$).
$$\text{Average User Arrival Rate} = \frac{200{,}000 \text{ users}}{600 \text{ seconds}} \approx 333.33 \text{ users/sec}$$

- *Burst & API Load Consideration (Engineering Assumption)*:
  During an active sale drop, users refresh the seat map and attempt multiple seat holds. If each active user generates 5 requests/minute (polling every 12 seconds), the peak API query volume is:
  $$\text{Peak Ingress Load} = \frac{200{,}000 \times 5}{60} \approx 16{,}667 \text{ requests/sec}$$

#### 2. Percentage of Interested Buyers Who Can Obtain Seats
- *Supplied Fact*: 20,000 seats available, 200,000 competing buyers.
$$\text{Success Ratio} = \left(\frac{20{,}000 \text{ available seats}}{200{,}000 \text{ interested buyers}}\right) \times 100\% = 10\%$$
- **10% of buyers** can obtain a seat if each buyer purchases exactly 1 ticket.
- If buyers purchase an average of 2 tickets each, only **10,000 buyers (5%)** will secure tickets, leaving 95% of buyers empty-handed.

#### 3. Ticket Sale Rate Needed to Sell All 20,000 Seats in 10 Minutes
$$\text{Required Sale Rate} = \frac{20{,}000 \text{ seats}}{600 \text{ seconds}} \approx 33.33 \text{ tickets/sec}$$
- Expressed per minute: $33.33 \times 60 = 2{,}000 \text{ tickets/minute}$.

---

### 2.4 Comparison: Normal Day vs. Peak Flash Sale

| Metric | Normal Day (24-Hour Average) | Flash Sale Drop (10-Minute Peak) | Scale Factor Surge | Nature of Figure |
| :--- | :--- | :--- | :--- | :--- |
| **Concurrent Active Users** | $\sim 500 - 1{,}000$ | $200{,}000$ concurrent | **$200\times - 400\times$** | Supplied Fact |
| **User Arrival Velocity** | $0.58\text{ arrivals/sec}$ | $333.33\text{ arrivals/sec}$ | **$575\times$** | Calculated from Given Facts |
| **Checkout/Sale Write Rate**| $0.058\text{ tickets/sec}$ | $33.33\text{ tickets/sec}$ | **$575\times$** | Calculated from Given Facts |
| **Peak Inbound Request RPS**| $\sim 29\text{ req/sec}$ | $\sim 16{,}667\text{ req/sec}$ | **$575\times$** | Engineering Assumption |
| **Inventory Contention** | Near-zero (abundant seats) | Extreme ($10$ users per seat) | **Extreme** | Derived Metric |

---

## 3. API Design

TicketHub provides a versioned RESTful API returning standard JSON payloads, adhering to HTTP status conventions and enforcing idempotency on mutable financial transactions.

### 3.1 Endpoints Summary

| Method | Endpoint | Purpose | Success Status | Error Statuses |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/events` | Browse and filter upcoming events | `200 OK` | `400`, `500` |
| `GET` | `/api/v1/events/{id}/seats` | Inspect real-time seat availability & pricing | `200 OK` | `404`, `500` |
| `POST` | `/api/v1/events/{id}/holds` | Acquire temporary 10-minute hold on specific seats | `201 Created` | `400`, `401`, `409`, `429` |
| `POST` | `/api/v1/orders/checkout` | Process payment and confirm order for held seats | `200 OK` | `400`, `402`, `409`, `410` |
| `GET` | `/api/v1/users/me/tickets` | View purchased tickets with cryptographic QR codes | `200 OK` | `401`, `500` |

---

### 3.2 Endpoint Specifications & Payloads

#### 1. Browse Events: `GET /api/v1/events`
- **Purpose**: Paginated search across public events.
- **Query Parameters**: `genre=rock&venue=Madison+Square+Garden&page=1&limit=20`
- **Response (`200 OK`)**:
```json
{
  "events": [
    {
      "id": "evt_8921a",
      "title": "The Midnight Echo World Tour",
      "artist": "The Midnight Echo",
      "venue": "Apex Arena, New York",
      "event_date": "2026-11-20T19:30:00Z",
      "total_seats": 20000,
      "available_seats": 1420,
      "min_price_cents": 6500
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total_pages": 4,
    "total_events": 73
  }
}
```

---

#### 2. View Seat Availability: `GET /api/v1/events/{id}/seats`
- **Purpose**: Retrieve seat status (`AVAILABLE`, `HELD`, `SOLD`) for an event seat map.
- **Response (`200 OK`)**:
```json
{
  "event_id": "evt_8921a",
  "generated_at": "2026-10-11T23:00:00Z",
  "seats": [
    {
      "seat_id": 10421,
      "section": "A1",
      "row": "D",
      "seat_number": 12,
      "price_cents": 12000,
      "status": "AVAILABLE"
    },
    {
      "seat_id": 10422,
      "section": "A1",
      "row": "D",
      "seat_number": 13,
      "price_cents": 12000,
      "status": "HELD"
    }
  ]
}
```

---

#### 3. Hold Seats: `POST /api/v1/events/{id}/holds`
- **Purpose**: Atomically hold 1–4 seats for 10 minutes while the user is in checkout.
- **Request Headers**: `Authorization: Bearer <jwt_token>`
- **Request Body**:
```json
{
  "seat_ids": [10421, 10422]
}
```
- **Response (`201 Created`)**:
```json
{
  "hold_token": "hld_7c99e120f",
  "event_id": "evt_8921a",
  "seat_ids": [10421, 10422],
  "expires_at": "2026-10-11T23:10:00Z",
  "expires_in_seconds": 600,
  "total_price_cents": 24000
}
```
- **Conflict Handling (`409 Conflict`)**:
```json
{
  "error": "SEATS_UNAVAILABLE",
  "message": "One or more requested seats (seat_id: 10421) are currently held by another user or already sold.",
  "unavailable_seat_ids": [10421]
}
```

---

#### 4. Pay for Order: `POST /api/v1/orders/checkout`
- **Purpose**: Finalize transaction, bill payment card via token, and convert held seats into `SOLD`.
- **Request Headers**:
  - `Authorization: Bearer <jwt_token>`
  - `Idempotency-Key: 9b2d8e41-0f82-4f0e-b7a4-37f225d3a956`
- **Request Body**:
```json
{
  "hold_token": "hld_7c99e120f",
  "event_id": "evt_8921a",
  "seat_ids": [10421, 10422],
  "payment_method_token": "pm_tok_visa_4242",
  "amount_cents": 24000
}
```
- **Success Response (`200 OK`)**:
```json
{
  "order_id": "ord_8820491",
  "status": "CONFIRMED",
  "transaction_id": "tx_stripe_9921448",
  "total_cents": 24000,
  "confirmed_seats": [
    { "seat_id": 10421, "section": "A1", "row": "D", "seat_number": 12 },
    { "seat_id": 10422, "section": "A1", "row": "D", "seat_number": 13 }
  ],
  "qr_code_verification_url": "https://tickethub.io/verify/ord_8820491"
}
```
- **Hold Expired Error (`410 Gone` / `409 Conflict`)**:
```json
{
  "error": "HOLD_EXPIRED",
  "message": "Your 10-minute seat hold expired at 2026-10-11T23:10:00Z. The seats have been returned to the public pool and your card was not charged.",
  "expired_at": "2026-10-11T23:10:00Z"
}
```
- **Payment Decline Error (`402 Payment Required` or `422 Unprocessable Entity`)**:
```json
{
  "error": "PAYMENT_DECLINED",
  "message": "Your card was declined: Insufficient funds. Your seat hold remains active for 4 minutes 12 seconds. Please provide another payment method.",
  "hold_expires_at": "2026-10-11T23:10:00Z",
  "remaining_seconds": 252
}
```

---

#### 5. View Purchased Tickets: `GET /api/v1/users/me/tickets`
- **Purpose**: Retrieve confirmed digital tickets with QR bar codes.
- **Request Headers**: `Authorization: Bearer <jwt_token>`
- **Response (`200 OK`)**:
```json
{
  "tickets": [
    {
      "ticket_id": "tkt_5501",
      "order_id": "ord_8820491",
      "event_title": "The Midnight Echo World Tour",
      "venue": "Apex Arena, New York",
      "event_date": "2026-11-20T19:30:00Z",
      "seat": { "section": "A1", "row": "D", "seat_number": 12 },
      "barcode_signature": "HMAC_SHA256_v1_c08b29f9e1",
      "pass_status": "ACTIVE"
    }
  ]
}
```

---

## 4. Data Model

The TicketHub data model is implemented on a relational database (PostgreSQL) to leverage strict ACID semantics, row-level locking, foreign key integrity, and serializable transactions.

```
+---------------+           +---------------+
|     users     | 1       * |    orders     |
+---------------+-----------+---------------+
| id (PK)       |           | id (PK)       |
| email (UQ)    |           | user_id (FK)  |
| full_name     |           | event_id (FK) |
| password_hash |           | total_cents   |
| created_at    |           | status        |
+---------------+           +---------------+
        |                           |
        | 1                         | 1
        |                           |
        | *                         | *
+---------------+ 1       * +------------------+
|     seats     |-----------|   seat_allocations|
+---------------+           +------------------+
| id (PK)       |           | id (PK)          |
| event_id (FK) |           | order_id (FK)    |
| section       |           | seat_id (FK)     |
| row           |           | event_id (FK)    |
| seat_number   |           | price_cents      |
| status        |           +------------------+
| hold_token    |
| hold_user_id  |
| hold_expires  |
| version       |
+---------------+
```

---

### 4.1 SQL Table Definitions & Constraints

```sql
-- 1. USERS TABLE
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 2. EVENTS TABLE
CREATE TABLE events (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    artist VARCHAR(255) NOT NULL,
    venue VARCHAR(255) NOT NULL,
    event_date TIMESTAMP WITH TIME ZONE NOT NULL,
    total_seats INTEGER NOT NULL CHECK (total_seats > 0),
    sale_starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 3. SEATS TABLE (With seat-hold columns & concurrency version)
CREATE TABLE seats (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    section VARCHAR(30) NOT NULL,
    row VARCHAR(10) NOT NULL,
    seat_number INTEGER NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE' 
        CHECK (status IN ('AVAILABLE', 'HELD', 'SOLD')),
    held_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    hold_token VARCHAR(64),
    hold_expires_at TIMESTAMP WITH TIME ZONE,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Absolute physical seat uniqueness per venue/event
    CONSTRAINT uq_event_section_row_seat UNIQUE (event_id, section, row, seat_number)
);

-- 4. ORDERS TABLE
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    total_amount_cents INTEGER NOT NULL CHECK (total_amount_cents >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PAID', 'CANCELLED', 'EXPIRED')),
    payment_intent_id VARCHAR(100),
    idempotency_key VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 5. SEAT_ALLOCATIONS TABLE
--    This is the authoritative record of which confirmed order owns which seat.
--    It is separate from the seats table so the unique constraint is always
--    enforced on CONFIRMED bookings, independently of transient hold state.
CREATE TABLE seat_allocations (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    seat_id BIGINT NOT NULL REFERENCES seats(id) ON DELETE RESTRICT,
    event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),

    -- DATABASE-ENFORCED: A (event, seat) pair can appear in at most ONE
    -- confirmed allocation. Even if application-level logic is bypassed by
    -- a retry storm or a bug, the database engine raises constraint violation
    -- error 23505, making double-booking physically impossible.
    CONSTRAINT uq_seat_allocation UNIQUE (event_id, seat_id)
);
```

---

### 4.2 Indexes & Performance Justification

1. **`CREATE INDEX idx_seats_event_status ON seats(event_id, status);`**
   - *Justification*: Accelerates the seat map read endpoint (`GET /api/v1/events/{id}/seats`), filtering instantly by event and status (`AVAILABLE` vs `HELD` vs `SOLD`) without full table scans.
2. **`CREATE INDEX idx_seats_hold_expiry ON seats(hold_expires_at) WHERE status = 'HELD';`**
   - *Justification*: Partial index allowing the background hold cleaner worker to execute `WHERE status = 'HELD' AND hold_expires_at < NOW()` in sub-millisecond time.
3. **`CREATE UNIQUE INDEX uq_orders_idempotency ON orders(idempotency_key);`**
   - *Justification*: Enforces strict at-most-once payment processing, guaranteeing that client retries or network hiccups do not create duplicate order records.

---

## 5. System Architecture

TicketHub employs a decoupled, multi-tier cloud architecture designed to isolate heavy read traffic and burst connection spikes from the critical transactional write path.

### 5.1 Architecture Diagram

```
                              +-------------------------+
                              |      Web & Mobile       |
                              |         Clients         |
                              +-------------------------+
                                           |
                                           v
                              +-------------------------+
                              |     Cloudflare CDN      |
                              |  (Edge Cache & WAF /    |
                              |  Turnstile Bot Shield)  |
                              +-------------------------+
                                           |
                                           v
                              +-------------------------+
                              |   Virtual Waiting Room  |
                              |   (Traffic Gatekeeper   |
                              |   & Token Rate Bucket)  |
                              +-------------------------+
                                           |
                                           v
                              +-------------------------+
                              |   Application Load      |
                              |        Balancer         |
                              +-------------------------+
                                           |
                         +-----------------+-----------------+
                         |                                   |
                         v                                   v
             +-----------------------+           +-----------------------+
             |  App Server Node 1    |           |  App Server Node 2..N |
             |  (Stateless Service)  |           |  (Stateless Service)  |
             +-----------------------+           +-----------------------+
                         |                                   |
            +------------+------------+         +------------+------------+
            |                         |         |                         |
            v                         v         v                         v
+-----------------------+   +-----------------------+   +-----------------------+
|  Redis Cluster Cache  |   |  Primary Database     |   |  Read Replica DB      |
|  - Fast Seat Bitmaps  |   |  (PostgreSQL Primary) |   |  (PostgreSQL Replica) |
|  - Waiting Room Tokens|   |  - ACID Seat Holds    |   |  - Read Event Catalog |
|  - Advisory Locks     |   |  - Financial Checkout |   |  - Historical Orders  |
|  (Optimization Only)  |   |  - seat_allocations   |   |                       |
+-----------------------+   +-----------------------+   +-----------------------+
                                      |
                         +------------+------------+
                         |                         |
                         v                         v
            +-------------------------+   +-------------------------+
            |   Stripe / Payment GW   |   |   RabbitMQ / Celery     |
            |   (External API Webhook)|   |   (Async Worker Queue)  |
            +-------------------------+   +-------------------------+
                                                       |
                                                       v
                                          +-------------------------+
                                          |   Background Workers    |
                                          |   - Hold Expiry Sweeper |
                                          |   - QR Ticket Generator |
                                          |   - Confirmation Emails |
                                          +-------------------------+
```

---

### 5.2 Component Breakdown

1. **Clients (Web & Mobile Apps)**: User interfaces executing seat selection, real-time polling via Server-Sent Events (SSE), and direct checkout.
2. **Cloudflare CDN & Edge WAF**: Terminates SSL/TLS, absorbs DDoS attacks, protects endpoints via Cloudflare Turnstile CAPTCHA, and serves static event content directly from edge caches.
3. **Virtual Waiting Room**: Throttles the 200,000 flash sale arrivals into a steady, controlled admission rate (e.g., admitting 500 users/second) through cryptographic admission cookies, protecting downstream infrastructure from crash-level concurrency.
4. **Application Load Balancer (AWS ALB)**: Distributes incoming HTTPS requests evenly across stateless backend instances using round-robin and active health checks.
5. **Application Servers (App Server Nodes 1..N)**: Horizontally auto-scaled backend nodes (Node.js/Go) executing business logic, input validation, and database transaction orchestration.
6. **Redis Cluster (In-Memory Data Store)**: Maintains high-speed seat availability bitmaps for the interactive seat map, stores waiting-room queue state, and provides optional short-lived advisory locks as a **performance optimization only**. Redis locks serve as a fast pre-filter to shed obviously redundant requests before they reach PostgreSQL; they are **never** the source of truth for seat ownership and cannot substitute for database-level locking.
7. **PostgreSQL Primary Database**: Single write master enforcing ACID transactions, row-level locks (`SELECT ... FOR UPDATE`), and the hard `UNIQUE(event_id, seat_id)` constraint on `seat_allocations` for seat holds and order creation. This is the sole source of truth for all booking state.
8. **PostgreSQL Read Replicas**: Replicated read-only nodes absorbing search, event browsing, and historical order lookups to keep the primary database unburdened.
9. **Stripe / Payment Gateway**: External PCI-compliant provider executing payment card captures and delivering asynchronous success webhooks.
10. **RabbitMQ / Async Workers**: Message queue and background workers asynchronously processing PDF ticket rendering, barcode signing, email dispatch, and sweeping expired holds.

---

### 5.3 Handling Flash Sale Traffic Without Losing Correctness

1. **Traffic Decoupling via Virtual Waiting Room**: When 200,000 users arrive at 10:00 AM, the CDN and Waiting Room intercept 100% of ingress traffic. Users enter a fair FIFO queue and receive an encrypted queue token.
2. **Metered Admission**: The queue admits users in small batches matching database capacity (e.g., 200–500 buyers/sec). 
3. **Read/Write Separation**: 95% of requests (seat map views) hit Redis read-caches and PostgreSQL Read Replicas.
4. **Primary Write Isolation**: Only the critical hold mutation (`POST /holds`) and checkout (`POST /orders/checkout`) touch the PostgreSQL Primary. Because admitted users are metered, write contention is kept within safe PostgreSQL lock contention thresholds ($\approx 33\text{ transactions/sec}$), preventing lock timeouts or connection pool exhaustion.

---

## 6. Critical Requirement: Preventing Double-Booking

Preventing double-booking is the foundational correctness requirement of TicketHub. Seat allocation must be strictly atomic: **competing requests for the same seat can never both succeed.**

### 6.1 Defence-in-Depth Strategy

TicketHub uses three complementary layers to prevent double-booking, ordered from fastest to strongest:

| Layer | Mechanism | Role |
| :--- | :--- | :--- |
| **Layer 1 — Redis (Advisory)** | Short-lived Redis key per seat (e.g., `lock:seat:{id}`, TTL 15 s), set with `SET NX PX` | *Performance optimization only.* Sheds duplicate concurrent requests before they hit the database. Not the source of truth; a Redis failure or expiry does NOT release a confirmed booking. |
| **Layer 2 — PostgreSQL Row-Level Lock** | `SELECT ... FOR UPDATE` inside a `READ COMMITTED` (or stronger) transaction | *Mutual exclusion at the database level.* Guarantees only one writer can modify a seat row at a time. |
| **Layer 3 — DB Unique Constraint** | `UNIQUE(event_id, seat_id)` on `seat_allocations` | *Last-resort hard guard.* Even if application logic is bypassed by a bug or retry storm, the database engine raises error 23505 and rolls back the second insert. |

---

### 6.2 Concrete Implementation: Seat Hold with Row-Level Locking

When User A and User B simultaneously click "Reserve Seat #10421", the backend executes the following **inside a PostgreSQL transaction at READ COMMITTED isolation or stronger**:

```sql
-- Step 1: Lock the target row for the duration of this transaction.
-- Any concurrent transaction attempting the same seat will block here
-- until this transaction commits or rolls back.
BEGIN;

SELECT id, status, hold_expires_at
FROM seats
WHERE id = :seat_id
FOR UPDATE;  -- acquires an exclusive row-level write lock

-- Step 2: Application code checks the fetched row.
-- If status != 'AVAILABLE' AND NOT (status = 'HELD' AND hold_expires_at < NOW()):
--   ROLLBACK; return HTTP 409 Conflict.

-- Step 3: Perform the hold update (runs only if Step 2 passed).
UPDATE seats
SET status          = 'HELD',
    held_by_user_id = :user_id,
    hold_token      = :generated_token,
    hold_expires_at = NOW() + INTERVAL '10 minutes',
    version         = version + 1,
    updated_at      = NOW()
WHERE id = :seat_id;

COMMIT;
```

**How atomicity is guaranteed under concurrent load:**

1. PostgreSQL acquires an exclusive **Row-Level Write Lock (X-Lock)** on seat `#10421` the moment `SELECT ... FOR UPDATE` executes.
2. User A's transaction arrives microseconds ahead. It reads `status = 'AVAILABLE'`, proceeds to `UPDATE`, and commits. Lock is released.
3. User B's `SELECT ... FOR UPDATE` was **blocked** while User A held the X-Lock. Once User A commits, User B re-reads the row and sees `status = 'HELD'` with a valid `hold_expires_at`.
4. The application detects the seat is now held by someone else and **rolls back**, returning `HTTP 409 Conflict` to User B. Zero double-holds.

**Alternative — Atomic Conditional UPDATE (lock-free shorthand):**

```sql
-- Single-statement atomic conditional update; no explicit FOR UPDATE needed.
-- PostgreSQL still acquires a row-level lock internally for the duration of UPDATE.
UPDATE seats
SET status          = 'HELD',
    held_by_user_id = :user_id,
    hold_token      = :generated_token,
    hold_expires_at = NOW() + INTERVAL '10 minutes',
    version         = version + 1,
    updated_at      = NOW()
WHERE id = :seat_id
  AND (
      status = 'AVAILABLE'
      OR (status = 'HELD' AND hold_expires_at < NOW())
  );
-- rows_affected == 1 → hold granted; rows_affected == 0 → return 409 Conflict
```

Both approaches are safe. The `SELECT ... FOR UPDATE` pattern is preferred when the application needs to inspect the seat's current state (section, price, hold owner) before deciding how to proceed.

---

### 6.3 Hard Database Constraints (Last-Resort Guard)

```sql
-- On seat_allocations, enforce that the same (event, seat) pair
-- can only ever appear once — i.e., only one confirmed buyer per seat.
CONSTRAINT uq_seat_allocation UNIQUE (event_id, seat_id)
```

This constraint means:

1. **`UNIQUE(event_id, seat_id)` on `seat_allocations`**: When checkout finalizes, the handler inserts a row into `seat_allocations`. If two concurrent checkouts somehow both pass the hold check (e.g., due to an application bug or a race during delayed payment confirmation), the second `INSERT` will fail with PostgreSQL error `23505` (unique constraint violation). The database engine rolls back the second transaction automatically, and no double-booking is recorded.
2. **`uq_event_section_row_seat UNIQUE (event_id, section, row, seat_number)` on `seats`**: Physically prevents duplicate seat records from existing for the same venue and event—the data integrity baseline.

These constraints ensure correctness regardless of application-layer bugs, retry storms, or network partitions.

---

### 6.4 Role of Redis: Optimization, Not Source of Truth

Redis short-lived keys (e.g., `SET lock:seat:10421 user_id NX PX 15000`) act as a **fast pre-filter** only:

- If the key is already set, the request is rejected at the application layer before touching PostgreSQL — this reduces unnecessary database load during a 16,667 req/sec flash sale peak.
- If Redis is unavailable, slow, or the key has expired, the request **falls through to PostgreSQL**, which enforces correctness via row-level locking and the unique constraint.
- Redis state is **never** used to confirm or record a seat allocation. A Redis key expiring or being evicted cannot release a confirmed `seat_allocation` database record.
- Redis is repopulated from PostgreSQL on cache miss or after a Redis restart, ensuring it always reflects database reality, not the other way around.

---

### 6.5 Automated Seat-Hold Expiration Process & Safe Release

A temporary seat hold reserves inventory for a fixed duration of exactly 10 minutes ($600\text{ seconds}$). Releasing abandoned holds in a high-concurrency ticketing system requires strict transactional safety to prevent inventory corruption, race conditions, or accidental releases of confirmed purchases.

#### 1. Authoritative Timestamp Stored in PostgreSQL
Each seat hold stores its expiration deadline directly on the `seats` record in PostgreSQL via `hold_expires_at TIMESTAMP WITH TIME ZONE`, alongside `held_by_user_id`, `hold_token`, and `status = 'HELD'`. PostgreSQL is the single source of truth for seat reservation status and expiration times.

#### 2. Periodic Batch Sweeper Worker
While individual checkout attempts evaluate hold validity lazily, an automated background sweeper worker (orchestrated via Celery Beat / RabbitMQ) runs periodically every 10–15 seconds to sweep and release abandoned seats in manageable batches:

```sql
-- Step 1: Select a bounded batch of expired holds with row locking
-- SKIP LOCKED prevents contention with active checkout transactions or concurrent sweeper workers.
BEGIN;

SELECT id, event_id, section, row, seat_number
FROM seats
WHERE status = 'HELD'
  AND hold_expires_at < NOW()
LIMIT 500
FOR UPDATE SKIP LOCKED;

-- Step 2: Atomically release the locked expired seats back to AVAILABLE
UPDATE seats
SET status          = 'AVAILABLE',
    held_by_user_id = NULL,
    hold_token      = NULL,
    hold_expires_at = NULL,
    version         = version + 1,
    updated_at      = NOW()
WHERE id IN (/* batch IDs from Step 1 */)
  AND status = 'HELD'             -- Double safeguard: never touch SOLD seats
  AND hold_expires_at < NOW();

COMMIT;
```

#### 3. Idempotent Cleanup & Confirmed Seat Safety
The hold release query is strictly idempotent:
- The predicate `WHERE status = 'HELD' AND hold_expires_at < NOW()` guarantees that seats transitioned to `SOLD` by a successful checkout will **never** match the release query.
- Even if a sweeper process crashes, restarts, or retries the same batch multiple times, seats that are already `AVAILABLE` or `SOLD` remain untouched. Retries cannot release confirmed seats or corrupt inventory counts.

#### 4. Delayed Payment Callback Revalidation
Payment gateways like Stripe deliver confirmations asynchronously via webhooks. If network congestion or third-party latency causes a webhook callback to arrive after the 10-minute hold window has expired:
- The webhook handler **must never** blindly mark the seat as confirmed.
- Instead, the webhook callback opens a database transaction and acquires an exclusive row lock:
  ```sql
  BEGIN;
  SELECT id, status, hold_token, hold_expires_at
  FROM seats
  WHERE id = :seat_id
  FOR UPDATE;
  ```
- If the hold has already expired and the seat has been released or acquired by a new buyer (`status != 'HELD'` or `hold_token != :webhook_hold_token`), the callback handler aborts the transaction (`ROLLBACK`).
- The application then executes an automated, idempotent refund through the payment gateway API (`stripe.refunds.create({payment_intent: ...})`) and dispatches an apologetic email with store credit. Double-allocation is physically prevented.

#### 5. Fault Tolerance, Retries, and Overdue Hold Recovery
- If a background sweep job encounters a transient database timeout or worker crash, Celery retries the job using exponential backoff with jitter.
- Sweeper failures are logged to Prometheus/Sentry, triggering alerts if unreleased expired holds exceed threshold limits.
- Because the sweeper query checks `hold_expires_at < NOW()`, any hold that was missed during a transient worker outage will be automatically and safely collected by the very next sweep cycle.

#### 6. State Authority: PostgreSQL vs. Redis
- Redis keys and expiration TTLs (e.g., `lock:seat:{id}`) serve solely as an advisory performance cache to shed redundant incoming requests.
- Redis expiration or key eviction **never** releases inventory. A seat is only released when PostgreSQL commits the state change.
- Even if Redis is flushed or crashes entirely, PostgreSQL remains fully consistent and authoritative. Redis availability caches are refreshed by listening to database change events or repopulating from PostgreSQL on demand.

---

### 6.6 Payment Confirmation & Failure Handling

When a user submits payment, the checkout handler executes a strict sequence:

```
[User Submits Payment]
        |
        v
[Step 1: Acquire Row Lock & Verify Hold — inside BEGIN transaction]
SELECT id, status, hold_token, hold_expires_at
FROM seats
WHERE id = :seat_id
  AND hold_token = :provided_hold_token
  AND status = 'HELD'
  AND hold_expires_at > NOW()
FOR UPDATE;
        |
        +--> [Hold Not Found / Expired?] --> ROLLBACK, Return 410 Gone (No Charge)
        |
        v
[Step 2: Charge Payment Gateway with Idempotency Key — OUTSIDE transaction]
Charge $240.00 via Stripe API (idempotency_key = client-supplied UUID)
        |
        +--> [Payment Declined?] --> ROLLBACK, Keep Hold Alive, Return 402/422
        |
        v [Payment Succeeded]
[Step 3: Atomically Finalize in Database — same or new BEGIN]
BEGIN;
  UPDATE seats
  SET status = 'SOLD', hold_expires_at = NULL
  WHERE id = :seat_id AND hold_token = :provided_hold_token;

  INSERT INTO orders (idempotency_key, user_id, event_id, total_amount_cents, status, ...)
  VALUES (:idempotency_key, :user_id, :event_id, :amount_cents, 'PAID', ...);

  -- This INSERT enforces UNIQUE(event_id, seat_id): if another buyer somehow
  -- confirmed the same seat concurrently, this raises error 23505 → ROLLBACK.
  INSERT INTO seat_allocations (order_id, seat_id, event_id, price_cents)
  VALUES (:order_id, :seat_id, :event_id, :price_cents);
COMMIT;
        |
        v
[Step 4: Return 200 OK + Dispatch Async QR Ticket Email]
```

#### Handling Edge Cases:

- **Concurrent Requests for the Same Seat at Checkout**: Because Step 1 uses `SELECT ... FOR UPDATE`, the second concurrent checkout is blocked at the database lock level. When the first transaction commits and marks the seat `SOLD`, the second transaction re-reads and fails the `hold_token` / `status` check, rolling back cleanly with a `409 Conflict`.
- **Payment Failure / Declined Card**: The database hold is preserved for the hold's remaining duration. The user can retry with a different payment method without losing their reserved seat.
- **Client Retry with Same Idempotency Key**: The `UNIQUE` constraint on `orders(idempotency_key)` ensures a retry of an already-successful checkout returns the original order rather than creating a duplicate charge or a duplicate `seat_allocation`.
- **Delayed / Late Payment Webhook**: If Stripe confirms a payment after the hold has expired and the seat has been re-allocated to another buyer, the webhook processor detects that `seat_allocations` already contains a row for `(event_id, seat_id)`. It cannot insert a second row (error 23505), so it **automatically triggers a full refund** through Stripe and notifies the user, guaranteeing zero double-allocation and zero financial loss.
- **Frontend / Cache Independence**: The frontend and Redis caches are strictly advisory viewing layers. Final booking and payment clearance **always** execute against the primary PostgreSQL database under explicit transactional locks. Redis showing a seat as "available" is never sufficient to grant a booking.

---

## 7. Trade-Off Analysis & Architectural Decisions

Building a resilient, high-concurrency event ticketing platform requires deliberate engineering trade-offs between consistency, availability, performance, and operational complexity.

### 7.1 Automated Seat-Hold Expiration Sweep: Periodic Batch Worker vs. Inline Lazy Release
- **Option A (Inline Lazy Release Only)**: Evaluate hold expiration only when a new user attempts to reserve the expired seat (`WHERE status = 'AVAILABLE' OR (status = 'HELD' AND hold_expires_at < NOW())`).
- **Option B (Periodic Batch Sweeper Only)**: Rely exclusively on a scheduled background cron to scan and release seats every minute.
- **Option C (Hybrid Strategy - Chosen)**: Combine immediate lazy evaluation on write with an asynchronous periodic batch sweeper running every 10–15 seconds with `LIMIT 500 FOR UPDATE SKIP LOCKED`.
- **Benefits**: Lazy release guarantees zero wait time for active buyers wanting an abandoned seat, while the periodic batch sweeper actively restores inventory to the visual seat map and pushes real-time updates via Server-Sent Events (SSE).
- **Costs**: Requires running background worker processes and executing periodic database queries that could contribute to connection and lock overhead.
- **Mitigation**: Use partial indexes (`idx_seats_hold_expiry WHERE status = 'HELD'`), batch limits (`LIMIT 500`), and `SKIP LOCKED` to prevent the sweeper from contending with active checkouts.

---

### 7.2 Trade-Off 1: Read Replicas vs. Data Freshness (Replication Lag)
- **Benefits**: Read replicas scale read throughput horizontally and absorb the massive query volume from users browsing the event catalog, inspecting venue metadata, and viewing historical orders. This removes 90%+ of read traffic from the primary database, keeping primary CPU and IOPS dedicated to critical booking transactions.
- **Costs**: PostgreSQL asynchronous replication introduces replication lag (typically 20–200 ms, spiking up to several seconds during heavy write spikes). Replicas can therefore return stale data, displaying a seat as "available" when it was already held or sold milliseconds earlier on the primary.
- **Mitigation**: 
  - Strictly route all state-mutating requests—specifically seat hold acquisition (`POST /api/v1/events/{id}/holds`) and final payment checkout (`POST /api/v1/orders/checkout`)—directly to the **authoritative PostgreSQL primary database** using transactional row-level locks (`SELECT ... FOR UPDATE`).
  - Treat read replica responses as strictly **advisory** for initial page loads. When a user clicks to hold a seat, the primary database performs an authoritative check, rejecting stale selections with an immediate `409 Conflict` before any payment is initiated.

---

### 7.3 Trade-Off 2: Caching vs. Strict Consistency
- **Benefits**: High-speed in-memory caching (Redis cluster and CDN edge caches) absorbs flash sale ingress exceeding 16,000 requests per second. Serving seat availability maps and static event assets from cache delivers sub-10 ms response times and protects backend databases from connection pool exhaustion and crash-level concurrency.
- **Costs**: Cached inventory data is inherently eventually consistent and can quickly become stale as seats are reserved during a flash sale drop. Users may attempt to select seats that are already taken, creating higher client-side friction.
- **Mitigation**:
  - Treat all cache data as purely **advisory**. The cache provides high-speed browsing, but **never** acts as the source of truth for seat ownership.
  - Require all hold and purchase operations to validate state transactionally on PostgreSQL against row-level locks and hard schema constraints (`UNIQUE (event_id, seat_id)`).
  - Use Redis Pub/Sub combined with Server-Sent Events (SSE) to broadcast seat hold and release events to connected client applications within milliseconds, minimizing the window of cache staleness.

---

### 7.4 Trade-Off 3: Asynchronous Queues vs. Processing Delay
- **Benefits**: Message queues (RabbitMQ/Celery) decouple the synchronous HTTP checkout flow from non-critical, high-latency tasks such as cryptographic QR barcode signing, PDF ticket generation, and transactional email dispatch. This keeps checkout API latency below 500 ms and shields the primary database and third-party email providers from sudden traffic spikes.
- **Costs**: Introduces processing delay where digital tickets are not immediately returned in the HTTP response body. Also introduces operational complexity: managing message queues, handling potential message loss, out-of-order execution, worker crashes, and retry storms.
- **Mitigation**:
  - Make all background worker consumers strictly **idempotent** by keying tasks to unique `order_id` values.
  - Implement automated exponential-backoff retries with jitter and configure Dead Letter Queues (DLQ) for poison messages to alert engineers without halting the queue.
  - Return an immediate synchronous confirmation (`200 OK` with `order_id` and order summary) to the user upon payment capture, while allowing ticket passes to be retrieved asynchronously via `GET /api/v1/users/me/tickets` once rendering completes.

---

### 7.5 Trade-Off 4: Strict Consistency vs. High Availability (CAP Theorem)
- **Option A**: Prioritize Availability (AP). Accept eventual consistency across multi-master databases to avoid ever rejecting a user request.
- **Option B (Chosen)**: Prioritize Strict Consistency (CP) on the booking and seat hold engine.
- **Rationale**: In event ticketing, overselling or double-booking leads to severe reputational damage, breach of contract, legal liability, and logistical chaos at venue turnstiles. It is vastly preferable to return a clean `409 Conflict ("Seat already taken")` to one user than to sell the same physical chair to two different fans. For static browsing, we leverage eventual consistency at the CDN edge, but the booking path is strictly CP.

---

### 7.6 Trade-Off 5: Virtual Waiting Room vs. Immediate Direct Access
- **Option A**: Immediate Direct Access. Allow all 200,000 users to connect and hit backend servers simultaneously at 10:00 AM.
- **Option B (Chosen)**: Virtual Waiting Room (Cloudflare / Redis token bucket). Meter user ingress so only 500 active buyers enter the checkout funnel per second.
- **Rationale**: Unrestricted access creates catastrophic thundering herd problems, connection pool exhaustion, and server crashes, rendering the site unusable for everyone. A virtual waiting room enforces fair FIFO queueing, completely eliminates bot automated sniping, smooths database write loads to steady sustainable levels ($\approx 33\text{ sales/sec}$), and guarantees a responsive, reliable experience for users actively buying.

---

### 7.7 Trade-Off 6: Temporary Seat Holds (10 Minutes) vs. Instant Checkout (No Holds)
- **Option A**: Instant Checkout without Holds. Seats remain available until payment fully settles. Whoever completes payment first wins.
- **Option B (Chosen)**: 10-Minute Temporary Seat Hold. Holding a seat takes it off the market for 10 minutes while the user enters payment info.
- **Rationale**: Instant checkout creates extreme user frustration: buyers input credit card details only to find their seat vanished at the final click ("payment race condition"). Temporary holds provide a human-friendly checkout experience. Although it introduces the risk of abandoned carts and temporarily locked inventory, our 10-minute timeout and automated sweeper ensure unpurchased seats quickly return to genuine buyers.

---

## 8. System Risks, Monitoring, and Scaling Decisions

### 8.1 Key Failure Modes & Risk Mitigations

1. **Thundering Herd on Hold Expiration**:
   - **Risk**: When thousands of 10-minute holds expire nearly simultaneously, massive numbers of waiting clients might refresh and hammer the database looking for released seats.
   - **Mitigation**: The background sweeper staggers updates with jitter. Rather than forcing clients to poll aggressively, seat status transitions (`HELD` $\rightarrow$ `AVAILABLE`) are pushed via Redis Pub/Sub to Server-Sent Events (SSE) connections, eliminating polling spikes.

2. **Payment Gateway Latency & Timeouts**:
   - **Risk**: External payment gateways (e.g., Stripe) may experience latency spikes (3–10 seconds) during heavy concert drops, tying up backend threads and exhausting database connection pools if executed inside transactions.
   - **Mitigation**: External gateway HTTP requests are strictly executed **outside** database transactions. The hold is verified and marked in progress, the database connection is returned to the pool, the payment gateway is called with an `Idempotency-Key`, and only after the gateway returns is a new fast transaction opened to commit `seat_allocations` and mark the seat `SOLD`.

3. **Database Connection Pool Exhaustion**:
   - **Risk**: A sudden scale-out of hundreds of stateless application server pods can saturate PostgreSQL's maximum connection limit (`max_connections`), leading to rejected queries.
   - **Mitigation**: Deploy **PgBouncer** connection poolers in transaction-pooling mode directly in front of the PostgreSQL Primary. This multiplexes thousands of active application worker threads over a fixed, compact pool of 100–150 dedicated database connections.

4. **Cache Inconsistency or Redis Failure**:
   - **Risk**: A Redis node reboot or split-brain could report inaccurate seat availability or drop advisory locks.
   - **Mitigation**: Redis is treated as an advisory acceleration layer only. The PostgreSQL Primary and its hard uniqueness constraint `uq_seat_allocation UNIQUE (event_id, seat_id)` are the single source of truth. If Redis fails completely, requests gracefully degrade to PostgreSQL row locks without risking double-bookings.

---

### 8.2 Observability & Monitoring Strategy (SLIs / SLOs)

To guarantee system reliability during high-profile ticket sales, the operational telemetry stack continuously tracks:

| Telemetry Metric (SLI) | Target Threshold (SLO) | Alert Condition & Trigger |
| :--- | :--- | :--- |
| **Row Lock Wait Time** (`pg_stat_activity`) | $p99 < 50\text{ ms}$ | Alert P1 if any lock wait exceeds $1{,}500\text{ ms}$ for $> 10\text{ seconds}$ |
| **Connection Pool Saturation** | $< 80\%$ utilized | Alert P1 if PgBouncer client wait queue depth $> 25$ |
| **Hold Route Latency** (`POST /holds`) | $p95 < 250\text{ ms}$, $p99 < 400\text{ ms}$ | Alert P2 if $p99 > 500\text{ ms}$ over 2-minute rolling window |
| **Checkout Route Latency** (`POST /checkout` excl. gateway) | $p95 < 300\text{ ms}$, $p99 < 500\text{ ms}$ | Alert P2 if $p99 > 750\text{ ms}$ over 2-minute rolling window |
| **HTTP Error Ratio** (5xx vs 4xx) | $5\text{xx} < 0.05\%$ of total ingress | Alert P1 if $5\text{xx} \ge 0.1\%$ (HTTP 409 Conflict is expected and tracked separately) |
| **Redis Cache Hit Ratio** (Seat Map) | $> 95\%$ cache hit rate | Alert P2 if cache hit rate drops below $90\%$ during an active drop |
| **Asynchronous Worker Queue Depth** | $< 500$ queued jobs | Alert P2 if Celery/RabbitMQ ticket dispatch lag exceeds 60 seconds |

---

### 8.3 Long-Term Scaling Decisions

1. **Horizontal Database Sharding by `event_id`**:
   - For a single venue drop (20,000 seats), a single PostgreSQL primary easily handles the required $\approx 33\text{ transactions/sec}$.
   - For simultaneous nationwide stadium tours across multiple cities, databases can be horizontally sharded by `event_id`. Because seat holds and bookings never span multiple events, each shard operates with complete transactional isolation and zero cross-shard coordination overhead.

2. **Closed-Loop Dynamic Waiting Room Throttle**:
   - The Virtual Waiting Room admission rate dynamically responds to downstream database health metrics. If PostgreSQL connection pool utilization exceeds 85% or lock wait time exceeds 200 ms, the waiting room automatically steps down the admission rate from 500 users/sec to 250 users/sec until database performance stabilizes.

3. **Read/Write Workload Isolation**:
   - 100% of event browsing, catalog searching, and historical ticket viewing queries are routed to read replicas and edge caches. The primary PostgreSQL database instance is strictly dedicated to critical write transactions (`POST /holds` and `POST /checkout`), ensuring maximum IOPS and CPU availability for booking operations.

