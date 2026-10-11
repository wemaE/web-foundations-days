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

The following text diagram shows the full system topology: clients at the top, CDN and load balancer as the entry layer, stateless app servers in the middle tier, and the data tier (cache, primary database, read replicas, object storage, message queue, and thumbnail workers) at the bottom.

```
[ Clients / Mobile Apps / Web Browsers ]
         |                         |
         | (1. Read Media:         | (2. API Requests:
         |  Images & Thumbnails)   |  Feed Views, Uploads)
         v                         v
   +------------+           +-------------------+
   |    CDN     |           |   Load Balancer   |
   | (Edge Cache|           | (Round-Robin /    |
   |  & HTTPS   |           |  Health Checks)   |
   | Termination|           +-------------------+
   +------------+                    |
         |                   +-------+-------+
         | (Cache Miss)       |               |
         v                   v               v
   +------------+     +-----------+   +-----------+
   |   Object   |<==  | App Server|   | App Server|
   |  Storage   |  |  | (Node/Go) |   | (Node/Go) |
   | (S3 / GCS) |  |  +-----------+   +-----------+
   +------------+  |       |      \   /      |
         ^         |       |       \ /       |
         |         |       v        v        v
  (Writes:         |   +-------+  +-----------------+
  Thumbnails)      |   | Cache |  | Primary DB (SQL)|
         |         |   |(Redis)|  |  (Writes only)  |
         |         |   +-------+  +-----------------+
   +------------+  |                       |
   | Thumbnail  |  |               (Async Replication)
   |  Worker    |  |                       v
   +------------+  |              +-----------------+
         ^         |              |  Read Replicas  |
         |         |              | (Feed / Profile |
    (Pulls Job)    |              |   Read Queries) |
         |         |              +-----------------+
   +------------+  |
   |   Message  |<-+  (Publish thumbnail job on upload)
   |   Queue    |
   |(SQS/Rabbit)|
   +------------+
```

**Data Flow Summary**:
- **Reads**: Clients → CDN (edge cache hit) → Object Storage (cache miss for media); Clients → Load Balancer → App Servers → Redis Cache → Read Replicas
- **Writes**: Clients → Load Balancer → App Servers → Primary DB (metadata) + Object Storage (file) + Message Queue (job)
- **Background**: Queue → Thumbnail Workers → Object Storage (thumbnails) + Primary DB (metadata update) → CDN (served on next request)

---

## 5. Component Responsibilities

- **CDN (Content Delivery Network)**: Caches static images and thumbnails at geographically distributed edge locations near users to minimize latency and offload bandwidth from origin servers.
- **Load Balancer**: Distributes incoming HTTP/HTTPS application traffic evenly across multiple stateless application servers to prevent any single server from becoming a bottleneck or single point of failure.
- **App Servers**: Execute core application business logic, including authenticating requests, validating uploads, assembling feed payloads, and coordinating persistence across data stores.
- **Cache (In-Memory / Redis)**: Stores precomputed user feeds, active sessions, and frequently accessed photo metadata in RAM to deliver sub-millisecond read responses and shield the database from repetitive queries.
- **Primary Database**: Handles authoritative relational data writes, user accounts, and photo metadata transactions with ACID guarantees.
- **Read Replicas**: Synchronously or asynchronously replicate data from the primary database to serve read-only queries (e.g., user profiles, photo metadata lookups) and distribute query load horizontally across multiple nodes.
- **Object Storage**: Durably stores original raw photo files and generated thumbnails in a highly available, infinitely scalable, and cost-effective distributed storage system.
- **Message Queue**: Decouples photo upload ingestion from background image processing, buffering thumbnail generation tasks to guarantee asynchronous and resilient execution even under spiky upload load.
- **Thumbnail Worker**: Consumes image processing jobs from the queue, downloads original photos, generates optimized 50 KB thumbnails, uploads them back to object storage, and updates the database with thumbnail references.

---

## 6. End-to-End Upload Flow

