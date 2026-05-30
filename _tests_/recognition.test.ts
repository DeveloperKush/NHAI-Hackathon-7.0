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

  test('findBestMatch respects similarity threshold (0.91)', () => {
    const u = new Float32Array(512);
    u[0] = 1.0;

    const v88 = new Float32Array(512);
    v88[0] = 0.88;
    v88[1] = Math.sqrt(1 - 0.88 * 0.88);

    const v92 = new Float32Array(512);
    v92[0] = 0.92;
    v92[1] = Math.sqrt(1 - 0.92 * 0.92);

    const enrolled = [{ user_id: 'user-a', embedding: u }];

    const match88 = findBestMatch(v88, enrolled);
    expect(match88.user_id).toBeNull();
    expect(match88.score).toBeCloseTo(0.88, 5);

    const match92 = findBestMatch(v92, enrolled);
    expect(match92.user_id).toBe('user-a');
    expect(match92.score).toBeCloseTo(0.92, 5);
  });

  test('generateDeviceId returns stable mock installation ID from Constants', () => {
    const id1 = generateDeviceId();
    const id2 = generateDeviceId();

    expect(id1).toBe('mock-installation-id');
    expect(id2).toBe('mock-installation-id');
  });
});
