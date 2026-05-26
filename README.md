# Binary Brains — NHAI Hackathon 7.0

A high-performance offline-first facial authentication liveness detection and logging solution designed for NHAI (National Highways Authority of India) applications. Built with Expo, MediaPipe, and MobileFaceNet.

## Technical Stack
- **Core Framework**: Expo SDK 50 + React Native 0.73
- **Language**: TypeScript (Strict Mode)
- **Local Storage**: `expo-sqlite` (Relational structured database)
- **Security & Encryption**: `react-native-encrypted-storage` + AES-256 encryption (`crypto-js`)
- **Neural Network Models**: MobileFaceNet INT8 (512-dimensional face embeddings)
- **Dev Mock Server**: Express 4 (`mock-aws-server/`)

---

## Architecture Pipeline
```
Camera Feed ➔ MediaPipe Face Mesh (Liveness Checks) ➔ Face Alignment (CLAHE) ➔ MobileFaceNet Embedding ➔ Cosine Similarity Matching (SQLite) ➔ Encrypted Local Logging ➔ AWS Sync (Background Worker)
```

---

## Features Implemented

### 1. Robust TypeScript Contracts & Type System
Fully typed domain interfaces, configurations, and enums exported from `src/types/index.ts` and `src/constants/`:
- **AuthLog**: Detailed schema recording authentication attempts (log ID, user, timestamp, GPS coordinates, device ID, similarity score, and thumbnail).
- **Liveness Checking Configuration**: Defines EAR (Eye Aspect Ratio) and MAR (Mouth Aspect Ratio) indices and threshold criteria to prevent spoofing.
- **Challenge Actions**: Enums for random challenge generation (`BLINK`, `SMILE`, `HEAD_TURN`).

### 2. Encrypted SQLite Storage Layer
Adapters for secure data management located in `src/services/database/`:
- **Enrolled Faces Table (`enrolled_faces`)**: Stores enrolled user IDs and 512-dimension face embeddings. The embeddings are serialized to base64 and encrypted using AES-256.
- **Authentication Logs Table (`auth_logs`)**: Automatically registers auth logs locally before background syncing. Keeps track of synchronization status.
- **Sync Purge Rule**: Locally saved transaction records are only purged after a successful HTTP 200 upload confirmation.

### 3. AES-256 Key & Data Protection
Built-in security utilities under `src/services/encryption/`:
- **Key Isolation**: Generates a 256-bit AES key at first launch and persists it in hardware-backed storage (`react-native-encrypted-storage`).
- **Cryptographic Encryption**: Encrypts sensitive bio-mesh embeddings in-transit before saving to disk.

### 4. Mock AWS Sync Server
A local Express server (`mock-aws-server/`) that simulates the cloud batch-sync endpoint:
- **Endpoint**: `POST /api/sync` — accepts `{ logs: AuthLog[] }`, returns `{ message, received_logs }` with HTTP 200.
- **Idempotency**: Tracks `log_id` values in memory; duplicate submissions are acknowledged but not reprocessed.
- **Purge Safety**: Client must receive HTTP 200 before deleting local rows. On 4xx/5xx the queue is retained and retried.
- **Health Check**: `GET /health` returns server status and count of seen log IDs.

---

## Database Schemas

### Enrolled Faces (`enrolled_faces`)
| Column | Type | Description |
|---|---|---|
| `user_id` | TEXT PRIMARY KEY | Unique identifier for the user |
| `embedding` | BLOB | AES-256 Encrypted Float32Array base64 string |
| `enrolled_at` | TEXT | ISO8601 creation timestamp |

### Authentication Logs (`auth_logs`)
| Column | Type | Description |
|---|---|---|
| `log_id` | TEXT PRIMARY KEY | UUID for the log entry |
| `user_id` | TEXT | Authenticating user identifier |
| `timestamp` | TEXT | ISO8601 date and time |
| `gps_lat` | REAL NULL | Latitude coordinate |
| `gps_lng` | REAL NULL | Longitude coordinate |
| `device_id` | TEXT | Device serial/ID |
| `similarity_score` | REAL | Verification score |
| `photo_thumb` | TEXT | Base64-encoded JPEG thumbnail |
| `synced` | INTEGER | Sync flag (0 = pending, 1 = synced) |

---

## Running Verification & Tests

### 1. Compile & Typecheck
Ensure zero TypeScript compilation errors:
```bash
npm run ts:check
```

### 2. Run Database Test Suite
Runs the database transaction and security tests using mock SQLite and secure storage drivers:
```bash
npm test
```
The test suite validates:
- Generating and caching secure AES-256 keys.
- Inserting a 512-dimensional face embedding, encrypting it, database storage, retrieval, decryption, and reconstructing the exact Float32Array dimensions.
- Logging local authentications, validating unsynced lists, and cleaning entries post-sync.

### 3. Run Mock AWS Server
```bash
cd mock-aws-server
npm install
node server.js
```
Server starts on **http://localhost:3001**

Test with curl:
```bash
curl -X POST http://localhost:3001/api/sync \
  -H "Content-Type: application/json" \
  -d '{"logs":[{"log_id":"test-1","user_id":"u1","timestamp":"2026-05-25T10:00:00Z","gps_lat":12.97,"gps_lng":77.59,"device_id":"d1","similarity_score":0.85,"photo_thumb":"data:image/jpeg;base64,abc123"}]}'
```
Expected response:
```json
{
  "message": "Batch synced successfully",
  "received_logs": ["test-1"]
}
```

---

## Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| 0. Scaffolding | ✅ DONE | Expo SDK 50 scaffold, tsconfig, env, full src/ tree |
| 1. Types | ✅ DONE | src/types/index.ts, constants/* |
| 2. Database | ✅ DONE | SQLite + AES-256 encrypted face & log storage |
| 3. Mock AWS Server | ✅ DONE | Express server, idempotent sync endpoint |
| 4. Network/Sync | 🔲 Next | connectionInfo.ts, awsSync.ts, useNetworkStatus.ts |
| 5. Preprocessing | 🔲 Pending | imagePreProc.ts, math.ts |
| 6. Liveness | 🔲 Pending | MediaPipe Face Mesh EAR/MAR challenge detection |
| 7. Recognition | 🔲 Pending | MobileFaceNet INT8 cosine similarity matching |
| 8. Camera/Hook | 🔲 Pending | frameProcessors.ts, useAuth.ts |
| 9. UI Overlay | 🔲 Pending | CameraOverlay, LivenessFeedback, FaceAuthenticator |
| 10. Enrollment | 🔲 Pending | EnrollmentScreen.tsx |
| 11. Demo | 🔲 Pending | DemoAuthScreen.tsx, App.tsx |
| 12. Polish | 🔲 Pending | ARCHITECTURE.md |

---

## Key Decisions
- **Database**: `expo-sqlite` for MVP (upgrade to `op-sqlite` for production throughput)
- **Encryption**: AES-256 via `react-native-encrypted-storage` — key generated once, persisted in hardware-backed store
- **Sync Purge Rule**: Local rows are NEVER deleted until HTTP 200 is confirmed from server
- **Idempotency**: Server tracks `log_id` in memory; client can safely retry failed batches
- **Open-Source Only**: All dependencies are Apache 2.0 / MIT / BSD licensed
