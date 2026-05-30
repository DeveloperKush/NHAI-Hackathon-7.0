/** Genuine match; ceiling/spoof samples in testing scored ~0.88 vs face ~0.92. */
export const SIMILARITY_THRESHOLD = 0.91;

export const THRESHOLD_RANGE = {
  permissive: 0.88,
  strict: 0.93,
};

/** Reject blank walls/ceilings before embedding (face ~0.19, ceiling ~0.03). */
export const MIN_PREPROCESS_VARIANCE = 0.06;

export const LIVENESS_TIMEOUT_MS = 15000;

export const REQUIRED_CHALLENGES = 1;

export const AWS_SYNC_URL = process.env.EXPO_PUBLIC_AWS_SYNC_URL;

export const MODEL_PATHS = {
  mobilefacenet: 'assets/models/ghostfacenet_fixed_int8.tflite',
};
