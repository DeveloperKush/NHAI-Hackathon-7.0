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

  test('findBestMatch single-user accepts from 0.80 (blocks ceiling ~0.77)', () => {
    const u = new Float32Array(512);
    u[0] = 1.0;

    const v77 = new Float32Array(512);
    v77[0] = 0.77;
    v77[1] = Math.sqrt(1 - 0.77 * 0.77);

    const v81 = new Float32Array(512);
    v81[0] = 0.81;
    v81[1] = Math.sqrt(1 - 0.81 * 0.81);

    const enrolled = [{ user_id: 'user-a', embedding: u }];

    expect(findBestMatch(v77, enrolled).user_id).toBeNull();
    expect(findBestMatch(v81, enrolled).user_id).toBe('user-a');
  });

  test('findBestMatch multi-user blocks impostor margin (0.85 vs 0.79 at threshold 0.86)', () => {
    const u = new Float32Array(512);
    u[0] = 1.0;
    const w = new Float32Array(512);
    w[1] = 1.0;

    const impostor = new Float32Array(512);
    impostor[0] = 0.85;
    impostor[1] = Math.sqrt(1 - 0.85 * 0.85);

    const enrolled = [
      { user_id: 'user-a', embedding: u },
      { user_id: 'user-b', embedding: w },
    ];

    expect(findBestMatch(impostor, enrolled).user_id).toBeNull();
  });

  test('findBestMatch multi-user accepts clear winner (0.89 vs 0.79)', () => {
    const u = new Float32Array(512);
    u[0] = 1.0;
    const w = new Float32Array(512);
    w[1] = 1.0;

    const query = new Float32Array(512);
    query[0] = 0.89;
    query[1] = Math.sqrt(1 - 0.89 * 0.89);

    const enrolled = [
      { user_id: 'user-a', embedding: u },
      { user_id: 'user-b', embedding: w },
    ];

    const match = findBestMatch(query, enrolled);
    expect(match.user_id).toBe('user-a');
    expect(match.score).toBeCloseTo(0.89, 5);
  });

  test('generateDeviceId returns stable mock installation ID from Constants', () => {
    const id1 = generateDeviceId();
    const id2 = generateDeviceId();

    expect(id1).toBe('mock-installation-id');
    expect(id2).toBe('mock-installation-id');
  });
});
