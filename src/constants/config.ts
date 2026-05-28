export const SIMILARITY_THRESHOLD = 0.6;

export const THRESHOLD_RANGE = {
  permissive: 0.55,
  strict: 0.65,
};

export const LIVENESS_TIMEOUT_MS = 15000;

export const REQUIRED_CHALLENGES = 1;

export const AWS_SYNC_URL = process.env.EXPO_PUBLIC_AWS_SYNC_URL;

export const MODEL_PATHS = {
  mobilefacenet: 'assets/models/ghostfacenet_fixed_int8.tflite',
};
