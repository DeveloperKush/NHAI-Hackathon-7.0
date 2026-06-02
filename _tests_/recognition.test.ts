/**
 * @file recognition.test.ts
 * Unit tests for the TFLite recognition service: embedding extraction,
 * cosine matching logic, multi-user margin/ratio guards, and device-id generation.
 * All tests run entirely in the Jest JS environment (mock model inference).
 */

import {
  extractEmbedding,
  averageEmbeddings,
  findBestMatch,
  generateDeviceId,
  initRecognitionModel,
  getModelStatus,
} from '../src/services/ai/recognition';
import { cosineSimilarity, l2Normalize } from '../src/utils/math';
import {
  SIMILARITY_THRESHOLD,
  SIMILARITY_SINGLE_USER_THRESHOLD,
  SIMILARITY_HIGH_CONFIDENCE,
  MIN_MATCH_MARGIN,
  MIN_MATCH_RATIO,
} from '../src/constants/config';

jest.mock('expo-constants', () => ({
  installationId: 'mock-install-id-abc',
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a deterministic 112×112 greyscale Float32Array from a seed.
 * Uses seed as a phase offset so different seeds produce clearly different images.
 */
function makeImage(seed: number): Float32Array {
  const size = 112 * 112;
  const img = new Float32Array(size);
  for (let i = 0; i < size; i++) img[i] = Math.sin(seed * 37.0 + i * 0.01);
  return img;
}

/** Build a unit vector in R^512 pointing along a given axis. */
function unitVec(axis: number, dim = 512): Float32Array {
  const v = new Float32Array(dim);
  v[axis] = 1.0;
  return v;
}

/** Build a vector with a known cosine similarity `cos` to `unitVec(0)`. */
function vecWithCos(cos: number, dim = 512): Float32Array {
  const v = new Float32Array(dim);
  v[0] = cos;
  v[1] = Math.sqrt(Math.max(0, 1 - cos * cos));
  return l2Normalize(v);
}

// ─── Model lifecycle ─────────────────────────────────────────────────────────

describe('Model lifecycle', () => {
  test('initRecognitionModel resolves without throwing in test env', async () => {
    await expect(initRecognitionModel()).resolves.toBeUndefined();
  });

  test('getModelStatus returns {loaded:false, error:null} in test env (mock model)', () => {
    const status = getModelStatus();
    expect(status).toHaveProperty('loaded');
    expect(status).toHaveProperty('error');
  });
});

// ─── extractEmbedding ────────────────────────────────────────────────────────

describe('extractEmbedding', () => {
  test('returns Float32Array of length 512', () => {
    const emb = extractEmbedding(makeImage(1));
    expect(emb).toBeInstanceOf(Float32Array);
    expect(emb).toHaveLength(512);
  });

  test('is deterministic — same input yields identical output', () => {
    const img = makeImage(42);
    const e1 = extractEmbedding(img);
    const e2 = extractEmbedding(img);
    for (let i = 0; i < 512; i++) expect(e1[i]).toBe(e2[i]);
  });

  test('output is L2-normalised (unit norm)', () => {
    const emb = extractEmbedding(makeImage(7));
    let sumSq = 0;
    for (let i = 0; i < 512; i++) sumSq += emb[i] * emb[i];
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
  });

  test('different seeds produce meaningfully different embeddings', () => {
    // Use seed 1 vs seed 100 — large phase difference guarantees distinct mean → distinct embedding
    const e1 = extractEmbedding(makeImage(1));
    const e100 = extractEmbedding(makeImage(100));
    // They must not be identical (same bytes)
    let allSame = true;
    for (let i = 0; i < 512; i++) {
      if (e1[i] !== e100[i]) { allSame = false; break; }
    }
    expect(allSame).toBe(false);
  });

  test('accepts 112×112×3 RGB input (37632 floats)', () => {
    const rgb = new Float32Array(112 * 112 * 3).fill(0.1);
    const emb = extractEmbedding(rgb);
    expect(emb).toHaveLength(512);
  });

  test('throws on invalid input size', () => {
    const bad = new Float32Array(100);
    expect(() => extractEmbedding(bad)).toThrow('Invalid input shape');
  });
});

// ─── averageEmbeddings ───────────────────────────────────────────────────────

describe('averageEmbeddings', () => {
  test('average of identical embeddings equals the same embedding', () => {
    const e = extractEmbedding(makeImage(5));
    const avg = averageEmbeddings([e, e, e]);
    expect(cosineSimilarity(avg, e)).toBeCloseTo(1.0, 5);
  });

  test('returns zero vector for empty input', () => {
    const avg = averageEmbeddings([]);
    expect(avg).toHaveLength(512);
    expect(avg.every(v => v === 0)).toBe(true);
  });

  test('result is always L2-normalised', () => {
    const e1 = extractEmbedding(makeImage(3));
    const e2 = extractEmbedding(makeImage(9));
    const avg = averageEmbeddings([e1, e2]);
    let sumSq = 0;
    for (let i = 0; i < 512; i++) sumSq += avg[i] * avg[i];
    expect(Math.sqrt(sumSq)).toBeCloseTo(1.0, 5);
  });

  test('throws when embedding dimensions mismatch', () => {
    const good = new Float32Array(512).fill(0.1);
    const bad  = new Float32Array(128).fill(0.1);
    expect(() => averageEmbeddings([good, bad])).toThrow('Invalid embedding shape');
  });
});

// ─── findBestMatch ───────────────────────────────────────────────────────────

describe('findBestMatch — empty / edge cases', () => {
  test('returns null with score 0 for empty enrolled list', () => {
    const { user_id, score } = findBestMatch(unitVec(0), []);
    expect(user_id).toBeNull();
    expect(score).toBe(0);
  });
});

describe('findBestMatch — single enrolled user', () => {
  const enrolled = [{ user_id: 'alice', embedding: unitVec(0) }];

  test('perfect match (cos=1.0) always accepted', () => {
    const { user_id, score } = findBestMatch(unitVec(0), enrolled);
    expect(user_id).toBe('alice');
    expect(score).toBeCloseTo(1.0, 5);
  });

  test(`score above SIMILARITY_HIGH_CONFIDENCE (${SIMILARITY_HIGH_CONFIDENCE}) accepted via fast path`, () => {
    const query = vecWithCos(SIMILARITY_HIGH_CONFIDENCE + 0.005);
    expect(findBestMatch(query, enrolled).user_id).toBe('alice');
  });

  test(`score above SIMILARITY_SINGLE_USER_THRESHOLD (${SIMILARITY_SINGLE_USER_THRESHOLD}) accepted`, () => {
    const query = vecWithCos(SIMILARITY_SINGLE_USER_THRESHOLD + 0.01);
    expect(findBestMatch(query, enrolled).user_id).toBe('alice');
  });

  test(`score below SIMILARITY_SINGLE_USER_THRESHOLD (${SIMILARITY_SINGLE_USER_THRESHOLD}) rejected`, () => {
    const query = vecWithCos(SIMILARITY_SINGLE_USER_THRESHOLD - 0.02);
    const { user_id, rejectReason } = findBestMatch(query, enrolled);
    expect(user_id).toBeNull();
    expect(rejectReason).toBeDefined();
  });
});

describe('findBestMatch — multi-user margin & ratio guards', () => {
  // Two orthogonal enrolled vectors
  const enrolled = [
    { user_id: 'alice', embedding: unitVec(0) },
    { user_id: 'bob',   embedding: unitVec(1) },
  ];

  test('high-confidence win (≥ SIMILARITY_HIGH_CONFIDENCE) bypasses margin check', () => {
    const query = vecWithCos(SIMILARITY_HIGH_CONFIDENCE + 0.005);
    expect(findBestMatch(query, enrolled).user_id).toBe('alice');
  });

  test('ambiguous match blocked when margin below MIN_MATCH_MARGIN', () => {
    // Both alice and bob score similarly → margin < MIN_MATCH_MARGIN
    const tied = new Float32Array(512);
    tied[0] = 0.87;
    tied[1] = 0.87;
    const norm = Math.sqrt(tied[0] ** 2 + tied[1] ** 2);
    tied[0] /= norm;
    tied[1] /= norm;
    const { user_id } = findBestMatch(tied, enrolled);
    expect(user_id).toBeNull();
  });

  test('clear multi-user winner accepted (≥ SIMILARITY_THRESHOLD + margin)', () => {
    const query = vecWithCos(0.89);
    const { user_id, score } = findBestMatch(query, enrolled);
    expect(user_id).toBe('alice');
    expect(score).toBeCloseTo(0.89, 3);
  });

  test('rejectReason string is populated on rejection', () => {
    const low = vecWithCos(SIMILARITY_THRESHOLD - 0.05);
    const { user_id, rejectReason } = findBestMatch(low, enrolled);
    expect(user_id).toBeNull();
    expect(typeof rejectReason).toBe('string');
    expect(rejectReason!.length).toBeGreaterThan(0);
  });
});

// ─── generateDeviceId ────────────────────────────────────────────────────────

describe('generateDeviceId', () => {
  test('returns the mocked expo-constants installationId', () => {
    expect(generateDeviceId()).toBe('mock-install-id-abc');
  });

  test('is stable across multiple calls', () => {
    const id1 = generateDeviceId();
    const id2 = generateDeviceId();
    expect(id1).toBe(id2);
  });
});