1. **Client Upload Initiation**: The user selects a photo on the client app and sends an upload request to the Load Balancer, which routes the request to an available App Server.
2. **Persist to Object Storage**: The App Server authenticates the user, validates file parameters (MIME type, size ≤ 2 MB), and streams the raw 2 MB photo file directly to **Object Storage** under a unique key path (e.g., `s3://snapshare-media/originals/{photo_id}.jpg`).
3. **Save Metadata to Database**: The App Server writes initial photo metadata (status: `processing`, `user_id`, `photo_id`, `created_at`, `original_url`) to the **Primary Database** with an ACID-guaranteed INSERT.
4. **Enqueue Thumbnail Job**: Upon confirming the successful write to both object storage and the database, the App Server publishes a thumbnail generation message containing `{photo_id, original_s3_url, user_id}` to the **Message Queue**.
5. **Immediate Client Response**: The App Server immediately returns a `201 Created` response to the client with the photo ID and a `processing` status, allowing the user interface to remain responsive without waiting for thumbnail rendering.
6. **Worker Generates Thumbnails**: An available **Thumbnail Worker** pulls the message from the queue, downloads the 2 MB original from Object Storage, and resizes the image to a standardized 50 KB thumbnail using an image processing library (e.g., libvips, Sharp).
7. **Store Thumbnails in Object Storage**: The worker uploads the finished thumbnail to Object Storage (e.g., `s3://snapshare-media/thumbnails/{photo_id}.jpg`) and updates the photo record in the **Primary Database** with the thumbnail URL and status `published`.
8. **Deliver via CDN**: When followers view their feed, the App Server returns the CDN URL for the thumbnail. The client requests the image from the **CDN**, which fetches from Object Storage on the first access, caches the thumbnail at the nearest edge node, and serves all subsequent views with sub-50 ms latency.

---

## 7. Architectural Trade-offs

### Trade-off 1: Read-Replica Replication Lag vs. Feed Freshness

- **Context**: SnapShare routes feed and profile read queries to PostgreSQL read replicas to horizontally scale read throughput. Writes go exclusively to the primary database, which replicates changes to replicas asynchronously.
- **Analysis**:
  - *Replica Reads (Eventual Consistency)*: Offloading 100% of read traffic to replicas maximizes scalability and keeps the primary write throughput optimal at ~12 writes/sec. However, asynchronous replication typically introduces 50–500 ms of lag. A user who just uploaded a photo and immediately refreshes their own profile feed may not see their newly posted image if the replica has not yet received the write.
  - *Primary Reads (Strict Consistency)*: Routing all reads—including feed views—to the primary database guarantees that users always see their most recent uploads. However, routing the peak ~2,894 read queries/sec to a single primary creates contention with incoming write transactions, risking lock timeouts, connection pool exhaustion, and degraded write performance.
- **Decision for SnapShare**: Implement **read-your-own-writes consistency**—route a user's own requests (their profile page, their upload confirmation) to the primary database or an optimistic client-side cache for 2–5 seconds following an upload, while routing all follower feed queries to read replicas. This satisfies the expectation that a user sees their own post immediately, without compromising system-wide scalability.

---

### Trade-off 2: Asynchronous Thumbnail Processing vs. Immediate Thumbnail Availability

- **Context**: Generating a 50 KB thumbnail from a 2 MB original photo requires CPU-intensive image decoding, scaling, and re-encoding. SnapShare offloads this work to a background message queue and dedicated worker fleet rather than performing it inline within the HTTP upload request.
- **Analysis**:
  - *Asynchronous Processing (Chosen)*: The App Server responds to the uploader immediately after persisting the original file, without waiting for thumbnail generation. This ensures upload API response times stay well under 1 second regardless of worker load or queue depth. However, a newly uploaded photo briefly exists in a `processing` state; followers who view the feed within the first few seconds after an upload may see a placeholder rather than the final thumbnail.
  - *Synchronous Inline Rendering*: Generating the thumbnail synchronously within the upload HTTP handler guarantees that the thumbnail is ready the instant the client receives `201 Created`. However, image resizing is CPU-bound and can take 200–2,000 ms per photo; at the peak upload rate of ~12 uploads/sec, this would block App Server threads and saturate CPU, directly degrading latency for concurrent feed readers and other API operations.
- **Decision for SnapShare**: Asynchronous thumbnail processing is the correct choice. The Thumbnail Worker fleet scales independently of App Servers, preventing upload spikes from impacting read latency. The brief `processing` placeholder state is an acceptable UX trade-off. To minimize user-perceived delay, workers are scaled to maintain a queue processing time of under 5 seconds, and the client UI displays the original (lower-priority) image as a progressive fallback until the CDN-cached thumbnail is ready.
