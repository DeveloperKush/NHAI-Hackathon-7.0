import {
  applyCLAHE,
  globalHistogramEqualization,
  normalizePixels,
  cropTo112x112,
  globalHistogramEqualizationRGB,
  calculateBrightness,
  calculateLaplacianVariance,
  checkFrameQuality,
} from '../src/utils/imagePreProc';
import { alignFace, centerCropResize } from '../src/services/ai/faceAlignment';
import { cosineSimilarity, l2Normalize } from '../src/utils/math';

describe('Image Preprocessing and Math Utility Tests', () => {
  
  test('CLAHE on synthetic 112x112 gradient -> assert output contrast increased', async () => {
    const width = 112;
    const height = 112;
    const original = new Uint8Array(width * height);
    
    // Generate a low-contrast synthetic gradient centered around 128 (ranges 120-135)
    for (let i = 0; i < original.length; i++) {
      original[i] = 120 + Math.floor((i / original.length) * 16);
    }

    // Helper to calculate standard deviation
    const calcStdDev = (arr: Uint8Array): number => {
      const n = arr.length;
      const mean = arr.reduce((s, x) => s + x, 0) / n;
      const variance = arr.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / n;
      return Math.sqrt(variance);
    };

    const stdDevBefore = calcStdDev(original);

    // Apply CLAHE
    const equalized = await applyCLAHE(original, width, height);

    const stdDevAfter = calcStdDev(equalized);

    // Standard deviation (contrast representation) should be higher after CLAHE
    expect(stdDevAfter).toBeGreaterThan(stdDevBefore);
    expect(equalized.length).toBe(original.length);
  });

  test('globalHistogramEqualization maps pixels to full range', () => {
    const original = Uint8Array.of(100, 100, 100, 110, 120, 120);
    const equalized = globalHistogramEqualization(original);
    
    expect(equalized.length).toBe(original.length);
    // Standard histogram equalization should stretch values
    expect(Math.min(...equalized)).toBe(0);
    expect(Math.max(...equalized)).toBe(255);
  });

  test('normalizePixels [0, 127.5, 255] -> [-1, ~0, 1] using closest Uint8 values', async () => {
    const pixels = Uint8Array.of(0, 127, 255);
    const normalized = await normalizePixels(pixels);

    expect(normalized).toBeInstanceOf(Float32Array);
    expect(normalized).toHaveLength(3);
    expect(normalized[0]).toBe(-1.0);
    expect(normalized[1]).toBeCloseTo(0.0, 2); // 127 / 127.5 - 1 = -0.0039
    expect(normalized[2]).toBe(1.0);

    // If 128 is passed instead of 127
    const pixels2 = Uint8Array.of(128);
    const normalized2 = await normalizePixels(pixels2);
    expect(normalized2[0]).toBeCloseTo(0.0, 2); // 128 / 127.5 - 1 = 0.0039
  });

  test('cropTo112x112 crops and resizes correctly', async () => {
    const width = 10;
    const height = 10;
    const original = new Uint8Array(width * height);
    // Fill with values
    for (let i = 0; i < original.length; i++) {
      original[i] = i;
    }

    const bbox = { x: 2, y: 2, w: 6, h: 6 };
    const cropped = await cropTo112x112(original, bbox, width, height);

    expect(cropped).toBeInstanceOf(Float32Array);
    expect(cropped).toHaveLength(112 * 112);
    
    // Check range is within [-1, 1]
    for (let i = 0; i < cropped.length; i++) {
      expect(cropped[i]).toBeGreaterThanOrEqual(-1.0);
      expect(cropped[i]).toBeLessThanOrEqual(1.0);
    }
  });

  test('cosineSimilarity identical vectors -> 1.0', () => {
    const a = new Float32Array([1, 2, 3, 4, 5]);
    const b = new Float32Array([1, 2, 3, 4, 5]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });

  test('cosineSimilarity orthogonal -> ~0.0', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  test('cosineSimilarity mismatch length or zero norm returns 0', () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBe(0);

    const zero = new Float32Array([0, 0, 0]);
    const normal = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(zero, normal)).toBe(0);
  });

  type NormalizeInput = Float32Array;
  test('l2Normalize normalizes vector correctly', () => {
    const vec = new Float32Array([3, 4]);
    const normalized = l2Normalize(vec);
    
    expect(normalized).toHaveLength(2);
    expect(normalized[0]).toBeCloseTo(0.6, 5);
    expect(normalized[1]).toBeCloseTo(0.8, 5);

    // Sum of squares of normalized vector should be 1
    const sumSq = normalized[0] * normalized[0] + normalized[1] * normalized[1];
    expect(sumSq).toBeCloseTo(1.0, 5);
  });

  test('l2Normalize zero vector returns zero vector', () => {
    const vec = new Float32Array([0, 0, 0]);
    const normalized = l2Normalize(vec);
    expect(normalized).toEqual(new Float32Array([0, 0, 0]));
  });

  test('calculateBrightness computes correct mean brightness', () => {
    const rgba = Uint8Array.of(
      100, 100, 100, 255,
      200, 200, 200, 255,
      150, 150, 150, 255,
      50, 50, 50, 255
    );
    const brightness = calculateBrightness(rgba);
    expect(brightness).toBeCloseTo(125.0, 1);
  });

  test('calculateLaplacianVariance computes variance on synthetic data', () => {
    const rgba = new Uint8Array(3 * 3 * 4);
    rgba.fill(128);
    const variance = calculateLaplacianVariance(rgba, 3, 3);
    expect(variance).toBe(0);
  });

  test('globalHistogramEqualizationRGB stretches values independently', () => {
    const rgb = Uint8Array.of(100, 50, 200, 120, 50, 200);
    const equalized = globalHistogramEqualizationRGB(rgb);
    expect(equalized.length).toBe(rgb.length);
    expect(equalized[0]).toBe(0);
    expect(equalized[3]).toBe(255);
    expect(equalized[1]).toBe(50);
    expect(equalized[4]).toBe(50);
  });

  test('alignFace falls back to centerCropResize when landmarks are missing', async () => {
    const rgba = new Uint8Array(200 * 200 * 4);
    rgba.fill(100);
    const aligned = await alignFace(rgba, 200, 200, null);
    expect(aligned.length).toBe(112 * 112 * 3);
    expect(aligned[0]).toBe(100);
  });
});
