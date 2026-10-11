# SnapShare: System Architecture & Scaling Analysis

This document provides the complete system design for **SnapShare**, a high-scale photo-sharing social platform, including requirements, capacity planning, workload analysis, storage design, architecture diagram, component responsibilities, end-to-end upload flow, and trade-off analysis.

---

## 1. Requirements

### 1.1 Functional Requirements
- **Photo Upload**: Authenticated users can upload original photos (up to 2 MB each) from web or mobile clients.
- **Feed Browsing**: Users can scroll a paginated feed of photos from accounts they follow, served as 50 KB thumbnails.
- **Photo Viewing**: Clicking a thumbnail delivers the full-resolution original photo.
- **User Profiles**: Each user has a public profile listing their uploaded photos in reverse-chronological order.
- **Follow / Unfollow**: Users can follow other accounts; their uploads appear in followers' feeds.
- **Asynchronous Thumbnail Generation**: The system automatically generates optimized 50 KB thumbnails from each uploaded original in the background without blocking the upload response.

### 1.2 Non-Functional Requirements
- **Scale**: Support 10 million registered users; 1 million daily active users (DAU).
- **Read Performance**: Serve feed views at peak load (~2,894 views/sec) with p99 latency under 100 ms, met via CDN and in-memory cache layers.
- **Write Performance**: Handle ~11.57 photo uploads per second on average.
- **Storage Durability**: Photos must be stored with at least 99.999999999% (eleven nines) durability.
- **Availability**: Target 99.9%+ uptime; no single point of failure in the serving path.
- **Cost Efficiency**: Store ~748 TB/year of photo data at commodity object-storage pricing rather than expensive block/database storage.

---

## 2. Traffic & Capacity Estimates

### Given Parameters
- **Registered Users**: 10,000,000 (10 million)
- **Daily Active User (DAU) Ratio**: 10%
- **Upload Activity**: 1 photo upload per active user per day
- **Read Activity**: 50 feed views per active user per day
- **Original Photo Size**: 2 MB
- **Thumbnail Size**: 50 KB
- **Time Constants**: 86,400 seconds per day; 365 days per year

---

### Step-by-Step Calculations

#### Calculation 1: Daily Active Users (DAU)
$$\text{DAU} = \text{Total Registered Users} \times \text{Active Ratio}$$
$$\text{DAU} = 10,000,000 \times 0.10 = 1,000,000 \text{ users/day}$$

- **Result**: **1,000,000 Daily Active Users (1 million DAU)**

---

#### Calculation 2: Average Uploads per Second
$$\text{Total Daily Uploads} = \text{DAU} \times 1 \text{ upload/day} = 1,000,000 \text{ uploads/day}$$
$$\text{Average Uploads/sec} = \frac{\text{Total Daily Uploads}}{\text{Seconds per Day}} = \frac{1,000,000}{86,400} \approx 11.574 \text{ uploads/sec}$$

- **Result**: **~11.57 uploads per second**

---

#### Calculation 3: Average Feed Views per Second & Peak (5× Average)
$$\text{Total Daily Feed Views} = \text{DAU} \times 50 \text{ views/day} = 1,000,000 \times 50 = 50,000,000 \text{ views/day}$$
$$\text{Average Feed Views/sec} = \frac{50,000,000}{86,400} \approx 578.704 \text{ views/sec}$$
$$\text{Peak Feed Views/sec} = 578.7037 \times 5 \approx 2,893.52 \text{ views/sec}$$

- **Average Result**: **~578.70 feed views per second**
- **Peak Result (5×)**: **~2,893.52 feed views per second** (~2,894 views/sec)

---

#### Calculation 4: Annual Photo Storage (Including Thumbnails)
Each upload produces two assets:
1. Original photo: $2\text{ MB} = 2,000\text{ KB}$
2. Generated thumbnail: $50\text{ KB} = 0.05\text{ MB}$

