/**
 * @file preprocessing.test.ts
 * Unit tests for image preprocessing utilities and face alignment.
 * Pure JS — no native modules.
 */

import {
  applyCLAHE,
  globalHistogramEqualization,
  globalHistogramEqualizationRGB,
  normalizePixels,
  cropTo112x112,
  calculateBrightness,
  calculateLaplacianVariance,
  fastPreprocessFromBase64WithStats,
  base64ToUint8Array,
} from '../src/utils/imagePreProc';
import { alignFace, centerCropResize } from '../src/services/ai/faceAlignment';
import { cosineSimilarity, l2Normalize } from '../src/utils/math';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Standard deviation of a Uint8Array. */
function stdDev(arr: Uint8Array): number {
  const n = arr.length;
  if (n === 0) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / n;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return Math.sqrt(variance);
}

/** Fill a Uint8Array with a low-contrast gradient. */
function lowContrastGradient(len: number): Uint8Array {
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = 120 + Math.floor((i / len) * 15);
  return arr;
}

/** Solid-colour RGBA block. */
function solidRGBA(pixels: number, value: number): Uint8Array {
  const buf = new Uint8Array(pixels * 4);
  for (let i = 0; i < pixels; i++) {
    buf[i * 4] = value; buf[i * 4 + 1] = value;
    buf[i * 4 + 2] = value; buf[i * 4 + 3] = 255;
  }
  return buf;
}

// ─── CLAHE ───────────────────────────────────────────────────────────────────

describe('applyCLAHE', () => {
  test('increases contrast on a low-contrast gradient', async () => {
    const W = 112, H = 112;
    const input = lowContrastGradient(W * H);
    const before = stdDev(input);
    const output = await applyCLAHE(input, W, H);
    expect(stdDev(output)).toBeGreaterThan(before);
    expect(output).toHaveLength(W * H);
  });

  test('output values stay within [0, 255]', async () => {
    const input = lowContrastGradient(64 * 64);
    const output = await applyCLAHE(input, 64, 64);
    for (const v of output) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });

  test('passes through empty / zero-size image safely', async () => {
    const out = await applyCLAHE(new Uint8Array(0), 0, 0);
    expect(out).toHaveLength(0);
  });

  test('preserves length', async () => {
    const input = new Uint8Array(32 * 32).fill(100);
    const out = await applyCLAHE(input, 32, 32);
    expect(out).toHaveLength(32 * 32);
  });
});

// ─── Global histogram equalization ───────────────────────────────────────────

describe('globalHistogramEqualization', () => {
  test('stretches range to [0, 255]', () => {
    const input = Uint8Array.of(100, 110, 120, 130, 140, 150);
    const out = globalHistogramEqualization(input);
    expect(Math.min(...out)).toBe(0);
    expect(Math.max(...out)).toBe(255);
  });

  test('constant-value image returns constant output (no division by zero)', () => {
    const input = new Uint8Array(16).fill(128);
    const out = globalHistogramEqualization(input);
    expect(out).toHaveLength(16);
    // All same → cdfMin === n → denom = 0 → returns original copy
    expect([...out]).toEqual([...input]);
  });

  test('handles empty array', () => {
    const out = globalHistogramEqualization(new Uint8Array(0));
    expect(out).toHaveLength(0);
  });
});

describe('globalHistogramEqualizationRGB', () => {
  test('equalises each channel independently', () => {
    // Two pixels: red channel [100, 200], green channel [50, 50], blue [200, 200]
    const rgb = Uint8Array.of(100, 50, 200,  200, 50, 200);
    const out = globalHistogramEqualizationRGB(rgb);
    // Red: [100→0, 200→255]; green: constant→constant; blue: constant→constant
    expect(out[0]).toBe(0);   // red min
    expect(out[3]).toBe(255); // red max
    expect(out[1]).toBe(50);  // green unchanged (constant channel)
    expect(out[4]).toBe(50);
  });

  test('output length equals input length', () => {
    const rgb = new Uint8Array(3 * 100).fill(128);
    expect(globalHistogramEqualizationRGB(rgb)).toHaveLength(3 * 100);
  });
});

// ─── normalizePixels ─────────────────────────────────────────────────────────

