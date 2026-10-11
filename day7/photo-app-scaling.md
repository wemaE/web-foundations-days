# SnapShare: System Architecture & Scaling Analysis

This document provides a scaling analysis, capacity planning calculations, and architectural design for **SnapShare**, a high-scale photo-sharing social platform.

---

## 1. Assumptions & Calculations

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

#### 1. Daily Active Users (DAU)
$$\text{DAU} = \text{Total Registered Users} \times \text{Active Ratio}$$
$$\text{DAU} = 10,000,000 \times 0.10 = 1,000,000 \text{ users/day}$$

- **Result**: **1,000,000 Daily Active Users (1 million DAU)**

---

#### 2. Average Uploads per Second
$$\text{Total Daily Uploads} = \text{DAU} \times 1 \text{ upload/day} = 1,000,000 \text{ uploads/day}$$
$$\text{Average Uploads/sec} = \frac{\text{Total Daily Uploads}}{\text{Seconds per Day}} = \frac{1,000,000}{86,400} \approx 11.574 \text{ uploads/sec}$$

- **Result**: **~11.57 uploads per second**

---

#### 3. Average Feed Views per Second & Peak (5× Average)
$$\text{Total Daily Feed Views} = \text{DAU} \times 50 \text{ views/day} = 1,000,000 \times 50 = 50,000,000 \text{ views/day}$$
$$\text{Average Feed Views/sec} = \frac{50,000,000}{86,400} \approx 578.704 \text{ views/sec}$$
$$\text{Peak Feed Views/sec} = \text{Average Feed Views/sec} \times 5 = 578.7037 \times 5 \approx 2,893.52 \text{ views/sec}$$

- **Average Result**: **~578.70 feed views per second**
- **Peak Result (5×)**: **~2,893.52 feed views per second** (~2,894 views/sec)

---

#### 4. Annual Photo Storage (Including Thumbnails)
Each upload produces two assets:
1. Original photo: $2\text{ MB} = 2,000\text{ KB}$
2. Generated thumbnail: $50\text{ KB} = 0.05\text{ MB}$

##### Decimal / SI Units ($1\text{ MB} = 1,000\text{ KB}$, $1\text{ GB} = 1,000\text{ MB}$, $1\text{ TB} = 1,000\text{ GB}$):
$$\text{Storage per Upload} = 2.00\text{ MB} + 0.05\text{ MB} = 2.05\text{ MB}$$
$$\text{Daily Storage} = 1,000,000 \text{ uploads/day} \times 2.05\text{ MB} = 2,050,000\text{ MB/day} = 2,050\text{ GB/day} = 2.05\text{ TB/day}$$
$$\text{Annual Storage (365 days)} = 2.05\text{ TB/day} \times 365\text{ days} = 748.25\text{ TB/year}$$

- In Gigabytes: $748,250\text{ GB/year}$
- In Terabytes: **748.25 TB/year** (~0.748 PB/year)

##### Binary / IEC Units ($1\text{ MB} = 1,024\text{ KB}$, $1\text{ GiB} = 1,024\text{ MiB}$, $1\text{ TiB} = 1,024\text{ GiB}$):
- Storage per upload: $2,048\text{ KB} + 50\text{ KB} = 2,098\text{ KB} \approx 2.0488\text{ MiB}$
- Daily storage: $1,000,000 \times 2,098\text{ KB} = 2,098,000,000\text{ KB} \approx 2,000.81\text{ GiB/day} \approx 1.9539\text{ TiB/day}$
- Annual storage: $1.9539\text{ TiB/day} \times 365 \approx \mathbf{713.18\text{ TiB/year}}$ ($730,296\text{ GiB/year}$)

---

## 2. Workload Analysis

### Nature of Workload: Read-Heavy
SnapShare has a **50:1 read-to-write ratio** (50 feed views per active user versus 1 upload per active user). At steady state, the system handles ~579 read queries per second compared to ~12 write requests per second, surging to nearly 2,900 reads per second during peak hours. SnapShare is overwhelmingly **read-heavy**.

