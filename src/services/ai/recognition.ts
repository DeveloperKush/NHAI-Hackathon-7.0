import type { TensorflowModel } from 'react-native-fast-tflite';
import Constants from 'expo-constants';
import { cosineSimilarity, l2Normalize } from '../../utils/math';
import { SIMILARITY_THRESHOLD } from '../../constants/config';

let model: TensorflowModel | null = null;
let initError: Error | null = null;
let isInitializing = false;

const IS_TEST = typeof (global as any).jest !== 'undefined' || process.env.NODE_ENV === 'test';

// Dynamically require react-native-fast-tflite in non-test environments to avoid Jest failures.
let nativeLoadTensorflowModel: any = null;
if (!IS_TEST) {
  try {
    nativeLoadTensorflowModel = require('react-native-fast-tflite').loadTensorflowModel;
  } catch (err) {
    console.error('Failed to load react-native-fast-tflite native module:', err);
  }
}

/**
 * Initializes the TFLite model. Should be called at startup.
 */
export async function initRecognitionModel(): Promise<void> {
  if (model) return;
  if (isInitializing) return;
  isInitializing = true;
  initError = null;
  console.log('Initializing TFLite face recognition model...');
  try {
    if (IS_TEST) {
      console.log('Mock model initialization in test environment.');
      return;
    }
    if (!nativeLoadTensorflowModel) {
      throw new Error('react-native-fast-tflite is not available.');
    }
    const modelSource = require('../../../assets/models/ghostfacenet_fixed_int8.tflite');
    console.log('Model asset ID resolved to:', modelSource);
    model = await nativeLoadTensorflowModel(modelSource, []);
    console.log('TFLite face recognition model initialized successfully!');
  } catch (err: any) {
    console.error('Failed to load TFLite model:', err);
    initError = err instanceof Error ? err : new Error(String(err));
    model = null;
    throw initError;
  } finally {
    isInitializing = false;
  }
}

/**
 * Returns the status of the model loader.
 */
export function getModelStatus(): { loaded: boolean; error: string | null } {
  return {
    loaded: model !== null,
    error: initError ? initError.message : null,
  };
}

/**
 * Extracts a 512-dimensional embedding using the real TFLite GhostFaceNet model.
 */
export function extractEmbedding(imageData: Float32Array): Float32Array {
  // Support both 112*112 (grayscale from processCameraFrame) and 112*112*3 (RGB expected by model)
  let rgbData: Float32Array;
  if (imageData.length === 112 * 112) {
    rgbData = new Float32Array(112 * 112 * 3);
    for (let i = 0; i < 112 * 112; i++) {
      const val = imageData[i];
      rgbData[i * 3] = val;
      rgbData[i * 3 + 1] = val;
      rgbData[i * 3 + 2] = val;
    }
  } else if (imageData.length === 112 * 112 * 3) {
    rgbData = imageData;
  } else {
    throw new Error(`Invalid input shape: expected 12544 or 37632, got ${imageData.length}`);
  }

  // Mock implementation for Jest testing environment (no native C++ runtime available)
  if (IS_TEST) {
    const size = 512;
    const target = new Float32Array(size);
    let sum = 0;
    for (let i = 0; i < rgbData.length; i++) {
      sum += rgbData[i] || 0;
    }
    const mean = sum / rgbData.length;
    for (let i = 0; i < size; i++) {
      target[i] = Math.sin(mean * (i + 1));
    }
    return l2Normalize(target);
  }

  // Ensure model is initialized
  if (!model) {
    if (initError) {
      throw new Error(`AI model unavailable. Please restart app. (Load error: ${initError.message})`);
    } else {
      throw new Error('AI model unavailable. Please restart app.');
    }
  }

  // Quantization parameters (INT8 input)
  // Input: scale = 0.0078125 (1/128), zero_point = -1
  const inputScale = 0.0078125;
  const inputZeroPoint = -1;
  const int8Input = new Int8Array(37632);

  for (let i = 0; i < rgbData.length; i++) {
    const floatVal = rgbData[i];
    // Quantize: int8_val = float_val / scale + zero_point
    let int8Val = Math.round(floatVal / inputScale) + inputZeroPoint;

    // Document the input clipping edge case:
    // Float -1.0 divided by 0.0078125 is -128. With zero_point = -1, this results in -129.
    // Since -129 is outside the signed 8-bit integer range [-128, 127], we clip/clamp it
    // to -128, which introduces an acceptable minor quantization error.
    if (int8Val < -128) int8Val = -128;
    if (int8Val > 127) int8Val = 127;

    int8Input[i] = int8Val;
  }

  // Synchronous Inference (using model.runSync to preserve the sync contract)
  let outputs: any[];
  try {
    const startTime = Date.now();
    outputs = model.runSync([int8Input]);
    const duration = Date.now() - startTime;
    console.log(`GhostFaceNet INT8 Inference completed in ${duration}ms`);
  } catch (err: any) {
    console.error('TFLite model inference failed:', err);
    throw new Error(`Face encoding failed. Please retry. (Inference error: ${err?.message || err})`);
  }

  if (!outputs || outputs.length === 0) {
    throw new Error('Face encoding failed. Please retry. (Empty output buffers)');
  }

  // Output Dequantization (INT8 output)
  // Output: scale = 0.1412736475467682, zero_point = 24
  const outputInt8 = outputs[0] instanceof Int8Array ? outputs[0] : new Int8Array(outputs[0].buffer || outputs[0]);
  if (outputInt8.length !== 512) {
    throw new Error(`Face encoding failed. Please retry. (Expected output length 512, got ${outputInt8.length})`);
  }

  const outputScale = 0.1412736475467682;
  const outputZeroPoint = 24;
  const outputFloat = new Float32Array(512);

  for (let i = 0; i < 512; i++) {
    // float_val = (int8_val - zero_point) * scale
    outputFloat[i] = (outputInt8[i] - outputZeroPoint) * outputScale;
  }

  // Normalize final embedding to unit L2 norm
  return l2Normalize(outputFloat);
}

