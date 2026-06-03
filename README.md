# EdgeLock — NHAI Hackathon 7.0
### Enterprise-Grade Offline-First Face Authentication & 3D Liveness Detection

An enterprise-ready, offline-first facial authentication and secure logging solution engineered specifically for NHAI (National Highways Authority of India) field operations. Designed to function reliably in remote highway environments with zero network connectivity.

This repository features a unified React Native codebase targetable to both **Android** and **iOS** platforms, optimized for cloud-based compilation via **Expo Application Services (EAS)**, allowing development and build delivery from Windows/Linux hosts.

---

## Architecture Pipeline
```
Camera Feed ➔ MediaPipe Face Mesh (Liveness WebView) ➔ JPEG Decode (jpeg-js) ➔ Face Alignment (CLAHE) ➔ GhostFaceNet INT8 Embedding ➔ Cosine Similarity Matching (SQLite) ➔ Encrypted Local Logging ➔ AWS Sync Queue
```

---

## Technical Stack
* **Core Framework**: Expo SDK 50 (~50.0.14) + React Native 0.73.6
* **Language**: TypeScript (Strict Mode)
* **Local Database**: `expo-sqlite` (Relational SQL engine utilizing system SQLite)
* **Security & Key Management**: `react-native-encrypted-storage` (Hardware-backed iOS Keychain / Android Keystore) + AES-256 (`crypto-js`)
* **Neural Network Inference**: `react-native-fast-tflite` (High-performance JSI / C++ runtime wrapper)
* **On-Device Model**: GhostFaceNet INT8 Quantized (~1 MB, 512-dimensional unit L2-normalized embeddings)
* **Liveness WebView**: `react-native-webview` (WKWebView on iOS / System WebView on Android) running MediaPipe Face Mesh WebAssembly (WASM)
* **Image Processor**: Pure JS JPEG decoder (`jpeg-js`) + raw canvas manipulation
* **Local Dev Mock Server**: Express 4 (`mock-aws-server/`)

---

## Key Features & Implementations

### 1. Robust TypeScript Contracts & Type System
* Strict domain models defined in `src/types/index.ts`.
* Stable data structures for authentication logging (`AuthLog`), liveness error payloads (`LivenessError`), and component configuration parameters.

### 2. Multi-Factor 3D Liveness Detection
To prevent biometric spoofing (e.g., using a photo or video displayed on a mobile device):
* **Eye Aspect Ratio (EAR)**: Computes eye contours in real-time to detect active blinks.
* **Mouth Aspect Ratio (MAR)**: Monitors mouth movement gestures.
* **Head Yaw/Turn Assessment**: Assesses asymmetrical head rotation angles.
* **Passive 3D Depth Verification**: Analyzes the standard deviation of landmark z-coordinates to identify flat 2D surfaces (such as printed photos or digital displays) vs. 3D faces.

### 3. iOS-Specific WKWebView Sandboxing
* **Local Origin Bypass**: WKWebView blocks default `file://` fetch requests. This codebase patches fetch with an XMLHTTPRequest polyfill and utilizes local documents caching.
* **Directory Read Permission**: Configures `allowingReadAccessToURL` pointing to the MediaPipe local documents directory. This allows the WebView to load sibling scripts (`face_mesh.js`) and WASM modules within the sandbox without CORS or origin blocks.

### 4. Advanced Lighting Preprocessing (CLAHE)
* Outdoors on national highways, glare and dark shadows cause biometric mismatching.
* The preprocessing pipeline implements **CLAHE (Contrast Limited Adaptive Histogram Equalization)** in 8x8 tiles combined with bilinear interpolation. This normalizes lighting and shadows before resizing the target face to the model's standard 112x112 grayscale input.

### 5. Encrypted SQLite Registry & Log Queue
* Enrolled user embeddings are encrypted using AES-256-CBC and stored in `expo-sqlite`.
* Authentication logs are queued locally. When network connectivity transitions to online (monitored via `@react-native-community/netinfo`), a background sync worker batches logs to the AWS endpoint.
* **Zero-Loss Purge Rule**: Client logs are deleted locally only after the server responds with HTTP 200 containing the processed transaction log IDs.

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