### Architectural Impact
1. **Aggressive Multi-Tier Caching**: Because users read the same feed and popular media repeatedly, 90%+ of read requests should be fulfilled by in-memory caches (Redis/Memcached) and edge Content Delivery Networks (CDNs), shielding origin infrastructure.
2. **Read/Write Database Segregation**: The primary database cannot handle 2,900 peak queries/sec alongside write transactions without severe contention. Deploying **read replicas** distributes feed query volume horizontally, keeping the primary database dedicated to writes.
3. **Asynchronous Write Decoupling**: Writes (photo uploads, metadata creation, feed fan-out) must be decoupled from the user request lifecycle using background queues, ensuring that write-intensive tasks (image resizing) never degrade read latencies.

---

## 3. Photo Storage: Object Storage vs. Database

Photo files belong in **dedicated cloud object storage** (e.g., Amazon S3, Google Cloud Storage, Cloudflare R2) rather than as binary BLOBs inside a relational or document database for several key reasons:

1. **Storage Cost Efficiency**: Storing ~748 TB per year on high-performance database block storage (e.g., AWS EBS SSDs at ~$0.08–$0.12/GB/month) is cost-prohibitive. Object storage offers commodity pricing (~$0.015–$0.023/GB/month) with automated lifecycle tiering to archive colder photos to Glacier/Coldline at even lower rates.
2. **Database Performance & Cache Bloat**: Databases rely on memory buffer pools (e.g., InnoDB buffer pool) to cache index pages and frequently accessed rows. Storing multi-megabyte binary files fills memory with unindexable byte streams, evicting relational data pages and drastically degrading query performance.
3. **Backup, Maintenance, & Replication Overhead**: Backing up, restoring, vacuuming, and replicating a database holding petabytes of media causes massive I/O saturation and elongated recovery times. In contrast, object stores provide built-in 99.999999999% (11 9s) durability without manual database backups.
4. **Direct CDN & Client Delivery**: Object stores natively support pre-signed URLs and direct integration with CDNs for edge caching. Clients download images directly from edge nodes without consuming database connections or application server threads.

---

## 4. Architecture Diagram

```
[ Clients / Mobile Apps / Web Browsers ]
         |                         |
         | (1. Read Media:         | (2. API Requests:
         |  Images & Thumbnails)   |  Feed Views, Uploads)
         v                         v
   +------------+           +-------------------+
   |    CDN     |           |   Load Balancer   |
   +------------+           +-------------------+
         |                            |
         | (Cache Miss)        +------+------+
         v                     |             |
   +------------+              v             v
   |   Object   |<====  +-------------+ +-------------+
   |  Storage   |    |  | App Server  | | App Server  |
   | (S3 / GCS) |    |  |  (Node/Go)  | |  (Node/Go)  |
   +------------+    |  +-------------+ +-------------+
         ^           |      |      |           |
         |           |      |      +-----+-----+
         |           |      |            |
(Writes  |           |      v            v
Thumb-   |     (Uploads) +-------+  +-----------------+
 nails)  |           |   | Cache |  | Primary DB (SQL)|
         |           |   |(Redis)|  |    (Writes)     |
         |           |   +-------+  +-----------------+
   +------------+    |                       |
   | Thumbnail  |    |               (Replication)
   |   Worker   |    |                       v
   +------------+    |              +-----------------+
         ^           |              |  Read Replica   |
         |           |              |     (Reads)     |
    (Pulls Job)      |              +-----------------+
         |           |
   +------------+    |
   |   Queue    |<---+
   |(SQS/Rabbit)|
   +------------+
```

---

## 5. Component Responsibilities

- **CDN (Content Delivery Network)**: Caches static images and thumbnails at geographically distributed edge locations near users to minimize latency and offload bandwidth from origin servers.
- **Load Balancer**: Distributes incoming HTTP/HTTPS application traffic evenly across multiple stateless application servers to prevent any single server from becoming a bottleneck or single point of failure.
- **App Servers**: Execute core application business logic, including authenticating requests, validating uploads, assembling feed payloads, and coordinating persistence across data stores.
- **Cache (In-Memory / Redis)**: Stores precomputed user feeds, active sessions, and frequently accessed photo metadata in RAM to deliver sub-millisecond read responses and shield the database from repetitive queries.
- **Primary Database**: Handles authoritative relational data writes, user accounts, and photo metadata transactions with ACID guarantees.
- **Read Replica Database**: Synchronously or asynchronously replicates data from the primary database to serve read-only queries (e.g., user profiles, photo metadata lookups) and distribute query load.
- **Object Storage**: Durably stores original raw photo files and generated thumbnails in a highly available, infinitely scalable, and cost-effective distributed storage system.
- **Message Queue**: Decouples photo upload ingestion from background image processing, buffering thumbnail generation tasks to guarantee asynchronous and resilient execution.
- **Thumbnail Worker**: Consumes image processing jobs from the queue, downloads original photos, generates optimized 50 KB thumbnails, uploads them back to object storage, and updates the database with thumbnail references.

