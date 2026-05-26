import {
  calculateEAR,
  calculateMAR,
  calculateHeadYaw,
  checkDepthConsistency,
  getPromptForState,
  LivenessEngine,
  Landmark
} from '../src/services/ai/liveness';
import { Challenge } from '../src/constants/liveness';

// Helper to create a base mock landmark list (455+ elements)
function createMockLandmarks(options?: {
  flatPhoto?: boolean;
  eyeState?: 'open' | 'closed';
  lipsState?: 'normal' | 'smile';
  headState?: 'center' | 'turn';
}): Landmark[] {
  const landmarks: Landmark[] = [];
  const flat = options?.flatPhoto ?? false;

  // Initialize all landmarks with some base coordinate values
  for (let i = 0; i < 460; i++) {
    landmarks.push({
      x: 0.5,
      y: 0.5,
      // If flatPhoto, z is exactly 0. If normal, give it some depth variance
      z: flat ? 0.0 : (i % 10) * 0.005
    });
  }

  // Left Eye indices: 33, 160, 158, 133, 153, 144
  // Right Eye indices: 362, 385, 387, 263, 380, 373
  const eyeState = options?.eyeState ?? 'open';
  if (eyeState === 'open') {
    // Left eye open
    landmarks[33] = { x: 0.20, y: 0.40, z: 0.01 }; // p1
    landmarks[160] = { x: 0.22, y: 0.38, z: 0.01 }; // p2
    landmarks[158] = { x: 0.24, y: 0.38, z: 0.01 }; // p3
    landmarks[133] = { x: 0.26, y: 0.40, z: 0.01 }; // p4
    landmarks[153] = { x: 0.24, y: 0.42, z: 0.01 }; // p5
    landmarks[144] = { x: 0.22, y: 0.42, z: 0.01 }; // p6

    // Right eye open
    landmarks[362] = { x: 0.70, y: 0.40, z: 0.01 }; // p1
    landmarks[385] = { x: 0.72, y: 0.38, z: 0.01 }; // p2
    landmarks[387] = { x: 0.74, y: 0.38, z: 0.01 }; // p3
    landmarks[263] = { x: 0.76, y: 0.40, z: 0.01 }; // p4
    landmarks[380] = { x: 0.74, y: 0.42, z: 0.01 }; // p5
    landmarks[373] = { x: 0.72, y: 0.42, z: 0.01 }; // p6
  } else {
    // Closed eyes (blink) - vertical distances are extremely small
    landmarks[33] = { x: 0.20, y: 0.40, z: 0.01 };
    landmarks[160] = { x: 0.22, y: 0.40, z: 0.01 }; // same y as corners
    landmarks[158] = { x: 0.24, y: 0.40, z: 0.01 };
    landmarks[133] = { x: 0.26, y: 0.40, z: 0.01 };
    landmarks[153] = { x: 0.24, y: 0.40, z: 0.01 };
    landmarks[144] = { x: 0.22, y: 0.40, z: 0.01 };

    landmarks[362] = { x: 0.70, y: 0.40, z: 0.01 };
    landmarks[385] = { x: 0.72, y: 0.40, z: 0.01 };
    landmarks[387] = { x: 0.74, y: 0.40, z: 0.01 };
    landmarks[263] = { x: 0.76, y: 0.40, z: 0.01 };
    landmarks[380] = { x: 0.74, y: 0.40, z: 0.01 };
    landmarks[373] = { x: 0.72, y: 0.40, z: 0.01 };
  }

  // Lips indices: 61, 291, 13, 14
  const lipsState = options?.lipsState ?? 'normal';
  if (lipsState === 'normal') {
    landmarks[61] = { x: 0.40, y: 0.60, z: 0.02 };  // left corner
    landmarks[291] = { x: 0.60, y: 0.60, z: 0.02 }; // right corner
    landmarks[13] = { x: 0.50, y: 0.58, z: 0.02 };  // top center
    landmarks[14] = { x: 0.50, y: 0.62, z: 0.02 };  // bottom center
  } else {
    // Smile (mouth opened/stretched vertically)
    landmarks[61] = { x: 0.40, y: 0.60, z: 0.02 };
    landmarks[291] = { x: 0.60, y: 0.60, z: 0.02 };
    landmarks[13] = { x: 0.50, y: 0.50, z: 0.02 }; // top moved up
    landmarks[14] = { x: 0.50, y: 0.70, z: 0.02 }; // bottom moved down
  }

  // Head turn landmarks: nose=1, leftCheek=234, rightCheek=454
  const headState = options?.headState ?? 'center';
  if (headState === 'center') {
    landmarks[1] = { x: 0.50, y: 0.50, z: 0.03 };   // nose in the middle of cheeks
    landmarks[234] = { x: 0.20, y: 0.50, z: 0.01 }; // left cheek
    landmarks[454] = { x: 0.80, y: 0.50, z: 0.01 }; // right cheek
  } else {
    // Turned head (asymmetry nose closer to left cheek)
    landmarks[1] = { x: 0.30, y: 0.50, z: 0.03 }; // nose moved left
    landmarks[234] = { x: 0.20, y: 0.50, z: 0.01 };
    landmarks[454] = { x: 0.80, y: 0.50, z: 0.01 };
  }

  // Force all z coordinates to 0 if flatPhoto is true to ensure 0 variance/stdDev
  if (flat) {
    for (const landmark of landmarks) {
      landmark.z = 0;
    }
  }

  return landmarks;
}

