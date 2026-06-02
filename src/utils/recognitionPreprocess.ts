import { fastPreprocessFromBase64WithStats, type PreprocessStats } from './imagePreProc';
import { MIN_PREPROCESS_VARIANCE } from '../constants/config';
import type { Landmark } from '../services/ai/liveness';

export const RECOGNITION_INPUT_SIZE = 112;

/**
 * skipProcessing: false — applies EXIF rotation so jpeg-js pixels match WebView landmarks.
 */
export const RECOGNITION_CAPTURE_OPTIONS = {
  base64: true as const,
  quality: 0.25,
  skipProcessing: false,
};

export class LowQualityFrameError extends Error {
  readonly variance: number;

  constructor(variance: number) {
    super(`No face detected — flat scene (variance ${variance.toFixed(4)}).`);
    this.name = 'LowQualityFrameError';
    this.variance = variance;
  }
}

export class NoFaceDetectedError extends Error {
  constructor() {
    super('No face detected. Center your face in the frame.');
    this.name = 'NoFaceDetectedError';
  }
}

const IS_TEST =
  typeof (global as { jest?: unknown }).jest !== 'undefined' || process.env.NODE_ENV === 'test';

function applyVarianceGate(stats: PreprocessStats): PreprocessStats {
  if (stats.variance < MIN_PREPROCESS_VARIANCE) {
    throw new LowQualityFrameError(stats.variance);
  }
  return stats;
}

/** Center-crop 112×112 — same path for enroll + auth (consistent embeddings). */
export function preprocessRecognitionBase64(base64Str: string): PreprocessStats {
  if (!base64Str || base64Str.length < 64) {
    throw new Error('Invalid or empty camera base64');
  }
  return applyVarianceGate(fastPreprocessFromBase64WithStats(base64Str));
}

async function requireLandmarks(
  base64Str: string
): Promise<Landmark[] | null> {
  if (IS_TEST) {
    return null;
  }
  const { processImageForLandmarks } = await import('../services/ai/mediapipeLandmarks');
  const result = await processImageForLandmarks(base64Str);
  if (!result?.landmarks || result.landmarks.length < 468) {
    throw new NoFaceDetectedError();
  }
  return result.landmarks;
}

/** Face must be present (MediaPipe); preprocess uses center crop for stable scores. */
export async function preprocessRecognitionWithFaceGate(base64Str: string): Promise<PreprocessStats> {
  await requireLandmarks(base64Str);
  return preprocessRecognitionBase64(base64Str);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function captureRecognitionBase64(cameraRef: {
  takePictureAsync?: (opts: object) => Promise<{ uri?: string; base64?: string }>;
}): Promise<string> {
  if (!cameraRef?.takePictureAsync) {
    return 'mock_base64_encoded_jpeg_capture_0';
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const picture = await cameraRef.takePictureAsync(RECOGNITION_CAPTURE_OPTIONS);
      if (picture?.base64 && picture.base64.length > 64) {
        return picture.base64;
      }
      lastError = new Error('Camera returned no base64 JPEG');
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Camera is not running') && attempt < 3) {
        await sleep(400);
        continue;
      }
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function captureAndPreprocessRecognition(cameraRef: {
  takePictureAsync?: (opts: object) => Promise<{ uri?: string; base64?: string }>;
}): Promise<PreprocessStats> {
  const base64 = await captureRecognitionBase64(cameraRef);
  return preprocessRecognitionWithFaceGate(base64);
}

/** @deprecated Use preprocessRecognitionWithFaceGate — aligned path broke scores when EXIF mismatched. */
export async function preprocessRecognitionAligned(
  base64Str: string,
  _landmarks: Landmark[] | null | undefined
): Promise<PreprocessStats> {
  return preprocessRecognitionWithFaceGate(base64Str);
}
