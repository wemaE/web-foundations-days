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
+---------------+ 1       * +---------------+
|     seats     |-----------|  order_items  |
+---------------+           +---------------+
| id (PK)       |           | id (PK)       |
| event_id (FK) |           | order_id (FK) |
| section       |           | seat_id (FK)  |
| row           |           | price_cents   |
| seat_number   |           +---------------+
| status        |
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

-- 5. ORDER_ITEMS TABLE (Junction linking confirmed seats to orders)
CREATE TABLE order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    seat_id BIGINT NOT NULL REFERENCES seats(id) ON DELETE RESTRICT,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    
    -- A single seat can only belong to one confirmed order
    CONSTRAINT uq_order_seat UNIQUE (seat_id)
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
|  - Distributed Locks  |   |  - Financial Checkout |   |  - Historical Orders  |
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
6. **Redis Cluster (In-Memory Data Store)**: Maintains high-speed seat availability bitmaps for the interactive seat map, stores waiting-room queue state, and provides distributed token buckets.
7. **PostgreSQL Primary Database**: Single write master enforcing ACID transactions, row-level locks, and physical uniqueness constraints for seat holds and order creation.
8. **PostgreSQL Read Replicas**: Replicated read-only nodes absorbing search, event browsing, and historical order lookups to keep the primary database unburdened.
9. **Stripe / Payment Gateway**: External PCI-compliant provider executing payment card captures and delivering asynchronous success webhooks.
10. **RabbitMQ / Async Workers**: Message queue and background workers asynchronously processing PDF ticket rendering, barcode signing, email dispatch, and sweeping expired holds.

---

### 5.3 Handling Flash Sale Traffic Without Losing Correctness

1. **Traffic Decoupling via Virtual Waiting Room**: When 200,000 users arrive at 10:00 AM, the CDN and Waiting Room intercept 100% of ingress traffic. Users enter a fair FIFO queue and receive an encrypted queue token.
2. **Metered Admission**: The queue admits users in small batches matching database capacity (e.g., 200–500 buyers/sec). 
3. **Read/Write Separation**: 95% of requests (seat map views) hit Redis read-caches and PostgreSQL Read Replicas.
4. **Primary Write Isolation**: Only the critical hold mutation (`POST /holds`) touches the PostgreSQL Primary. Because admitted users are metered, write contention is kept within safe PostgreSQL lock contention thresholds ($\approx 33\text{ transactions/sec}$), preventing lock timeouts or connection pool exhaustion.

---

## 6. Critical Requirement: Preventing Double-Booking

Preventing double-booking is the foundational correctness requirement of TicketHub. Seat allocation must be strictly atomic: **competing requests for the same seat can never both succeed.**

### 6.1 Concrete Implementation: Atomic Conditional Updates with Row-Level Locking

To avoid deadlocks while guaranteeing mutual exclusion, TicketHub utilizes **Atomic Conditional Updates** backed by PostgreSQL row-level locks.

#### 1. The Seat Hold Acquisition Query
When User A and User B simultaneously click "Reserve Seat #10421", the backend executes:

```sql
-- Executed inside a READ COMMITTED transaction
UPDATE seats
SET status = 'HELD',
    held_by_user_id = :user_id,
    hold_token = :generated_token,
    hold_expires_at = NOW() + INTERVAL '10 minutes',
    version = version + 1,
    updated_at = NOW()
WHERE id = :seat_id
  AND (
      status = 'AVAILABLE' 
      OR (status = 'HELD' AND hold_expires_at < NOW())
  );
```

#### How Atomicity is Guaranteed:
1. PostgreSQL acquires an exclusive **Row-Level Write Lock (`X-Lock`)** on the target row for the duration of the `UPDATE` evaluation.
2. If User A's transaction arrives micro-seconds ahead of User B's, User A satisfies `status = 'AVAILABLE'`. Exactly **1 row is updated** (`rows_affected == 1`).
3. User B's update blocks until User A's row lock is released. When User B evaluates the `WHERE` clause, the row's `status` is now `'HELD'` and `hold_expires_at > NOW()`.
4. User B's condition evaluates to `FALSE`, returning **0 rows affected** (`rows_affected == 0`).
5. The application code detects `rows_affected == 0`, immediately rolls back, and returns `HTTP 409 Conflict` to User B.

---

### 6.2 Hard Database Constraints

To guard against race conditions or multi-seat cross-order leaks:
1. **`uq_event_section_row_seat UNIQUE (event_id, section, row, seat_number)`**: Physically prevents duplicate seats from existing in the database.
2. **`uq_order_seat UNIQUE (seat_id)` on `order_items`**: The database schema physically prevents a seat from being inserted into more than one confirmed order. Even if an application bug bypassed the hold logic, the database engine would throw a fatal unique constraint violation (`23505`), preventing double-purchase.

---

### 6.3 Hold Expiration & Safe Release

A seat hold lasts exactly 10 minutes ($600\text{ seconds}$). Holds are cleaned using a **Two-Tier Strategy**:

1. **Lazy Expiration (Inline Evaluation)**:
   Notice that the `UPDATE` query above explicitly includes:
   `OR (status = 'HELD' AND hold_expires_at < NOW())`.
   If a user abandoned a hold 15 minutes ago and a new user clicks the seat, the new user immediately captures it without waiting for any background batch job.
2. **Eager Expiration (Background Worker Sweeper)**:
   A Celery/RabbitMQ worker wakes every 15 seconds to run:
   ```sql
   UPDATE seats
   SET status = 'AVAILABLE',
       held_by_user_id = NULL,
       hold_token = NULL,
       hold_expires_at = NULL,
       version = version + 1
   WHERE status = 'HELD' 
     AND hold_expires_at < NOW();
   ```
   This worker broadcasts an event to the Redis pub/sub channel, which pushes updated seat map states to connected frontends via Server-Sent Events.

---

### 6.4 Payment Confirmation & Failure Handling

When a user submits payment, the checkout handler executes a strict sequence:

```
[User Submits Payment]
        |
        v
[Step 1: Verify Hold in DB Transaction]
SELECT * FROM seats 
WHERE id = :seat_id 
  AND hold_token = :provided_hold_token
  AND status = 'HELD'
  AND hold_expires_at > NOW()
FOR UPDATE;
        |
        +---> [Hold Expired?] ---> ABORT, Return 410 Gone (No Charge)
        |
        v
[Step 2: Charge Payment Gateway with Idempotency Key]
Charge $240.00 via Stripe API
        |
        +---> [Payment Declined?] ---> Keep Hold Alive, Return 402/422
        |
        v [Payment Succeeded]
[Step 3: Atomically Finalize in Database]
BEGIN;
  UPDATE seats 
  SET status = 'SOLD', hold_expires_at = NULL 
  WHERE id = :seat_id;
  
  INSERT INTO orders (idempotency_key, status, ...) 
  VALUES (:idempotency_key, 'PAID', ...);
  
  INSERT INTO order_items (order_id, seat_id, ...) 
  VALUES (:order_id, :seat_id, ...);
COMMIT;
        |
        v
[Step 4: Return 200 OK + Dispatch Async QR Ticket Email]
```

#### Handling Edge Cases:
- **Delayed / Late Payment Webhook**: If Stripe confirms a payment after the hold has expired, the webhook processor checks whether the seat was claimed by someone else. If the seat is still unreserved, it finalizes the booking; if another buyer grabbed the seat in the interim, the webhook handler **automatically triggers a full refund** through Stripe and sends an apologetic email with credit, guaranteeing zero double-allocation.
- **Frontend / Cache Independence**: The frontend and Redis caches are strictly treated as advisory viewing layers. Final booking and payment clearance **always** execute against the primary PostgreSQL database under explicit transactional locks.

---

## 7. Trade-Off Analysis

### 7.1 Trade-Off 1: Strict Consistency vs. High Availability (CAP Theorem)
- **Option A**: Prioritize Availability (AP). Accept eventual consistency across multi-master databases to avoid ever rejecting a user request.
- **Option B (Chosen)**: Prioritize Strict Consistency (CP) on the booking and seat hold engine.
- **Rationale**: In event ticketing, overselling or double-booking leads to severe reputational damage, breach of contract, legal liability, and logistical chaos at venue turnstiles. It is vastly preferable to return a clean `409 Conflict ("Seat already taken")` to one user than to sell the same physical chair to two different fans. For static browsing, we leverage eventual consistency at the CDN edge, but the booking path is strictly CP.

---

### 7.2 Trade-Off 2: Virtual Waiting Room vs. Immediate Direct Access
- **Option A**: Immediate Direct Access. Allow all 200,000 users to connect and hit backend servers simultaneously at 10:00 AM.
- **Option B (Chosen)**: Virtual Waiting Room (Cloudflare / Redis token bucket). Meter user ingress so only 500 active buyers enter the checkout funnel per second.
- **Rationale**: Unrestricted access creates catastrophic thundering herd problems, connection pool exhaustion, and server crashes, rendering the site unusable for everyone. A virtual waiting room enforces fair FIFO queueing, completely eliminates bot automated sniping, smooths database write loads to steady sustainable levels ($\approx 33\text{ sales/sec}$), and guarantees a responsive, reliable experience for users actively buying.

---

### 7.3 Trade-Off 3: Temporary Seat Holds (10 Minutes) vs. Instant Checkout (No Holds)
- **Option A**: Instant Checkout without Holds. Seats remain available until payment fully settles. Whoever completes payment first wins.
- **Option B (Chosen)**: 10-Minute Temporary Seat Hold. Holding a seat takes it off the market for 10 minutes while the user enters payment info.
- **Rationale**: Instant checkout creates extreme user frustration: buyers input credit card details only to find their seat vanished at the final click ("payment race condition"). Temporary holds provide a human-friendly checkout experience. Although it introduces the risk of abandoned carts and temporarily locked inventory, our 10-minute timeout and automated sweeper ensure unpurchased seats quickly return to genuine buyers.