##### Decimal / SI Units ($1\text{ MB} = 1,000\text{ KB}$, $1\text{ GB} = 1,000\text{ MB}$, $1\text{ TB} = 1,000\text{ GB}$):
$$\text{Storage per Upload} = 2.00\text{ MB} + 0.05\text{ MB} = 2.05\text{ MB}$$
$$\text{Daily Storage} = 1,000,000 \text{ uploads/day} \times 2.05\text{ MB} = 2,050,000\text{ MB/day} = 2,050\text{ GB/day} = 2.05\text{ TB/day}$$
$$\text{Annual Storage (365 days)} = 2.05\text{ TB/day} \times 365\text{ days} = 748.25\text{ TB/year}$$

- In Gigabytes: $748,250\text{ GB/year}$
- In Terabytes: **748.25 TB/year** (~0.748 PB/year)

##### Binary / IEC Units ($1\text{ MiB} = 1,024\text{ KiB}$, $1\text{ GiB} = 1,024\text{ MiB}$, $1\text{ TiB} = 1,024\text{ GiB}$):
- Storage per upload: $2,048\text{ KiB} + 50\text{ KiB} = 2,098\text{ KiB} \approx 2.0488\text{ MiB}$
- Daily storage: $1,000,000 \times 2,098\text{ KiB} = 2,098,000,000\text{ KiB} \approx 2,000.81\text{ GiB/day} \approx 1.9539\text{ TiB/day}$
- Annual storage: $1.9539\text{ TiB/day} \times 365 \approx \mathbf{713.18\text{ TiB/year}}$ ($730,296\text{ GiB/year}$)

---

## 3. Read/Write Workload Analysis

### Nature of Workload: Read-Heavy
SnapShare has a **50:1 read-to-write ratio** (50 feed views per active user versus 1 upload per active user). At steady state, the system handles ~579 read queries per second compared to ~12 write requests per second, surging to nearly 2,900 reads per second during peak hours. SnapShare is overwhelmingly **read-heavy**.

### Architectural Implications

| Implication | Explanation |
| :--- | :--- |
| **Aggressive Multi-Tier Caching** | 90%+ of read requests should be served from in-memory caches (Redis/Memcached) and CDN edge nodes, shielding origin infrastructure from repetitive identical queries. |
| **Read/Write Database Segregation** | A single primary database cannot handle ~2,894 peak read queries/sec alongside concurrent write transactions. Read replicas distribute read volume horizontally, keeping the primary database dedicated to writes only. |
| **Asynchronous Write Decoupling** | CPU-intensive write-side work (image resizing, feed fan-out) must execute in background queues so that write spikes never degrade the read latency experienced by feed consumers. |

---

## 4. Storage Design: Object Storage vs. Database

Photo files belong in **dedicated cloud object storage** (e.g., Amazon S3, Google Cloud Storage, Cloudflare R2) rather than as binary BLOBs inside a relational database for four key reasons:

1. **Storage Cost Efficiency**: Storing ~748 TB/year on high-performance database block storage (AWS EBS SSDs at ~$0.08–$0.12/GB/month) is cost-prohibitive. Object storage costs ~$0.015–$0.023/GB/month with automated lifecycle tiering to archive colder photos to Glacier/Coldline at even lower rates.
2. **Database Performance & Cache Bloat**: Databases rely on memory buffer pools (e.g., InnoDB buffer pool) to cache index pages and row data. Storing multi-megabyte binary files fills this memory with unindexable byte streams, evicting relational data pages and drastically degrading query performance.
3. **Backup, Maintenance & Replication Overhead**: Backing up, vacuuming, and replicating a database holding petabytes of media causes massive I/O saturation and elongated recovery times. Object stores provide built-in 99.999999999% (eleven nines) durability without manual backup management.
4. **Direct CDN & Client Delivery**: Object stores natively integrate with CDNs via pre-signed URLs. Clients download photos directly from edge nodes without routing bytes through application server threads or consuming database connections.