/**
 * Compares query embedding against enrolled faces and returns the best match
 * if its similarity score exceeds the threshold.
 */
export function findBestMatch(
  embedding: Float32Array,
  enrolledFaces: { user_id: string; embedding: Float32Array }[]
): { user_id: string | null; score: number } {
  if (!enrolledFaces || enrolledFaces.length === 0) {
    return { user_id: null, score: 0 };
  }

  let maxScore = -1;
  let bestUserId: string | null = null;
  const threshold = SIMILARITY_THRESHOLD;

  for (const face of enrolledFaces) {
    const score = cosineSimilarity(embedding, face.embedding);
    console.log(`Checking match for user_id: ${face.user_id}, score: ${score}, current max: ${maxScore}`);
    if (score > maxScore) {
      maxScore = score;
      bestUserId = face.user_id;
    }
  }

  if (maxScore > threshold) {
    return { user_id: bestUserId, score: maxScore };
  }

  // Return best raw score even when below threshold (debug + failed-auth UI)
  return { user_id: null, score: maxScore < 0 ? 0 : maxScore };
}

/**
 * Averages an array of embeddings index-by-index and L2-normalizes the result.
 */
export function averageEmbeddings(embeddings: Float32Array[]): Float32Array {
  if (!embeddings || embeddings.length === 0) {
    return new Float32Array(512);
  }
  const sum = new Float32Array(512);
  for (const emb of embeddings) {
    if (emb.length !== 512) {
      throw new Error(`Invalid embedding shape for averaging: expected 512, got ${emb.length}`);
    }
    for (let i = 0; i < 512; i++) {
      sum[i] += emb[i];
    }
  }
  for (let i = 0; i < 512; i++) {
    sum[i] /= embeddings.length;
  }
  return l2Normalize(sum);
}

// Memory cache for stable device ID fallback when Constants.installationId is unavailable
let cachedDeviceId: string | null = null;

/**
 * Generates a stable device ID using expo-constants or a stable UUID fallback.
 */
export function generateDeviceId(): string {
  if (Constants && Constants.installationId) {
    return Constants.installationId;
  }

  if (cachedDeviceId) {
    return cachedDeviceId;
  }

  cachedDeviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

  return cachedDeviceId;
}
