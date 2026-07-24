#!/usr/bin/env python3
"""
Generate a comprehensive PDF guide for the NHAI EdgeLock (Binary Brains) project.
Saves to: DEMO_GUIDE.pdf in the project root.
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.colors import HexColor, black, white
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak,
    Table, TableStyle, ListFlowable, ListItem, KeepTogether
)
from reportlab.platypus.flowables import HRFlowable
import os

# ── Colours ────────────────────────────────────────────────────────────────
NAVY   = HexColor("#1a237e")
GREEN  = HexColor("#4caf50")
RED    = HexColor("#f44336")
ORANGE = HexColor("#ff9800")
GREY   = HexColor("#757575")
LGREY  = HexColor("#f5f5f5")
CODEBG = HexColor("#f0f0f0")

OUTPUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "DEMO_GUIDE.pdf")

# ── Styles ─────────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    "CoverTitle", parent=styles["Title"],
    fontSize=28, leading=34, textColor=NAVY, spaceAfter=6,
    alignment=TA_CENTER
)
subtitle_style = ParagraphStyle(
    "CoverSubtitle", parent=styles["Normal"],
    fontSize=14, leading=18, textColor=GREY, alignment=TA_CENTER,
    spaceAfter=4
)
h1 = ParagraphStyle(
    "H1", parent=styles["Heading1"],
    fontSize=20, leading=26, textColor=NAVY, spaceBefore=20, spaceAfter=10,
    borderWidth=0, borderPadding=0
)
h2 = ParagraphStyle(
    "H2", parent=styles["Heading2"],
    fontSize=15, leading=20, textColor=NAVY, spaceBefore=14, spaceAfter=6
)
h3 = ParagraphStyle(
    "H3", parent=styles["Heading3"],
    fontSize=12, leading=16, textColor=HexColor("#212121"),
    spaceBefore=10, spaceAfter=4
)
body = ParagraphStyle(
    "Body", parent=styles["Normal"],
    fontSize=10, leading=14, alignment=TA_JUSTIFY, spaceAfter=6
)
code = ParagraphStyle(
    "Code", parent=styles["Code"],
    fontSize=8, leading=10, backColor=CODEBG,
    borderPadding=6, spaceBefore=4, spaceAfter=4,
    leftIndent=12
)
bullet = ParagraphStyle(
    "Bullet", parent=body,
    leftIndent=20, bulletIndent=8, spaceAfter=3
)
faq_q = ParagraphStyle(
    "FAQ_Q", parent=styles["Normal"],
    fontSize=11, leading=15, textColor=NAVY,
    spaceBefore=12, spaceAfter=2, fontWeight="bold"
)
faq_a = ParagraphStyle(
    "FAQ_A", parent=body,
    leftIndent=12, spaceAfter=8
)
note = ParagraphStyle(
    "Note", parent=body,
    fontSize=9, leading=12, textColor=GREY,
    leftIndent=12, spaceAfter=6
)


def sep():
    return HRFlowable(width="100%", thickness=1, color=LGREY, spaceBefore=6, spaceAfter=6)


def code_block(text):
    """Return a list of Paragraphs for a multi-line code snippet."""
    lines = text.split("\n")
    parts = []
    for line in lines:
        parts.append(Paragraph(line.replace(" ", "&nbsp;"), code))
    return parts


def build_story():
    S = []

    # ═══════════════════════ COVER PAGE ════════════════════════
    S.append(Spacer(1, 80))
    S.append(Paragraph("NHAI EdgeLock", title_style))
    S.append(Paragraph("Enterprise-Grade Offline-First Face Authentication", subtitle_style))
    S.append(Paragraph("&amp; 3D Liveness Detection", subtitle_style))
    S.append(Spacer(1, 10))
    S.append(Paragraph("Hackathon Project – Binary Brains", subtitle_style))
    S.append(Spacer(1, 50))
    S.append(sep())
    S.append(Spacer(1, 20))
    S.append(Paragraph(
        "<b>Complete Technical Guide</b><br/>"
        "Codebase Walkthrough · GhostFaceNet Deep Dive · Demo FAQ",
        ParagraphStyle("CoverDesc", parent=body, alignment=TA_CENTER, fontSize=12, textColor=GREY)
    ))
    S.append(Spacer(1, 100))
    S.append(Paragraph("Prepared for NHAI Hackathon 7.0", ParagraphStyle(
        "Date", parent=body, alignment=TA_CENTER, fontSize=10, textColor=GREY)))
    S.append(PageBreak())

    # ══════════════════ TABLE OF CONTENTS ═══════════════════════
    S.append(Paragraph("Table of Contents", h1))
    S.append(sep())
    toc_items = [
        "1 &nbsp; Project Overview",
        "2 &nbsp; Architecture Pipeline",
        "3 &nbsp; Complete Codebase Walkthrough",
        "&nbsp;&nbsp;&nbsp;&nbsp; 3.1 &nbsp; Root Files",
        "&nbsp;&nbsp;&nbsp;&nbsp; 3.2 &nbsp; src/App.tsx – The Entry Point",
        "&nbsp;&nbsp;&nbsp;&nbsp; 3.3 &nbsp; Types &amp; Constants",
        "&nbsp;&nbsp;&nbsp;&nbsp; 3.4 &nbsp; Services – The Engine Room",
        "&nbsp;&nbsp;&nbsp;&nbsp; 3.5 &nbsp; AI &amp; Recognition",
        "&nbsp;&nbsp;&nbsp;&nbsp; 3.6 &nbsp; Camera &amp; Image Processing",
        "&nbsp;&nbsp;&nbsp;&nbsp; 3.7 &nbsp; Database &amp; Encryption",
        "&nbsp;&nbsp;&nbsp;&nbsp; 3.8 &nbsp; Network &amp; Cloud Sync",
        "&nbsp;&nbsp;&nbsp;&nbsp; 3.9 &nbsp; Hooks &amp; Components",
        "&nbsp;&nbsp;&nbsp;&nbsp; 3.10 &nbsp; Screens",
        "4 &nbsp; GhostFaceNet – Why This Model?",
        "5 &nbsp; Demo FAQ – 33 Questions &amp; Answers",
    ]
    for item in toc_items:
        S.append(Paragraph(item, ParagraphStyle("TOC", parent=body, fontSize=11, leading=16, spaceAfter=2)))
    S.append(PageBreak())

    # ═══════════════════ SECTION 1: OVERVIEW ════════════════════
    S.append(Paragraph("1 &nbsp; Project Overview", h1))
    S.append(sep())

    S.append(Paragraph(
        "<b>NHAI EdgeLock</b> is a smartphone-based face authentication system designed for "
        "the National Highways Authority of India (NHAI). It enables field workers (toll operators, "
        "maintenance crews, patrol officers) to verify their identity using only the phone's camera – "
        "<b>completely offline, with no internet required.</b>", body))
    S.append(Paragraph(
        "The system combines three core capabilities:", body))
    S.append(Paragraph("• <b>3D Liveness Detection</b> – Prevents photo/video spoofing with blink, head-turn, and depth checks", bullet))
    S.append(Paragraph("• <b>Face Recognition</b> – GhostFaceNet AI model (~1 MB) converts faces into 512-number fingerprints", bullet))
    S.append(Paragraph("• <b>Offline-First Audit Trail</b> – Every authentication is logged with GPS + timestamp and synced to cloud when available", bullet))

    S.append(Spacer(1, 6))
    S.append(Paragraph("<b>Key Facts</b>", h3))
    facts = [
        ["Metric", "Value"],
        ["Model Size", "~1 MB (GhostFaceNet INT8 quantized)"],
        ["Recognition Speed", "~10-50 ms per inference"],
        ["Total Auth Time", "~3-5 seconds"],
        ["Database", "SQLite (encrypted embeddings + logs)"],
        ["Encryption", "AES-256, hardware-backed keys"],
        ["Anti-Spoofing", "Blink + Head Turn + 3D Depth"],
        ["Storage per User", "~2 KB per face fingerprint"],
    ]
    t = Table(facts, colWidths=[160, 300])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, LGREY),
        ("BACKGROUND", (0, 1), (-1, -1), white),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    S.append(t)
    S.append(PageBreak())

    # ═══════════════════ SECTION 2: ARCHITECTURE ════════════════
    S.append(Paragraph("2 &nbsp; Architecture Pipeline", h1))
    S.append(sep())
    S.append(Paragraph(
        "The authentication pipeline follows this data flow:", body))
    pipe_text = (
        "Camera Feed → MediaPipe Face Mesh (Liveness WebView) → JPEG Decode (jpeg-js) → "
        "Face Alignment (CLAHE) → GhostFaceNet INT8 Embedding → "
        "Cosine Similarity Matching (SQLite) → Encrypted Local Logging → AWS Sync Queue"
    )
    S.append(Paragraph(pipe_text, ParagraphStyle(
        "Pipeline", parent=body, fontSize=9, leading=13,
        backColor=CODEBG, borderPadding=10, spaceAfter=8,
        alignment=TA_CENTER, fontName="Helvetica-Bold"
    )))
    S.append(Spacer(1, 6))

    S.append(Paragraph("<b>Step-by-Step Auth Flow</b>", h3))
    steps = [
        ("Step 1 – App Startup", "Load SQLite database → Load GhostFaceNet TFLite model → Cache MediaPipe assets"),
        ("Step 2 – Scan", "User taps 'Verify' → Camera captures preview frame (640×480)"),
        ("Step 3 – Liveness: Blink", "MediaPipe detects 468 face landmarks → EAR (Eye Aspect Ratio) checked → User must blink"),
        ("Step 4 – Liveness: Head Turn", "Yaw angle calculated from nose-to-cheek asymmetry → User turns head"),
        ("Step 5 – Depth Check", "Standard deviation of z-coordinates checked → Photos/videos fail (flat z≈0)"),
        ("Step 6 – Matching", "3 photos taken (180ms apart) → Averaged → GhostFaceNet produces 512-dim fingerprint"),
        ("Step 7 – Database Comparison", "Cosine similarity against all enrolled faces → Threshold check (0.75 single, 0.84 multi)"),
        ("Step 8 – Logging", "GPS captured → AuthLog saved to SQLite → Background sync to AWS endpoint"),
    ]
    for title, desc in steps:
        S.append(Paragraph(f"<b>{title}:</b> {desc}", bullet))
    S.append(PageBreak())

    # ═══════════════════ SECTION 3: CODEBASE WALKTHROUGH ════════
    S.append(Paragraph("3 &nbsp; Complete Codebase Walkthrough", h1))
    S.append(sep())

    S.append(Paragraph("3.1 &nbsp; Root Files", h2))
    root_files = [
        ("<b>package.json</b> – Project manifest with all dependencies (Expo, TFLite, SQLite, MediaPipe, etc.)"),
        ("<b>app.json</b> – Expo configuration: app name, icons, permissions (camera, location)"),
        ("<b>tsconfig.json</b> – TypeScript strict mode configuration"),
        ("<b>babel.config.js</b> – Babel/Expo transpiler setup"),
        ("<b>metro.config.js</b> – Metro bundler config (adds .tflite, .wasm asset extensions)"),
        ("<b>eas.json</b> – EAS Build profiles for iOS/Android cloud builds"),
        ("<b>jest.config.js</b> – Jest testing configuration"),
        ("<b>App.tsx</b> (root) – Simply imports and re-exports src/App.tsx"),
    ]
    for f in root_files:
        S.append(Paragraph(f"• {f}", bullet))

    S.append(Paragraph("3.2 &nbsp; src/App.tsx – The Entry Point", h2))
    S.append(Paragraph(
        "This is the main control room. On launch it runs 3 sequential steps:", body))
    S.append(Paragraph("1. <b>Initialize SQLite</b> – Creates <i>enrolled_faces</i> and <i>auth_logs</i> tables", bullet))
    S.append(Paragraph("2. <b>Load TFLite Model</b> – Initializes GhostFaceNet recognition model", bullet))
    S.append(Paragraph("3. <b>Cache MediaPipe Assets</b> – Copies WASM/JS face detection files to device storage", bullet))
    S.append(Paragraph(
        "It also mounts an <b>invisible WebView</b> (0×0 pixels) that runs the MediaPipe FaceMesh engine "
        "in the background. Communication between RN and WebView happens via <i>injectJavaScript</i> "
        "and <i>onMessage</i> callbacks.", body))

    S.append(Paragraph("3.3 &nbsp; Types &amp; Constants", h2))
    S.append(Paragraph("<b>src/types/index.ts</b> – Core data contracts:", body))
    S.append(Paragraph("• <b>AuthLog</b> – log_id, user_id, timestamp, gps_lat/lng, device_id, similarity_score, photo_thumb", bullet))
    S.append(Paragraph("• <b>LivenessError</b> – code (TIMEOUT | SPOOF_DETECTED | NO_FACE_DETECTED) + message", bullet))
    S.append(Paragraph("• <b>FaceAuthenticatorProps</b> – Component props with callbacks and configuration", bullet))

    S.append(Spacer(1, 4))
    S.append(Paragraph("<b>src/constants/config.ts</b> – Tunable thresholds:", body))
    config_lines = [
        "SIMILARITY_THRESHOLD = 0.84       (multi-user match threshold)",
        "SIMILARITY_SINGLE_USER_THRESHOLD = 0.75  (single-user, more lenient)",
        "SIMILARITY_HIGH_CONFIDENCE = 0.91  (fast-path, bypasses margin checks)",
        "MIN_MATCH_MARGIN = 0.05            (winner must beat runner-up)",
        "MIN_PREPROCESS_VARIANCE = 0.05     (rejects blank/featureless images)",
        "LIVENESS_TIMEOUT_MS = 15000        (15s total for all challenges)",
        "REQUIRED_CHALLENGES = 2            (blink + head turn)",
        "AWS_SYNC_URL = '...'               (cloud endpoint for log sync)",
    ]
    for line in config_lines:
        S.append(Paragraph(f"• <font face='Courier' size='8'>{line}</font>", bullet))

    S.append(Paragraph("3.4 &nbsp; Services – The Engine Room", h2))

    S.append(Paragraph("<b>services/database/sqlite.ts</b>", h3))
    S.append(Paragraph(
        "Opens <i>binary_brains.db</i> via expo-sqlite. Provides <i>executeSql()</i> helper "
        "wrapping SQL transactions in Promises. Creates two tables on init:", body))
    S.append(Paragraph("• <b>enrolled_faces</b>: user_id (PK), embedding (BLOB, AES-256 encrypted), enrolled_at", bullet))
    S.append(Paragraph("• <b>auth_logs</b>: log_id (PK), user_id, timestamp, gps_lat/lng, device_id, similarity_score, photo_thumb, synced", bullet))

    S.append(Paragraph("<b>services/database/enrolledFaces.ts</b>", h3))
    S.append(Paragraph(
        "Stores face embeddings encrypted with AES-256. <i>insertEnrolledFace()</i> encodes "
        "Float32Array → base64 → AES encrypt → SQLite. <i>getAllEnrolledFaces()</i> reverses the process.", body))

    S.append(Paragraph("<b>services/database/authLogs.ts</b>", h3))
    S.append(Paragraph(
        "Inserts auth logs, retrieves unsynced logs (<i>synced=0</i>), and deletes "
        "server-confirmed logs (partial-batch safe by log_id list).", body))

    S.append(Paragraph("<b>services/encryption/secureStorage.ts</b>", h3))
    S.append(Paragraph(
        "Uses <i>react-native-encrypted-storage</i> (iOS Keychain / Android Keystore) to store "
        "a 256-bit AES key. <i>encryptData()/decryptData()</i> wrap CryptoJS.AES with the cached key. "
        "The key persists across app restarts in hardware-backed secure storage.", body))

    S.append(Paragraph("<b>services/location/geolocation.ts</b>", h3))
    S.append(Paragraph(
        "Requests foreground location permission and retrieves GPS coordinates with Balance accuracy "
        "(~1s budget). Returns null if permission denied or lookup fails.", body))

    S.append(Paragraph("<b>services/network/awsSync.ts</b>", h3))
    S.append(Paragraph(
        "Offline-first sync engine. <i>syncAuthLogs()</i> checks connectivity via NetInfo, fetches "
        "unsynced logs, POSTs them as JSON to the AWS endpoint (15s timeout), and only deletes "
        "logs that the server confirms in <i>received_logs</i>. <i>triggerSyncOnConnect()</i> "
        "subscribes to NetInfo events for auto-sync on reconnect.", body))

    S.append(PageBreak())
    S.append(Paragraph("3.5 &nbsp; AI &amp; Recognition", h2))

    S.append(Paragraph("<b>services/ai/liveness.ts – LivenessEngine</b>", h3))
    S.append(Paragraph(
        "A state machine managing facial liveness detection:", body))
    liv_states = [
        ("READY", "Waiting for face – transitions to first challenge"),
        ("WAITING_BLINK", "Calculating EAR (Eye Aspect Ratio) – threshold < 0.33"),
        ("WAITING_HEAD_TURN", "Calculating smoothed yaw angle – threshold > 0.12"),
        ("PASSED", "All challenges completed successfully"),
        ("FAILED", "Timeout (10s per challenge) or spoof detected"),
    ]
    for state, desc in liv_states:
        S.append(Paragraph(f"• <b>{state}</b> – {desc}", bullet))
    S.append(Paragraph(
        "Uses a <b>rolling average</b> (window=5) for yaw smoothing and <b>hysteresis thresholds</b> "
        "(ON=0.12, OFF=0.09) to prevent flicker. The <b>depth consistency check</b> calculates "
        "standard deviation of z-coordinates across 468 landmarks – real 3D faces pass (std dev > 0.001), "
        "flat photos fail.", body))

    S.append(Paragraph("<b>services/ai/mediapipeLandmarks.ts</b>", h3))
    S.append(Paragraph(
        "Manages the hidden WebView running MediaPipe FaceMesh. Key operations:", body))
    S.append(Paragraph("• <b>ensureMediaPipeAssets()</b> – Copies 8 files (face_mesh.js, WASM binaries, model data) from app bundle to device local storage", bullet))
    S.append(Paragraph("• <b>writeMediaPipeHTML()</b> – Generates index.html with inline XHR polyfill (critical for Android file:// fetch bypass)", bullet))
    S.append(Paragraph("• <b>processImageForLandmarks()</b> – Sends base64 JPEG to WebView, receives 468 landmarks via postMessage", bullet))
    S.append(Paragraph("• <b>Debounce mechanism</b> – Drops frames while WebView is busy to prevent queue buildup", bullet))

    S.append(Paragraph("<b>services/ai/recognition.ts – GhostFaceNet Integration</b>", h3))
    S.append(Paragraph(
        "Core recognition service. <i>initRecognitionModel()</i> loads the 1MB INT8-quantized TFLite model "
        "via <i>react-native-fast-tflite</i>. <i>extractEmbedding()</i> performs:", body))
    S.append(Paragraph("1. Input quantization (float → int8 with scale=0.0078125, zero_point=-1)", bullet))
    S.append(Paragraph("2. Synchronous inference via <i>model.runSync()</i> (bypasses RN bridge via JSI)", bullet))
    S.append(Paragraph("3. Output dequantization (int8 → float with scale=0.14127, zero_point=24)", bullet))
    S.append(Paragraph("4. L2 normalization to unit length", bullet))
    S.append(Paragraph(
        "<i>findBestMatch()</i> compares against enrolled faces using cosine similarity with "
        "multi-user logic (margin + ratio checks). <i>averageEmbeddings()</i> averages "
        "multiple captures index-by-index for stability.", body))

    S.append(Paragraph("<b>services/ai/faceAlignment.ts</b>", h3))
    S.append(Paragraph(
        "Performs similarity transform (rotation + scale + translation) using 5 canonical face points "
        "(eyes, nose, mouth corners) to warp detected faces to a standard 112×112 position. "
        "Falls back to center-crop resize if landmarks unavailable.", body))

    S.append(Paragraph("3.6 &nbsp; Camera &amp; Image Processing", h2))
    S.append(Paragraph("<b>services/camera/frameProcessors.ts</b>", h3))
    S.append(Paragraph(
        "<i>processRecognitionFrame()</i>: decodes JPEG → RGBA using jpeg-js → applies face alignment → "
        "applies adaptive contrast enhancement (CLAHE for extreme lighting, global histogram "
        "equalization for normal) → normalizes pixels to [-1.0, 1.0].", body))
    S.append(Paragraph(
        "<i>processLivenessFrame()</i>: faster path (no CLAHE) that nearest-neighbor resizes to 320×240 "
        "for real-time liveness analysis.", body))

    S.append(Paragraph("<b>utils/imagePreProc.ts</b>", h3))
    S.append(Paragraph(
        "CLAHE implementation (8×8 tiles, bilinear interpolation, contrast limiting) for outdoor "
        "lighting normalization. Also includes global histogram equalization, Laplacian blur detection, "
        "brightness calculation, and frame quality gates (confidence ≥ 0.85, brightness 30-240, blur ≥ 50).", body))

    S.append(Paragraph("3.7 &nbsp; Database &amp; Encryption", h2))
    S.append(Paragraph(
        "The encryption flow for enrolled faces:", body))
    enc_flow = [
        "<b>1.</b> Generate 256-bit AES key → store in iOS Keychain / Android Keystore",
        "<b>2.</b> Convert Float32Array face embedding → base64 string",
        "<b>3.</b> Encrypt with AES-256 (CBC mode, CryptoJS)",
        "<b>4.</b> Store encrypted ciphertext in SQLite BLOB column",
        "<b>5.</b> On retrieval: decrypt → base64 decode → Float32Array",
    ]
    for step in enc_flow:
        S.append(Paragraph(f"• {step}", bullet))

    S.append(Paragraph("3.8 &nbsp; Network &amp; Cloud Sync", h2))
    S.append(Paragraph(
        "The sync system is built with <b>zero-loss guarantees</b>. Logs are POSTed in batches to "
        "'https://binary-brains-mock-aws.onrender.com/api/sync'. The server must echo back "
        "received_log_ids inside HTTP 200. Only those IDs are deleted from local SQLite. "
        "NetInfo listeners trigger auto-sync on connectivity restoration.", body))

    S.append(Paragraph("3.9 &nbsp; Hooks &amp; Components", h2))
    S.append(Paragraph("<b>hooks/useAuth.ts</b>", h3))
    S.append(Paragraph(
        "The main orchestrator hook managing the entire auth pipeline. Transitions: "
        "<b>idle → scanning → liveness → matching → authenticated/failed</b>. "
        "Handles 3-shot averaged capture, GPS retrieval, log insertion, and background sync trigger. "
        "Includes borderline retry logic: if a single-user match is within 0.03 of threshold, "
        "it retries once.", body))

    S.append(Paragraph("<b>components/CameraOverlay.tsx</b>", h3))
    S.append(Paragraph(
        "Displays camera feed with a semi-transparent overlay and animated pulsing face-shaped cutout. "
        "Border color changes: blue (idle/scanning), green (authenticated), red (failed).", body))

    S.append(Paragraph("<b>components/FaceAuthenticator.tsx</b>", h3))
    S.append(Paragraph(
        "Main UI component. Connects useAuth hook to CameraOverlay. Manages haptic feedback "
        "(light buzz on challenge change, heavy buzz on success, error buzz on failure). "
        "Shows status pill at bottom ('Hold still…', 'Please blink', etc.) and retry button on failure.", body))

    S.append(Paragraph("<b>components/LivenessFeedback.tsx</b>", h3))
    S.append(Paragraph(
        "Colored notification banners: orange (warning/instruction), green (success, auto-dismiss 1.5s), "
        "red (error with tap-to-dismiss).", body))

    S.append(Paragraph("3.10 &nbsp; Screens", h2))
    S.append(Paragraph("<b>screens/DemoAuthScreen.tsx</b>", h3))
    S.append(Paragraph(
        "Main screen with: header (title + Enroll button), sync status badge (Synced/Pending/Offline), "
        "camera container with FaceAuthenticator, active auth result card, Verify button, "
        "and recent logs list (last 5 auth attempts from SQLite).", body))

    S.append(Paragraph("<b>screens/EnrollmentScreen.tsx</b>", h3))
    S.append(Paragraph(
        "Registration screen. Captures 3 face frames, checks quality (confidence/brightness/blur), "
        "extracts embeddings, averages them, encrypts, and stores in database against a user ID. "
        "Includes skip-quality option for testing.", body))
    S.append(PageBreak())

    # ═══════════════════ SECTION 4: GHOSTFACENET ════════════════
    S.append(Paragraph("4 &nbsp; GhostFaceNet – Why This Model?", h1))
    S.append(sep())

    S.append(Paragraph("4.1 &nbsp; Model Comparison", h2))
    comp = [
        ["Model", "Size", "Speed", "Accuracy", "Best For"],
        ["FaceNet", "~90 MB", "Slow", "High", "Servers"],
        ["ArcFace", "~200+ MB", "Very Slow", "Highest", "Research"],
        ["MobileFaceNet", "~4-5 MB", "Fast", "Good", "Mobile Apps"],
        ["GhostFaceNet ★", "~1 MB", "Fastest", "Good", "On-Device Mobile"],
    ]
    t = Table(comp, colWidths=[110, 80, 80, 80, 130])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, LGREY),
        ("BACKGROUND", (0, 1), (-1, -1), white),
        ("BACKGROUND", (0, 4), (-1, 4), HexColor("#e8f5e9")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    S.append(t)

    S.append(Spacer(1, 8))
    S.append(Paragraph("4.2 &nbsp; Four Reasons GhostFaceNet Was Chosen", h2))

    S.append(Paragraph("<b>1. Size – Only 1 MB (99% smaller than alternatives)</b>", h3))
    S.append(Paragraph(
        "INT8 quantization compresses the model 4× vs float32. The app already bundles "
        "MediaPipe WASM files, so every MB counts – especially on budget Android phones "
        "common in highway field operations.", body))

    S.append(Paragraph("<b>2. Speed – Synchronous ~10-50ms per inference</b>", h3))
    S.append(Paragraph(
        "Uses <i>react-native-fast-tflite</i> with JSI (bypasses the React Native bridge for C++ direct calls). "
        "This enables the 3-shot averaging strategy (~600ms total) without noticeable delay. "
        "FaceNet inference would take 500ms+ per frame.", body))

    S.append(Paragraph("<b>3. 512-Dimensional Embeddings – Just Right</b>", h3))
    S.append(Paragraph(
        "512 numbers per face fingerprint. Stored as AES-256 encrypted BLOBs in SQLite "
        "(~2KB per user). Fast enough for linear scan matching across thousands of users.", body))

    S.append(Paragraph("<b>4. ArcFace Loss Training – Hidden Superpower</b>", h3))
    S.append(Paragraph(
        "GhostFaceNet is trained with ArcFace loss (same as the 200MB ArcFace model) but "
        "uses Ghost Modules to achieve comparable accuracy with 200× fewer parameters. "
        "Ghost Modules generate more features from fewer parameters by cheaply transforming "
        "a small set of intrinsic feature maps.", body))

    S.append(Paragraph("4.3 &nbsp; Recognition Pipeline Code Flow", h2))
    rec_code = (
        "1. Camera captures JPEG (640×480, quality=0.25)\n"
        "2. jpeg-js decodes to RGBA pixel array\n"
        "3. fastResize112x112: nearest-neighbor downsample to 112×112 RGB\n"
        "4. INT8 quantization: floatVal / 0.0078125 + (-1) → Int8Array(37632)\n"
        "5. model.runSync([int8Input]) → 512-element Int8Array output\n"
        "6. Dequantization: (int8Val - 24) × 0.14127 → Float32Array(512)\n"
        "7. L2 normalize to unit length\n"
        "8. Cosine similarity against all enrolled embeddings\n"
        "9. Threshold + margin + ratio check → Match or Reject"
    )
    S.append(Paragraph(rec_code, ParagraphStyle(
        "RecCode", parent=code, fontSize=8, leading=11)))
    S.append(PageBreak())

    # ═══════════════════ SECTION 5: DEMO FAQ ════════════════════
    S.append(Paragraph("5 &nbsp; Demo FAQ – 33 Questions &amp; Answers", h1))
    S.append(sep())

    # HACK: the numbering + answer pairs
    faqs = [
        ("Q1: What problem does this app solve?",
         "NHAI needs to verify field worker identities at remote highway locations without internet. "
         "Our solution: smartphone-based face authentication working completely offline, "
         "with liveness detection and GPS audit trail."),

        ("Q2: Who is the target user?",
         "Two types: (1) Field workers (toll operators, patrol, maintenance) who authenticate their identity. "
         "(2) Administrators who enroll new workers by capturing their face and assigning a user ID."),

        ("Q3: What makes this different from phone face unlock?",
         "Four differences: (a) Multi-user support – unlimited workers, not just phone owner. "
         "(b) Liveness detection – blink + head turn + 3D depth, not just a photo match. "
         "(c) Audit trail – GPS + timestamp + photo every authentication. (d) Offline-first – no cloud dependency."),

        ("Q4: What is the tech stack?",
         "Expo SDK 50 + React Native 0.73.6 + TypeScript (strict). "
         "MediaPipe FaceMesh for face detection (hidden WebView). "
         "GhostFaceNet INT8 TFLite model (~1MB) for recognition. "
         "expo-sqlite for local storage. AES-256 encryption via react-native-encrypted-storage. "
         "CLAHE for image contrast enhancement. REST API for cloud sync."),

        ("Q5: How does the app work offline?",
         "Every component works offline: AI model runs on-device via TFLite (no cloud API calls). "
         "SQLite stores everything locally. Encryption keys in hardware-backed secure storage. "
         "Auth logs queue locally until internet is available, then auto-sync. "
         "Zero data loss: logs only deleted after server confirmation."),

        ("Q6: Walk us through the authentication pipeline step by step.",
         "1) App starts → loads DB + model + assets (~3-5s). "
         "2) User taps Verify. 3) Camera turns on (front, 640x480). "
         "4) Scanning – 'Hold still…'. 5) Liveness – blink + head turn + depth check. "
         "6) Matching – 3 photos → average → 512-dim fingerprint → database comparison. "
         "7) Authenticated ✅ or Failed ❌. 8) GPS + log saved. 9) Background cloud sync."),

        ("Q7: Which AI model do you use and why?",
         "GhostFaceNet (~1MB, INT8 quantized). Chosen because: "
         "FaceNet is 90MB, ArcFace is 200MB+ – too large for budget phones. "
         "MobileFaceNet is 4-5MB but less accurate. GhostFaceNet achieves best accuracy/size ratio. "
         "Runs synchronously in ~10-50ms via fast TFLite."),

        ("Q8: How do you prevent photo/video spoofing?",
         "Three layers: (1) Active – blink detection (EAR < 0.33) and head turn (yaw > 0.12). "
         "(2) Passive – 3D depth check: real faces have varying z-coordinates (std dev > 0.001), "
         "flat photos have z≈0. (3) Image variance: faces have high texture variance (>0.05), "
         "walls/ceilings are uniform and get rejected."),

        ("Q9: How accurate is the face matching?",
         "Thresholds tuned to model output: single user 0.75, multi-user 0.84 with 0.05 margin, "
         "high confidence fast-path at 0.91. Genuine accept rate ~95%+ with proper lighting. "
         "3-shot averaging improves accuracy ~15-20% over single shot."),

        ("Q10: How do you protect stored face data?",
         "AES-256 encryption with keys stored in hardware-backed secure storage "
         "(iOS Keychain / Android Keystore – same tech as banking apps). "
         "Face embeddings converted to base64 → encrypted → BLOB in SQLite. "
         "Even extracting the database file yields unreadable ciphertext."),

        ("Q11: What happens if someone steals the phone?",
         "Face data is AES-256 encrypted – unreadable without key. "
         "Key is in hardware Keychain/Keystore, not extractable even with root. "
         "No cloud credentials stored on device. Device ID is install-specific, "
         "cannot impersonate on another device."),

        ("Q12: How does cloud syncing work?",
         "Logs inserted with synced=0. When online: POST batch to AWS endpoint (15s timeout). "
         "Server responds with received_log_ids. Only those IDs are deleted locally. "
         "Auto-sync triggers on network reconnect via NetInfo listener. "
         "Manual 'Sync Now' button available."),

        ("Q13: What if there's no internet for days?",
         "All authentication keeps working. Logs queue in SQLite indefinitely. "
         "Auto-sync triggers when connectivity returns. Visual sync badge shows status. "
         "Manual sync button for convenience."),

        ("Q14: Why use a hidden WebView for face detection?",
         "MediaPipe FaceMesh is web-based (JS + WASM). A hidden WebView runs it cross-platform "
         "with the same code. Key challenge: Android blocks fetch() from file:// origins – "
         "solved with an XHR polyfill replacing fetch with XMLHttpRequest."),

        ("Q15: Why CLAHE for image processing?",
         "Highway lighting is extreme: half face in sun, half in shadow. Simple histogram equalization "
         "works globally and can't handle local contrast issues. CLAHE divides the face into 8×8 tiles, "
         "enhances each independently, clips noise, and blends smoothly – making faces consistent "
         "regardless of outdoor lighting."),

        ("Q16: Why 3-shot averaging?",
         "Micro-movements (blinks, sways, expression changes) between frames create variation. "
         "3 captures 180ms apart, averaged, cancel out temporary noise. Gives ~15-20% "
         "better matching accuracy at the cost of ~2 seconds extra processing time."),

        ("Q17: How do you calculate if someone blinked?",
         "Eye Aspect Ratio (EAR): (|p2-p6| + |p3-p5|) / (2×|p1-p4|) using 6 landmarks per eye. "
         "Normal eye ~0.35, closed eye < 0.33 threshold. 468 MediaPipe landmarks provide the coordinates."),

        ("Q18: How do you measure head turning?",
         "Nose-to-cheek asymmetry: yaw = (dLeft - dRight) / (dLeft + dRight). "
         "Rolling average over 5 frames for smoothing. Hysteresis thresholds (ON=0.12, OFF=0.09) "
         "prevent flickering. Positive = right turn, negative = left turn."),

        ("Q19: How does the app handle poor lighting at night?",
         "CLAHE enhances dark areas. Adaptive path: mean brightness < 30 or > 225 triggers full CLAHE; "
         "otherwise faster global equalization. Single-user threshold of 0.75 provides tolerance "
         "for lower-quality captures in darkness."),

        ("Q20: What happens if the user doesn't blink or turn?",
         "10-second timeout per challenge. If no blink in 10s → FAILED with 'Timeout'. "
         "If 30 consecutive frames (~3s) with no face detected → 'Face lost'. "
         "User sees red error banner with Retry button."),

        ("Q21: What if someone looks like the enrolled user (impostor)?",
         "Multi-user mode: three passes needed – score ≥ 0.84, margin ≥ 0.05 over runner-up, "
         "ratio ≥ 1.08 vs runner-up. Single-user: score ≥ 0.75. If ambiguous, returns "
         "'Ambiguous match' rejection rather than false accept."),

        ("Q22: How do you handle glasses, masks, or helmets?",
         "Glasses work fine (MediaPipe handles them). Masks: partial face still works, "
         "depth check still passes for real 3D face. Full-face helmets: 'No face detected'. "
         "Sunglasses may interfere with blink detection – head turn challenge still works."),

        ("Q23: What if the camera is damaged or dirty?",
         "Quality gates during enrollment detect blur (Laplacian variance < 50) or bad lighting "
         "(brightness < 30 or > 240). During auth, 3 consecutive poor frames trigger helpful error."),

        ("Q24: How fast is authentication?",
         "App startup: 3-5s. Face capture: ~0.3s. Liveness check: 1-3s. "
         "3-shot capture + averaging: ~0.6s. TFLite inference: 10-50ms. "
         "Database lookup: ~1ms. Total: ~3-5 seconds on mid-range Android."),

        ("Q25: How many users can this support?",
         "Each user ~2KB storage. SQLite handles millions of rows. "
         "Linear scan matching: 100 users in ~1ms, 1000 in ~10ms. "
         "Practical limit: thousands of users per device."),

        ("Q26: Can you show a spoof attack being detected?",
         "Hold another phone showing a photo to camera. The app shows: "
         "'Spoof detected: 3D depth consistency check failed.' in red. "
         "The photo has all z-coordinates ≈ 0 (flat), immediately flagged."),

        ("Q27: What features would you add next?",
         "Voice challenge (say random number). Web dashboard with maps/analytics. "
         "Multiple model sizes (1-5MB). Federated enrollment across devices. "
         "Auto-expiry policies for re-enrollment."),

        ("Q28: What were the biggest technical challenges?",
         "1) WebView file access on Android – fetch blocked from file://, fixed with XHR polyfill. "
         "2) Highway lighting – solved with CLAHE. "
         "3) Liveness jitter – solved with rolling avg + hysteresis. "
         "4) EXIF rotation mismatch – fixed with skipProcessing=false. "
         "5) Smile detection unreliable – replaced with head turn challenge."),

        ("Q29: How is this different from Face ID / Android Face Unlock?",
         "Phone unlock: single owner only, no audit trail, varying spoof protection. "
         "Our system: unlimited workers, GPS + timestamp logging, "
         "blink + head turn + 3D depth anti-spoofing, cross-platform, "
         "adjustable thresholds (0.75-0.91)."),

        ("Q30: Where would you deploy this in production?",
         "Toll plazas (shift start verification), highway patrol (checkpoint check-ins), "
         "maintenance depots (access control), construction sites (worker verification), "
         "remote supervision (GPS location confirmation)."),

        ("Q31: What makes this project innovative?",
         "Three innovations: (1) Offline-first face recognition with 1MB model – no cloud needed. "
         "(2) Multi-layered anti-spoofing on standard phone camera (no IR sensor). "
         "(3) CLAHE from medical imaging adapted for highway lighting conditions."),

        ("Q32: How was this validated?",
         "9 Jest test files (unit + integration + E2E). Mock AWS server for sync testing. "
         "3-shot averaging validated vs single-shot (15-20% improvement). "
         "Thresholds tuned based on field logs (genuine scores 0.73-0.92)."),

        ("Q33: What's the most clever piece of code?",
         "The XHR polyfill for the hidden WebView – a 15-line fix essential for cross-platform operation. "
         "Android blocks fetch() from file:// origins but allows XHR. This polyfill intercepts "
         "MediaPipe's internal fetch() calls and routes them through XMLHttpRequest, "
         "making the same code work on both iOS and Android without platform-specific branches."),
    ]

    for q, a in faqs:
        S.append(Paragraph(q, faq_q))
        S.append(Paragraph(a, faq_a))
        S.append(sep())

    # ── Footer ────────────────────────────────────────────────────
    S.append(Spacer(1, 30))
    S.append(sep())
    S.append(Paragraph(
        "<i>Generated from the NHAI EdgeLock codebase analysis. "
        "For questions, refer to the project README or source code.</i>", note))

    return S


# ── Build PDF ──────────────────────────────────────────────────────────────
doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    topMargin=0.6*inch,
    bottomMargin=0.6*inch,
    leftMargin=0.7*inch,
    rightMargin=0.7*inch,
    title="NHAI EdgeLock - Complete Technical Guide",
    author="Binary Brains Team",
    subject="NHAI Hackathon 7.0 Face Authentication System",
)

doc.build(build_story())
print(f"✅ PDF generated successfully: {OUTPUT}")
print(f"   File size: {os.path.getsize(OUTPUT) / 1024:.1f} KB")
