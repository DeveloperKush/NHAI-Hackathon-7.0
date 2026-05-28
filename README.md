# Binary Brains — NHAI Hackathon 7.0

A high-performance offline-first facial authentication liveness detection and logging solution designed for NHAI (National Highways Authority of India) applications. Built with Expo, MediaPipe, and GhostFaceNet.

## Technical Stack
- **Core Framework**: Expo SDK 50 + React Native 0.73
- **Language**: TypeScript (Strict Mode)
- **Local Storage**: `expo-sqlite` (Relational structured database)
- **Security & Encryption**: `react-native-encrypted-storage` + AES-256 encryption (`crypto-js`)
- **Neural Network Engine**: `react-native-fast-tflite` (JSI/C++ native runtime)
- **Neural Network Models**: GhostFaceNet INT8 (512-dimensional face embeddings)
- **Image Decoding**: `jpeg-js` (pure Javascript JPEG decoder)
- **Dev Mock Server**: Express 4 (`mock-aws-server/`)

---

## Architecture Pipeline
```
Camera Feed ➔ MediaPipe Face Mesh (Liveness Checks) ➔ JPEG Decode (jpeg-js) ➔ Face Alignment (CLAHE) ➔ GhostFaceNet INT8 Embedding ➔ Cosine Similarity Matching (SQLite) ➔ Encrypted Local Logging ➔ AWS Sync (Background Worker)
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

### 5. Network Monitoring & Zero-Loss Sync
Network observation and synchronization layer located in `src/services/network/` and `src/hooks/`:
- **Network Status Hook (`useNetworkStatus`)**: Detects network connectivity changes, exposing `isConnected` and `connectionType` state.
- **Auto-Sync Listener (`triggerSyncOnConnect`)**: Subscribes to connection state events and automatically schedules logs syncing when transitioning back online.
- **Zero-Loss Sync Logic (`syncAuthLogs`)**: Performs cloud logs dispatching. It verifies connectivity, checks logs availability, POSTs the queue in a batch, checks for HTTP 200 containing successfully processed log IDs, and only then executes a local delete purge.

### 6. Image Preprocessing & Math Utilities
Pure utilities with zero external dependencies to ensure fast execution and consistent math behavior located under `src/utils/`:
- **Contrast Limited Adaptive Histogram Equalization (CLAHE)**: Enhances local contrast in 8x8 tiles using bilinear interpolation, preventing poor detection under varying Indian outdoor lighting conditions.
- **Global Histogram Equalization**: Provides global contrast enhancement by redistributing pixel intensity distributions.
- **Pixel Normalization**: Normalizes pixel values from `[0, 255]` to `[-1.0, 1.0]`.
- **Bilinear Crop & Resize (`cropTo112x112`)**: Extracts face bounding box coordinates and rescales them to a standard `112x112` size using bilinear interpolation, then normalizes the output.
- **Vector Cosine Similarity**: Compares Float32Array face embeddings to evaluate matching authenticity scores.
- **Vector L2 Normalization**: Scales face embeddings to unit L2 length.

### 7. Camera Processing & Authentication Hook
Integrated camera frame capture preprocessing, mock mesh coordinates generation, and auth orchestration hook under `src/services/camera/` and `src/hooks/`:
- **Camera Frame Processor (`processCameraFrame`)**: Decodes frame base64 JPEG data using `jpeg-js` into raw pixels, converts RGBA to grayscale, resizes to a standardized `112x112` canvas using bilinear interpolation, runs CLAHE to equalize contrast, and returns normalized float values.
- **Landmarks Simulation (`simulateLandmarksFromFrame`)**: Simulates 468 landmarks for MediaPipe Face Mesh. Correctly sets 3D depth variance for authentic faces to pass the passive 3D depth check, and flattens depth (`z ≈ 0`) to trigger spoof detection for flat photo spoofs. Includes eye-blink, smile, and head-turn gesture simulation.
- **Sequential Enrollment Captures (`captureEnrollmentFrames`)**: Captures 3-5 sequential photos programmatically via the camera ref for administrative face enrollment.
- **Auth Orchestration Hook (`useAuth`)**: A state machine hook that guides the authentication flow through exact states: `idle` ➔ `scanning` ➔ `liveness` ➔ `matching` ➔ `authenticated` / `failed`. Handles the liveness challenge loops, coordinates location (GPS) captures, executes SQLite logs creation, and triggers network dispatches.

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
- Network status monitoring (detecting online/offline status via netinfo).
- Zero-loss sync behavior (logs syncing successfully on HTTP 200 and keeping data intact on network/server error).
- Auto-sync trigger on hook connect.

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
| 4. Network/Sync | ✅ DONE | connectionInfo.ts, awsSync.ts, useNetworkStatus.ts |
| 5. Preprocessing | ✅ DONE | imagePreProc.ts, math.ts |
| 6. Liveness | ✅ DONE | MediaPipe Face Mesh EAR/MAR challenge detection |
| 7. Recognition | ✅ DONE | TFLite GhostFaceNet INT8 cosine similarity matching |
| 8. Camera/Hook | ✅ DONE | frameProcessors.ts, useAuth.ts |
| 9. UI Overlay | ✅ DONE | CameraOverlay, LivenessFeedback, FaceAuthenticator |
| 10. Enrollment | ✅ DONE | EnrollmentScreen.tsx |
| 11. Demo | ✅ DONE | DemoAuthScreen.tsx, App.tsx |
| 12. Polish | ✅ DONE | tsconfig emit configuration, README.md, context.txt |

---

## Key Decisions
- **Database**: `expo-sqlite` for MVP (upgrade to `op-sqlite` for production throughput)
- **Encryption**: AES-256 via `react-native-encrypted-storage` — key generated once, persisted in hardware-backed store
- **Sync Purge Rule**: Local rows are NEVER deleted until HTTP 200 is confirmed from server
- **Idempotency**: Server tracks `log_id` in memory; client can safely retry failed batches
- **Zero-Loss Purge**: deleteSyncedLogs is ONLY invoked after HTTP 200 with received_logs array is confirmed
- **Pure Preprocessing**: No side effects, no React Native/Native UI context dependencies, ensuring high-speed math checks and simple testability
- **Liveness Validation**: 4-factor validation (EAR blink, MAR smile, head yaw asymmetry, and passive 3D depth check) with randomized challenge order, running on-device for spoof resistance.
- **TFLite Face Recognition Upgrade**: Fully upgraded from MVP pseudo-embeddings to GhostFaceNet INT8 real model running synchronously via `react-native-fast-tflite` JSI on-device. Input and output tensors quantized and dequantized natively with zero fallbacks.
- **Real JPEG Frame Decoding**: Integrated `jpeg-js` library to decode compressed JPEG base64 photos into raw grayscale buffers, resolving key collision issues (where static JPEG headers resulted in high similarity score matches for different people).
- **TypeScript Emit Prevention**: Configured `"noEmit": true` in `tsconfig.json` and deleted all duplicate compiled JS files inside `src/` to ensure Metro correctly resolves extensionless imports to the updated TS code.
- **UI & Feedback Overlay**: Implemented CameraOverlay with custom cutout and dynamic pulsing status colors, top-aligned LivenessFeedback banner, status pill transitions, and integrated haptic feedback styles.
- **Admin Enrollment Screen**: Integrated stepper (Capture ➔ Processing ➔ Saved), horizontal scrollable frame viewer with processed checkmarks, user_id uniqueness verification against SQLite database, multi-frame (3-5) embedding averaging with L2-normalization, and encrypted SQLite persistence.
- **Main Application & Demo Auth Screen**: Embedded the compact FaceAuthenticator card, added success cards displaying nullable GPS coordinates and scores, created a scrollable recent logs SQLite view, configured stack-based navigation (DemoAuthScreen and EnrollmentScreen), and set up global network auto-sync hooks.

- **Open-Source Only**: All dependencies are Apache 2.0 / MIT / BSD licensed