**Schema approach**: The relational database stores only lightweight metadata (photo ID, uploader ID, object-storage key path, status, timestamps). The actual binary file lives exclusively in object storage, referenced by its key.

---

## 5. Architecture Diagram

The diagram below shows the full system topology. Read traffic enters from the left through the CDN; API/write traffic enters from the right through the Load Balancer. Both paths converge at the stateless App Server tier, which fans out to the data layer beneath.

```
                 [ Clients: Mobile Apps / Web Browsers ]
                          |                    |
          (A) Read media  |                    | (B) API requests
          thumbnails &    |                    | feed views, uploads,
          full photos     |                    | profile reads
                          v                    v
                 +-----------------+    +--------------------+
                 |      CDN        |    |   Load Balancer    |
                 | (Edge Cache,    |    | (Round-robin,      |
                 |  HTTPS termina- |    |  health checks,    |
                 |  tion, geo-     |    |  sticky sessions   |
                 |  distributed)   |    |  not required)     |
                 +-----------------+    +--------------------+
                          |                    |
                 (cache miss               +---+---+
                  for media)              |       |
                          |              v       v
                          |      +----------+ +----------+
                          |      | App      | | App      |  ... N nodes
                          |      | Server 1 | | Server 2 |
                          |      | (Node/Go)| | (Node/Go)|
                          |      +----------+ +----------+
                          |           |    \  /    |
                          |           |     \/     |
                          |           |     /\     |
                          |           v    /  \    v
                          |      +-------+    +------------------+
                          |      | Cache |    |  Primary DB      |
                          |      | Redis |    |  (PostgreSQL)    |
                          |      | (feeds|    |  Writes only:    |
                          |      | sess- |    |  photo metadata, |
                          |      | ions, |    |  user accounts,  |
                          |      | hot   |    |  follow graph    |
                          |      | meta) |    +------------------+
                          |      +-------+            |
                          |                   (async replication)
                          |                           v
                          |                  +------------------+
                          |                  |  Read Replicas   |
                          |                  |  (PostgreSQL)    |
                          |                  |  Feed queries,   |
                          |                  |  profile reads,  |
                          |                  |  metadata reads  |
                          |                  +------------------+
                          |
                          v
                 +-------------------+
                 |   Object Storage  |  <--- App Servers write originals here
                 |   (S3 / GCS /     |  <--- Thumbnail Workers write thumbs here
                 |    Cloudflare R2) |  ---> CDN pulls from here on cache miss
                 +-------------------+
                          ^
                          | (worker fetches original,
                          |  writes thumbnail back)
                 +-------------------+
                 | Thumbnail Workers |
                 | (image resize,    |
                 |  libvips / Sharp) |
                 +-------------------+
                          ^
                          | (pulls jobs)
                 +-------------------+
                 |   Message Queue   |  <--- App Servers publish upload events
                 |  (SQS / RabbitMQ) |
                 +-------------------+
```

**Data Flow Summary**:
- **(A) Read path**: Client → CDN edge (cache hit, ~10 ms) → Object Storage (cache miss, CDN fetches and caches) → Client
- **(B) Feed/API read**: Client → Load Balancer → App Server → Redis Cache (hit) → Client; on miss → Read Replica → App Server → Redis (populate) → Client
- **(C) Upload write**: Client → Load Balancer → App Server → Object Storage (original file) + Primary DB (metadata) + Message Queue (job)
- **(D) Background**: Message Queue → Thumbnail Worker → Object Storage (thumbnail) + Primary DB (status update) → CDN serves thumbnail on next request

---

## 6. Component Responsibilities

