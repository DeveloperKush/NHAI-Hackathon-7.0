import {
  extractEmbedding,
  findBestMatch,
  generateDeviceId
} from '../src/services/ai/recognition';

// Mock expo-constants to control installationId
jest.mock('expo-constants', () => {
  return {
    installationId: 'mock-installation-id',
    sessionId: 'mock-session-id'
  };
});

describe('Face Recognition Engine Tests', () => {
  test('extractEmbedding is deterministic and outputs correct dimensions', () => {
    // Create a dummy image of size 112 * 112 = 12544
    const size = 112 * 112;
    const img1 = new Float32Array(size);
    const img2 = new Float32Array(size);

    for (let i = 0; i < size; i++) {
      const val = Math.sin(i);
      img1[i] = val;
      img2[i] = val;
    }

    const emb1 = extractEmbedding(img1);
    const emb2 = extractEmbedding(img2);

    expect(emb1).toBeInstanceOf(Float32Array);
    expect(emb1).toHaveLength(512);

    expect(emb2).toBeInstanceOf(Float32Array);
    expect(emb2).toHaveLength(512);

    // Verify exact determinism
    for (let i = 0; i < 512; i++) {
      expect(emb1[i]).toBe(emb2[i]);
    }
  });

  test('findBestMatch returns correct user_id and score of 1.0 for perfect match', () => {
    const size = 112 * 112;
    const img = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      img[i] = Math.cos(i);
    }

    const embedding = extractEmbedding(img);
    const enrolledFaces = [
      { user_id: 'user-1', embedding: embedding },
      { user_id: 'user-2', embedding: new Float32Array(512) }
    ];

    const match = findBestMatch(embedding, enrolledFaces);
    expect(match.user_id).toBe('user-1');
    expect(match.score).toBeCloseTo(1.0, 5);
  });

  test('findBestMatch returns null user_id if enrolled faces empty', () => {
    const emb = new Float32Array(512);
    const match = findBestMatch(emb, []);
    expect(match.user_id).toBeNull();
    expect(match.score).toBe(0);
  });

  test('findBestMatch respects similarity threshold (0.6)', () => {
    // Construct orthogonal unit vectors u and w
    const u = new Float32Array(512);
    u[0] = 1.0; // u is [1, 0, 0, ...]
    
    const w = new Float32Array(512);
    w[1] = 1.0; // w is [0, 1, 0, ...]

    // S = 0.55 (similar vector, but below threshold 0.6)
    const v55 = new Float32Array(512);
    v55[0] = 0.55;
    v55[1] = Math.sqrt(1 - 0.55 * 0.55);

    // S = 0.65 (similar vector, above threshold 0.6)
    const v65 = new Float32Array(512);
    v65[0] = 0.65;
    v65[1] = Math.sqrt(1 - 0.65 * 0.65);

    const enrolled = [
      { user_id: 'user-a', embedding: u }
    ];

    // Query with 0.55 similarity -> must return null user_id
    const match55 = findBestMatch(v55, enrolled);
    expect(match55.user_id).toBeNull();
    expect(match55.score).toBe(0);

    // Query with 0.65 similarity -> must return 'user-a'
    const match65 = findBestMatch(v65, enrolled);
    expect(match65.user_id).toBe('user-a');
    expect(match65.score).toBeCloseTo(0.65, 5);
  });

  test('generateDeviceId returns stable mock installation ID from Constants', () => {
    const id1 = generateDeviceId();
    const id2 = generateDeviceId();

    expect(id1).toBe('mock-installation-id');
    expect(id2).toBe('mock-installation-id');
  });
});