---

## 6. End-to-End Upload Flow

1. **Client Upload Initiation**: The user selects a photo on the client app and sends an upload request to the Load Balancer, which routes the request to an available App Server.
2. **Metadata & Pre-signed URL / Direct Ingestion**: The App Server authenticates the user, validates file parameters (MIME type, size $\le 2\text{ MB}$), stores initial photo metadata (status: `processing`, `user_id`, `created_at`, photo ID) in the **Primary Database**, and receives the file binary.
3. **Persist to Object Storage**: The App Server streams the raw 2 MB photo file directly to **Object Storage** under a unique key path (e.g., `s3://snapshare-media/originals/{photo_id}.jpg`).
4. **Publish Asynchronous Job**: Upon successful upload to object storage, the App Server pushes a thumbnail generation message containing `{photo_id, original_s3_url, user_id}` onto the **Message Queue**.
5. **Immediate Client Response**: The App Server immediately returns a `201 Created` response to the client with the photo ID and temporary status, allowing the user interface to remain responsive without waiting for thumbnail rendering.
6. **Worker Processing**: An available **Thumbnail Worker** pulls the message from the queue, downloads the 2 MB original from Object Storage, resizes the image to a standardized 50 KB thumbnail, and uploads the thumbnail to Object Storage (e.g., `s3://snapshare-media/thumbnails/{photo_id}.jpg`).
7. **Metadata Update & Cache Eviction**: The worker updates the photo record in the **Primary Database** with the thumbnail URL and status `published`, then invalidates or updates the user's feed cache in **Redis**.
8. **Edge CDN Delivery**: When followers view their feed, the App Server returns the CDN URL for the thumbnail. The client requests the image from the **CDN**, which caches the thumbnail at the edge on first access and serves subsequent views with minimal latency.

---

## 7. Architectural Trade-offs

### Trade-off 1: Cache Freshness vs. Read Latency
- **Context**: SnapShare can precompute and cache feeds in Redis with fixed Time-To-Live (TTL) expiration or event-driven cache invalidation.
- **Analysis**:
  - *Prioritizing Speed (Long TTL / Cache-Aside)*: Serving feeds entirely out of Redis guarantees response times under 15 ms, effortlessly sustaining the peak 2,894 views/sec. However, a newly uploaded photo may not appear in friends' feeds until the TTL expires (e.g., 60–120 seconds).
  - *Prioritizing Freshness (Immediate Fan-Out on Write)*: Immediately invalidating and updating every follower's cached feed guarantees instantaneous visibility of new posts. However, for users with thousands of followers ("celebrity problem"), writing a single photo triggers a massive burst of cache writes and database queries, increasing system complexity, write amplification, and latency.
- **Decision for SnapShare**: Adopt a hybrid model: fan-out writes to active users with a moderate 60-second TTL cache fallback, accepting short eventual consistency to preserve low read latencies.

---

### Trade-off 2: Consistency vs. Read-Replica Performance (Replication Lag)
- **Context**: Read queries are routed to database read replicas to scale query throughput, while writes hit the primary database.
- **Analysis**:
  - *Strict Consistency (Read-After-Write from Primary)*: If a user uploads a photo and immediately refreshes their own profile, routing the read to a read replica may result in the user not seeing their newly uploaded photo if the replica is experiencing asynchronous replication lag (typically 50–500 ms). Reading strictly from the primary ensures immediate consistency, but routing all profile reads to the primary risks overloading it during traffic spikes.
  - *Eventual Consistency (All Reads from Replicas)*: Offloading 100% of read traffic to replicas maximizes database scalability and keeps primary write throughput optimal, but users may perceive transient inconsistencies right after write operations.
- **Decision for SnapShare**: Implement **read-your-own-writes consistency**: route a user's own requests to the primary database (or serve from optimistic client state / local cache) for 2–5 seconds following an upload, while routing all general feed and follower queries to read replicas. This satisfies user expectations without compromising overall system scalability.