describe('normalizePixels', () => {
  test('[0, 127, 255] → [-1, ~0, 1]', async () => {
    const out = await normalizePixels(Uint8Array.of(0, 127, 255));
    expect(out[0]).toBeCloseTo(-1.0, 5);
    expect(out[1]).toBeCloseTo((127 / 127.5) - 1, 4);
    expect(out[2]).toBeCloseTo(1.0, 5);
  });

  test('all output values in [-1, 1]', async () => {
    const out = await normalizePixels(new Uint8Array(256).fill(0).map((_, i) => i));
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

// ─── cropTo112x112 ───────────────────────────────────────────────────────────

describe('cropTo112x112', () => {
  test('returns Float32Array of length 112*112', async () => {
    const W = 20, H = 20;
    const img = new Uint8Array(W * H).fill(128);
    const out = await cropTo112x112(img, { x: 2, y: 2, w: 16, h: 16 }, W, H);
    expect(out).toBeInstanceOf(Float32Array);
    expect(out).toHaveLength(112 * 112);
  });

  test('output values are in [-1, 1]', async () => {
    const W = 16, H = 16;
    const img = new Uint8Array(W * H).fill(200);
    const out = await cropTo112x112(img, { x: 0, y: 0, w: W, h: H }, W, H);
    for (const v of out) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test('handles zero-size image without crash', async () => {
    const out = await cropTo112x112(new Uint8Array(0), { x: 0, y: 0, w: 0, h: 0 }, 0, 0);
    expect(out).toHaveLength(112 * 112);
  });
});

// ─── calculateBrightness ─────────────────────────────────────────────────────

describe('calculateBrightness', () => {
  test('returns 0 for black image', () => {
    expect(calculateBrightness(solidRGBA(4, 0))).toBe(0);
  });

  test('returns 255 for white image', () => {
    expect(calculateBrightness(solidRGBA(4, 255))).toBeCloseTo(255, 0);
  });

  test('returns ~125 for mid-grey image', () => {
    expect(calculateBrightness(solidRGBA(16, 125))).toBeCloseTo(125, 0);
  });

  test('uses luminance formula (R:0.299 G:0.587 B:0.114)', () => {
    // One pixel: R=255, G=0, B=0
    const buf = Uint8Array.of(255, 0, 0, 255);
    expect(calculateBrightness(buf)).toBeCloseTo(0.299 * 255, 0);
  });
});

// ─── calculateLaplacianVariance ───────────────────────────────────────────────

describe('calculateLaplacianVariance', () => {
  test('returns 0 for uniform flat image (no edges)', () => {
    const W = 5, H = 5;
    const flat = solidRGBA(W * H, 128);
    expect(calculateLaplacianVariance(flat, W, H)).toBe(0);
  });

  test('returns positive value for an image with edges', () => {
    const W = 8, H = 8;
    const edgy = new Uint8Array(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const v = i % 2 === 0 ? 0 : 255;
      edgy[i * 4] = v; edgy[i * 4 + 1] = v; edgy[i * 4 + 2] = v; edgy[i * 4 + 3] = 255;
    }
    expect(calculateLaplacianVariance(edgy, W, H)).toBeGreaterThan(0);
  });
});

// ─── faceAlignment ───────────────────────────────────────────────────────────

describe('alignFace / centerCropResize', () => {
  test('centerCropResize produces 112×112×3 output', async () => {
    const rgba = new Uint8Array(200 * 200 * 4).fill(100);
    const out = await centerCropResize(rgba, 200, 200);
    expect(out).toHaveLength(112 * 112 * 3);
  });

  test('alignFace falls back gracefully when landmarks are null', async () => {
    const rgba = new Uint8Array(150 * 150 * 4).fill(128);
    const out = await alignFace(rgba, 150, 150, null);
    expect(out).toHaveLength(112 * 112 * 3);
  });

  test('alignFace falls back gracefully when landmarks array is too short', async () => {
    const rgba = new Uint8Array(100 * 100 * 4).fill(64);
    const shortLm = [{ x: 0.5, y: 0.5, z: 0 }];
    const out = await alignFace(rgba, 100, 100, shortLm as any);
    expect(out).toHaveLength(112 * 112 * 3);
  });
});

// ─── Math utilities ───────────────────────────────────────────────────────────

describe('cosineSimilarity', () => {
  test('identical vectors → 1.0', () => {
    const v = new Float32Array([1, 2, 3, 4]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  test('orthogonal vectors → 0.0', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  test('opposite vectors → -1.0', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([-1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  test('mismatched lengths → 0', () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  test('zero-norm vector → 0', () => {
    const zero = new Float32Array([0, 0, 0]);
    const v    = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(zero, v)).toBe(0);
  });
});

describe('l2Normalize', () => {
  test('produces unit-norm vector', () => {
    const v = new Float32Array([3, 4]);
    const n = l2Normalize(v);
    expect(n[0]).toBeCloseTo(0.6, 5);
    expect(n[1]).toBeCloseTo(0.8, 5);
    const norm = Math.sqrt(n[0] ** 2 + n[1] ** 2);
    expect(norm).toBeCloseTo(1.0, 5);
  });

  test('zero vector returns zero vector without crash', () => {
    const out = l2Normalize(new Float32Array([0, 0, 0]));
    expect([...out]).toEqual([0, 0, 0]);
  });
});