describe('Liveness Math Function Tests', () => {
  test('calculateEAR correctly computes eye aspect ratio', () => {
    const landmarksOpen = createMockLandmarks({ eyeState: 'open' });
    const leftEyeOpen = [33, 160, 158, 133, 153, 144].map(idx => landmarksOpen[idx]);
    const rightEyeOpen = [362, 385, 387, 263, 380, 373].map(idx => landmarksOpen[idx]);

    const earOpen = calculateEAR(leftEyeOpen, rightEyeOpen);
    expect(earOpen).toBeGreaterThan(0.2);

    const landmarksClosed = createMockLandmarks({ eyeState: 'closed' });
    const leftEyeClosed = [33, 160, 158, 133, 153, 144].map(idx => landmarksClosed[idx]);
    const rightEyeClosed = [362, 385, 387, 263, 380, 373].map(idx => landmarksClosed[idx]);

    const earClosed = calculateEAR(leftEyeClosed, rightEyeClosed);
    expect(earClosed).toBeLessThan(0.1);
  });

  test('calculateMAR correctly computes mouth aspect ratio', () => {
    const landmarksNormal = createMockLandmarks({ lipsState: 'normal' });
    const lipsNormal = [61, 291, 13, 14].map(idx => landmarksNormal[idx]);
    const marNormal = calculateMAR(lipsNormal);
    // |0.58 - 0.62| / |0.40 - 0.60| = 0.04 / 0.20 = 0.2
    expect(marNormal).toBeCloseTo(0.2, 3);

    const landmarksSmile = createMockLandmarks({ lipsState: 'smile' });
    const lipsSmile = [61, 291, 13, 14].map(idx => landmarksSmile[idx]);
    const marSmile = calculateMAR(lipsSmile);
    // |0.50 - 0.70| / |0.40 - 0.60| = 0.20 / 0.20 = 1.0
    expect(marSmile).toBeCloseTo(1.0, 3);
  });

  test('calculateHeadYaw correctly computes head yaw asymmetry', () => {
    const landmarksCenter = createMockLandmarks({ headState: 'center' });
    const yawCenter = calculateHeadYaw(
      landmarksCenter[1],
      landmarksCenter[234],
      landmarksCenter[454]
    );
    expect(yawCenter).toBeCloseTo(0.0, 5);

    const landmarksTurn = createMockLandmarks({ headState: 'turn' });
    const yawTurn = calculateHeadYaw(
      landmarksTurn[1],
      landmarksTurn[234],
      landmarksTurn[454]
    );
    // dLeft = |0.30 - 0.20| = 0.1
    // dRight = |0.30 - 0.80| = 0.5
    // yaw = (0.1 - 0.5) / 0.6 = -0.4 / 0.6 = -0.666
    expect(Math.abs(yawTurn)).toBeCloseTo(0.6667, 3);
  });

  test('checkDepthConsistency flags flat photos', () => {
    const flatLandmarks = createMockLandmarks({ flatPhoto: true });
    expect(checkDepthConsistency(flatLandmarks)).toBe(false);

    const realLandmarks = createMockLandmarks({ flatPhoto: false });
    expect(checkDepthConsistency(realLandmarks)).toBe(true);
  });
});

