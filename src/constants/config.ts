/** Multi-user minimum best score (live genuine ~0.84–0.89). */
export const SIMILARITY_THRESHOLD = 0.84;

/** Single-user match floor (center-crop path; genuine ~0.83–0.92, ceiling &lt;0.80). */
// HACKATHON: liveness is enabled (blink + head turn + depth), so we can accept lower
// similarity to reduce false rejects on real users. In current field logs, genuine
// can dip to ~0.73–0.79 depending on lighting/pose.
export const SIMILARITY_SINGLE_USER_THRESHOLD = 0.75;

/** High-confidence fast path (any enrollment count). */
export const SIMILARITY_HIGH_CONFIDENCE = 0.91;

/** 2+ users: best must beat runner-up (blocks tied 0.83 vs 0.83). */
export const MIN_MATCH_MARGIN = 0.05;

/** 2+ users: best/second ratio when best &lt; 0.91 (blocks impostor ~1.076). */
export const MIN_MATCH_RATIO = 1.08;

/** Borderline band that triggers one extra retry capture. */
export const BORDERLINE_RETRY_BAND = 0.03;

export const THRESHOLD_RANGE = {
  permissive: 0.85,
  strict: 0.91,
};

/** Reject walls/ceilings (your ceiling runs ~0.015; faces ~0.18+). */
export const MIN_PREPROCESS_VARIANCE = 0.05;

export const LIVENESS_TIMEOUT_MS = 15000;

export const REQUIRED_CHALLENGES = 2;

export const AWS_SYNC_URL = process.env.EXPO_PUBLIC_AWS_SYNC_URL || 'https://binary-brains-mock-aws.onrender.com/api/sync';

// HACKATHON: flip to false before production deploy
export const DEMO_MODE = true;

// AsyncStorage key for persisting last successful sync timestamp
export const LAST_SYNC_STORAGE_KEY = '@nhai_last_sync_ts';

export const MODEL_PATHS = {
  mobilefacenet: 'assets/models/ghostfacenet_fixed_int8.tflite',
};