| Component | One-Sentence Responsibility |
| :--- | :--- |
| **Clients** (mobile / web) | Provide the user-facing interface for uploading photos, scrolling feeds, and viewing profiles. |
| **CDN** | Caches static photos and thumbnails at geographically distributed edge nodes to deliver media with minimal latency and eliminate bandwidth load on origin servers. |
| **Load Balancer** | Distributes incoming HTTPS API traffic evenly across stateless App Server instances using round-robin routing and continuous health checks. |
| **App Servers** | Execute all application business logic — authentication, request validation, feed assembly, and coordinated writes across the data tier — as horizontally scalable, stateless processes. |
| **Cache (Redis)** | Stores precomputed user feeds, active sessions, and hot photo metadata in RAM to serve read responses in sub-millisecond time and shield the database from repetitive queries. |
| **Primary Database** | Maintains authoritative relational data — user accounts, photo metadata, follow relationships — accepting all writes under full ACID transaction guarantees. |
| **Read Replicas** | Receive asynchronously replicated copies of the primary database and serve all read-only queries (feed loads, profile views, metadata lookups) to distribute query load horizontally. |
| **Object Storage** | Durably stores both original 2 MB photos and generated 50 KB thumbnails with eleven-nines durability, infinite scalability, and direct CDN integration. |
| **Message Queue** | Buffers asynchronous thumbnail-generation jobs between App Servers (producers) and Thumbnail Workers (consumers), decoupling upload ingestion from image-processing latency. |
| **Thumbnail Worker** | Pulls image jobs from the queue, downloads the original photo from Object Storage, resizes it to a 50 KB thumbnail using a CPU-optimized library, and writes the result back to Object Storage and the database. |

---

## 7. End-to-End Upload Flow

The following numbered steps trace the complete journey of a photo from the moment a user taps "Upload" to when followers see the thumbnail in their CDN-served feeds.

1. **Client Upload Initiation**: The user selects a photo on the mobile or web client. The client sends a multipart `POST /photos` request to the Load Balancer, which routes it to an available App Server.

2. **Upload to Object Storage**: The App Server authenticates the JWT, validates the file (MIME type `image/jpeg` or `image/png`, size ≤ 2 MB), generates a globally unique `photo_id` (e.g., UUID v4), and streams the raw 2 MB binary directly to Object Storage under the key path `originals/{user_id}/{photo_id}.jpg`. This avoids buffering the full file in application memory.