## EAS Build & Platform Configuration (No Local Mac Required)

The project leverages Continuous Native Generation (CNG). The native directories (`/ios`, `/android`) are ignored by Git. EAS Build compiles the application on cloud macOS builders.

### 1. Disable Flipper
To ensure compatibility with JSI native modules and expedite cloud builds, Flipper is disabled inside `app.json` under `"ios": { "flipper": false }`.

### 2. Available Build Profiles (`eas.json`)
* **`development`**: Compiles an `.ipa` development client for registered physical iOS devices. Requires a paid Apple Developer Account.
* **`development-simulator`**: Compiles an iOS Simulator-ready build (`.app` in a `.tar.gz` bundle). Does not require an Apple Developer Account.
* **`production` / `preview`**: Production-ready internal testing profiles.

---

## Running Verification & Tests

### 1. Compile & Typecheck
Ensure zero TypeScript compilation errors:
```bash
npm run ts:check
```

### 2. Run Jest Test Suite
Runs the database transaction, security, and integration tests using mock SQLite and secure storage drivers:
```bash
npm test
```

### 3. Run Mock AWS Server
Starts the Express mock server locally to test logs batch syncing:
```bash
cd mock-aws-server
npm install
node server.js
```
* **Endpoint**: `POST http://localhost:3001/api/sync`
* Test locally using Curl:
  ```bash
  curl -X POST http://localhost:3001/api/sync \
    -H "Content-Type: application/json" \
    -d '{"logs":[{"log_id":"test-1","user_id":"u1","timestamp":"2026-05-25T10:00:00Z","gps_lat":12.97,"gps_lng":77.59,"device_id":"d1","similarity_score":0.85,"photo_thumb":"data:image/jpeg;base64,abc123"}]}'
  ```

---

## Step-by-Step iOS Development & Testing (from Windows/Linux)

Since this app contains custom C++ native JSI modules (`react-native-fast-tflite`), it cannot run in the standard Expo Go client. You must build a custom development client.

### Method A: Browser-Based iOS Simulator (No Apple Account Required)
1. **Login to EAS**:
   ```bash
   eas login
   ```
2. **Build for Simulator**:
   ```bash
   eas build --platform ios --profile development-simulator
   ```
3. **Deploy to Simulator Cloud**:
   - Download the generated `.tar.gz` from your EAS dashboard.
   - Go to [Appetize.io](https://appetize.io/) and upload the archive.
4. **Link and Debug**:
   - Run the local Metro server using tunnel forwarding on your Windows host:
     ```bash
     npx expo start --tunnel
     ```
   - Copy the printed development client URL (e.g. `exp+binary-brains-datalake://...`) and paste it into the Appetize browser window to run your code inside the virtual device.

### Method B: Physical iOS Device (Requires Apple Developer Account)
1. **Register Device**:
   ```bash
   eas device:create
   ```
   Follow the prompts to register your device's UDID with your Apple Developer account.
2. **Build for Device**:
   ```bash
   eas build --platform ios --profile development
   ```
3. **Install & Run**:
   - Scan the generated EAS build QR code with your iPhone/iPad to install the custom client.
   - Connect the iPhone/iPad to the same Wi-Fi network as your Windows machine.
   - Start Metro:
     ```bash
     npx expo start
     ```
   - Launch the app on your phone, and it will sync to your local development server.

---

## Core Engineering Decisions
* **JSI & Fast TFLite Integration**: Bypasses the standard React Native bridge, allowing synchronous model invocation (`model.runSync()`) from the JS thread directly to the C++ TensorFlow Lite library, achieving desktop-grade performance on mobile.
* **WKWebView File Access Integration**: Overcomes WebKit sandboxing by copying assets to the application's local documents directory and setting the specific `allowingReadAccessToURL` attribute on initialization.
* **Zero-Loss Syncing Queue**: Protects database logs using transactional operations. Logs are marked as synced but never purged from local storage until the server returns an HTTP 200 with matching logs payload confirmation.