describe('LivenessEngine State Machine Tests', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('getPromptForState returns correct prompt strings', () => {
    expect(getPromptForState('READY')).toBe('Face camera');
    expect(getPromptForState('WAITING_BLINK')).toBe('Please blink');
    expect(getPromptForState('WAITING_SMILE')).toBe('Please smile');
    expect(getPromptForState('WAITING_HEAD_TURN')).toBe('Turn head slightly');
    expect(getPromptForState('PASSED')).toBeNull();
    expect(getPromptForState('FAILED')).toBe('Timeout — Please try again');
  });

  test('Transitions from READY through challenges to PASSED', () => {
    const engine = new LivenessEngine(2);
    const challenges = engine.getChallenges();
    expect(challenges.length).toBe(2);
    expect(engine.getState()).toBe('READY');

    const normalFrame = createMockLandmarks({
      eyeState: 'open',
      lipsState: 'normal',
      headState: 'center',
      flatPhoto: false
    });

    // Send first frame to transition from READY to the first challenge
    let res = engine.processFrame(normalFrame);
    const firstChallenge = challenges[0];
    const expectedFirstState = `WAITING_${firstChallenge}`;
    expect(res.state).toBe(expectedFirstState);

    // Resolve first challenge
    // Let's create custom frames to satisfy whatever the first challenge is
    if (firstChallenge === Challenge.BLINK) {
      const blinkFrame = createMockLandmarks({ eyeState: 'closed' });
      // Blink requires 3 consecutive frames
      res = engine.processFrame(blinkFrame);
      expect(res.state).toBe('WAITING_BLINK');
      res = engine.processFrame(blinkFrame);
      expect(res.state).toBe('WAITING_BLINK');
      res = engine.processFrame(blinkFrame);
    } else if (firstChallenge === Challenge.SMILE) {
      const smileFrame = createMockLandmarks({ lipsState: 'smile' });
      res = engine.processFrame(smileFrame);
    } else {
      const turnFrame = createMockLandmarks({ headState: 'turn' });
      res = engine.processFrame(turnFrame);
    }

    // Now it should be in the second challenge state
    const secondChallenge = challenges[1];
    const expectedSecondState = `WAITING_${secondChallenge}`;
    expect(res.state).toBe(expectedSecondState);

    // Resolve second challenge
    if (secondChallenge === Challenge.BLINK) {
      const blinkFrame = createMockLandmarks({ eyeState: 'closed' });
      engine.processFrame(blinkFrame);
      engine.processFrame(blinkFrame);
      res = engine.processFrame(blinkFrame);
    } else if (secondChallenge === Challenge.SMILE) {
      const smileFrame = createMockLandmarks({ lipsState: 'smile' });
      res = engine.processFrame(smileFrame);
    } else {
      const turnFrame = createMockLandmarks({ headState: 'turn' });
      res = engine.processFrame(turnFrame);
    }

    // Engine should now be PASSED
    expect(res.state).toBe('PASSED');
    expect(res.prompt).toBeNull();
  });

  test('Detects flat photo spoof and fails immediately', () => {
    const engine = new LivenessEngine(2);
    const flatFrame = createMockLandmarks({ flatPhoto: true });

    const res = engine.processFrame(flatFrame);
    expect(res.state).toBe('FAILED');
    expect(res.prompt).toBe('Timeout — Please try again');
  });

  test('Times out after 10 seconds of inactive challenge', () => {
    const engine = new LivenessEngine(1);
    const challenges = engine.getChallenges();
    const normalFrame = createMockLandmarks({
      eyeState: 'open',
      lipsState: 'normal',
      headState: 'center'
    });

    // Enter active state
    let res = engine.processFrame(normalFrame);
    expect(res.state).toBe(`WAITING_${challenges[0]}`);

    // Advance timers by 11 seconds (11000ms)
    jest.advanceTimersByTime(11000);

    // Process another frame
    res = engine.processFrame(normalFrame);
    expect(res.state).toBe('FAILED');
  });
});
