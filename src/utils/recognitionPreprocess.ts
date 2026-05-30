import { fastPreprocessFromBase64WithStats, type PreprocessStats } from './imagePreProc';
import { MIN_PREPROCESS_VARIANCE } from '../constants/config';

export const RECOGNITION_INPUT_SIZE = 112;

/** Low quality + small pictureSize on Camera keeps jpeg-js decode under ~2s (no native resize). */
export const RECOGNITION_CAPTURE_OPTIONS = {
  base64: true as const,
  quality: 0.1,
  skipProcessing: true,
};

export class LowQualityFrameError extends Error {
  readonly variance: number;

  constructor(variance: number) {
    super(`Frame rejected: insufficient detail (variance ${variance.toFixed(4)}).`);
    this.name = 'LowQualityFrameError';
    this.variance = variance;
  }
}

export function preprocessRecognitionBase64(base64Str: string): PreprocessStats {
  if (!base64Str || base64Str.length < 64) {
    throw new Error('Invalid or empty camera base64');
  }
  const stats = fastPreprocessFromBase64WithStats(base64Str);
  if (stats.variance < MIN_PREPROCESS_VARIANCE) {
    throw new LowQualityFrameError(stats.variance);
  }
  return stats;
}

const IS_TEST =
  typeof (global as { jest?: unknown }).jest !== 'undefined' || process.env.NODE_ENV === 'test';

/**
 * Capture a small JPEG as base64 for recognition (no expo-image-manipulator — not in dev client).
 */
export async function captureRecognitionBase64(cameraRef: {
  takePictureAsync?: (opts: object) => Promise<{ uri?: string; base64?: string }>;
}): Promise<string> {
  if (!cameraRef?.takePictureAsync) {
    return 'mock_base64_encoded_jpeg_capture_0';
  }

  const picture = await cameraRef.takePictureAsync(RECOGNITION_CAPTURE_OPTIONS);

  if (picture?.base64 && picture.base64.length > 64) {
    return picture.base64;
  }

  throw new Error('Camera returned no base64 JPEG (enable base64 on takePictureAsync)');
}