3. **Save Metadata to Database**: After Object Storage confirms the write (returning the object's ETag), the App Server executes an ACID INSERT into the Primary Database, recording `photo_id`, `user_id`, `original_url` (the object-storage key), `status = 'processing'`, and `created_at`. The metadata record is immediately visible to the uploader's own reads via the primary.

4. **Enqueue Thumbnail Job**: The App Server publishes a lightweight JSON message `{photo_id, original_key, user_id}` to the Message Queue. The queue durably persists the message; if the App Server crashes before the worker picks it up, the message remains queued and is redelivered automatically.

5. **Immediate Client Response**: Without waiting for thumbnail generation, the App Server returns `HTTP 201 Created` with `{photo_id, status: "processing"}`. The client UI can display the original photo as a low-priority preview immediately.

6. **Worker Generates Thumbnail**: A Thumbnail Worker pulls the message from the queue, downloads the 2 MB original from Object Storage, and uses a CPU-optimized library (e.g., libvips or Sharp) to decode, resize, and re-encode the image as a 50 KB JPEG thumbnail. If the download or resize fails, the worker rejects the message and the queue redelivers it — up to a configurable retry limit — before routing it to a dead-letter queue for alerting.

7. **Store Thumbnail & Update Metadata**: The worker uploads the thumbnail to Object Storage at `thumbnails/{user_id}/{photo_id}.jpg`. It then issues an UPDATE to the Primary Database, setting `thumbnail_url` and `status = 'published'`. Redis feed caches for the uploader's followers are invalidated or updated.

8. **Deliver via CDN**: When a follower's client requests the feed, the App Server (or Read Replica) returns the CDN URL for the thumbnail (e.g., `https://cdn.snapshare.io/thumbnails/{user_id}/{photo_id}.jpg`). On the first request after publication, the CDN fetches the thumbnail from Object Storage and caches it at the edge. All subsequent requests by any user are served directly from the CDN edge node with sub-50 ms latency globally.

**Failure Handling**: If Object Storage is temporarily unavailable during step 2, the upload fails fast with `503` — no partial metadata is written. If the Primary Database write (step 3) fails after a successful Object Storage write, the orphaned object is cleaned up by a periodic reconciliation job that compares object-storage listings with database records. If a Thumbnail Worker crashes mid-processing, the unacknowledged queue message is redelivered after a visibility timeout, ensuring at-least-once thumbnail generation.

---

## 8. Architectural Trade-offs

### Trade-off 1: Read-Replica Replication Lag vs. Feed Freshness

- **Context**: SnapShare routes all feed and profile read queries to PostgreSQL read replicas to horizontally scale read throughput to ~2,894 peak queries/sec. All writes go exclusively to the primary database, which propagates changes to replicas **asynchronously**.
- **The Problem — Replication Lag**: Asynchronous replication typically introduces 50–500 ms of lag between a write on the primary and its visibility on replicas. A user who uploads a photo and immediately refreshes their own profile may not see the new post if the replica has not yet received the write, creating a confusing experience.
- **Option A — All Reads from Replicas (Eventual Consistency)**: Maximizes horizontal scalability and keeps the primary write throughput optimal (~12 writes/sec unconstrained). Accepts brief post-write inconsistency.
- **Option B — All Reads from Primary (Strict Consistency)**: Guarantees users always see their most recent uploads immediately. However, routing peak ~2,894 read queries/sec to a single primary creates severe contention with write transactions, risking lock timeouts, connection pool exhaustion, and degraded write performance.
- **Decision for SnapShare**: Implement **read-your-own-writes consistency** — route each user's own requests (their profile page, their upload confirmation) to the primary database (or an optimistic client-side cache) for 2–5 seconds after an upload, while routing all follower feed queries to read replicas. This satisfies the expectation that a user immediately sees their own post, without routing general read traffic through the constrained primary.

---

### Trade-off 2: Asynchronous Thumbnail Processing vs. Immediate Availability

- **Context**: Generating a 50 KB thumbnail from a 2 MB original requires CPU-intensive image decoding, bicubic scaling, and JPEG re-encoding. SnapShare offloads this work to a dedicated background worker fleet via a message queue rather than performing it inline within the HTTP upload handler.
- **The Problem — Processing Latency**: Image resizing with libvips takes roughly 200–1,500 ms per photo depending on dimensions and server CPU. At ~12 uploads/second, synchronous inline resizing would consume 12 × ~800 ms = ~9.6 CPU-seconds per second of upload throughput, saturating App Server CPU and blocking all concurrent requests including feed reads.
- **Option A — Synchronous Inline Rendering**: Guarantees the thumbnail exists before `201 Created` is returned. The uploader always sees their thumbnail immediately. However, App Server threads are blocked during CPU-bound resize, directly degrading p99 feed-read latency and creating upload bottlenecks at ~12 uploads/sec peak.
- **Option B — Asynchronous Background Processing (Chosen)**: The App Server responds with `201 Created` in under 500 ms after persisting the original. Thumbnail Workers are a separately scaled, independently deployable fleet. Upload spikes never affect feed-read latency. However, there is a brief window (typically 2–10 seconds) during which the photo exists in `processing` state and followers see a placeholder instead of the final thumbnail.
- **Decision for SnapShare**: Asynchronous processing is the correct choice at this scale. The Thumbnail Worker fleet auto-scales independently based on queue depth, absorbing upload bursts without impacting the read path. The brief `processing` placeholder is acceptable UX — the client progressively substitutes the original (lower-resolution preview) until the CDN-cached thumbnail is available. Workers are sized to keep the queue drain time under 5 seconds at peak upload load.
