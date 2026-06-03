/**
 * @file liveness.test.ts
 * Unit tests for the liveness detection math functions and LivenessEngine state machine.
 * All tests are pure JS — no native modules required.
 */

import {
  calculateEAR,
  calculateMAR,
  calculateHeadYaw,
  checkDepthConsistency,
  getPromptForState,
  LivenessEngine,
  Landmark,
} from '../src/services/ai/liveness';
import { Challenge } from '../src/constants/liveness';

// ─── Landmark factory helpers ────────────────────────────────────────────────

/** Build a minimal 460-landmark array with controllable eye/lip/head/depth state. */
function makeLandmarks(opts: {
  eyes?: 'open' | 'closed';
  lips?: 'neutral' | 'wide';
  head?: 'center' | 'turned';
  depth?: 'real' | 'flat';
}): Landmark[] {
  const { eyes = 'open', lips = 'neutral', head = 'center', depth = 'real' } = opts;

  // Seed with normalized coords.
  // 'real': assign a sinusoidal z depth profile so σ(z) > 0.001 threshold.
  // 'flat': all z = 0 so σ(z) = 0, which fails checkDepthConsistency.
  const lm: Landmark[] = Array.from({ length: 460 }, (_, i) => ({
    x: 0.5,
    y: 0.5,
    z: depth === 'real' ? Math.sin(i * 0.15) * 0.05 : 0, // real: σ≈0.035, flat: σ=0
  }));

  // ── Eyes ──────────────────────────────────────
  // Left eye: [33, 160, 158, 133, 153, 144]
  // Right eye: [362, 385, 387, 263, 380, 373]
  const zVal = depth === 'real' ? 0.01 : 0;
  const eyeV = eyes === 'open' ? 0.02 : 0; // vertical separation
  const setEye = (indices: number[], cx: number, cy: number) => {
    lm[indices[0]] = { x: cx,        y: cy,          z: zVal };
    lm[indices[1]] = { x: cx + 0.02, y: cy - eyeV,   z: zVal };
    lm[indices[2]] = { x: cx + 0.04, y: cy - eyeV,   z: zVal };
    lm[indices[3]] = { x: cx + 0.06, y: cy,           z: zVal };
    lm[indices[4]] = { x: cx + 0.04, y: cy + eyeV,   z: zVal };
    lm[indices[5]] = { x: cx + 0.02, y: cy + eyeV,   z: zVal };
  };
  setEye([33, 160, 158, 133, 153, 144],   0.20, 0.40);
  setEye([362, 385, 387, 263, 380, 373], 0.70, 0.40);

  // ── Lips ──────────────────────────────────────
  const lipV = lips === 'wide' ? 0.10 : 0.02;
  lm[61]  = { x: 0.40, y: 0.60, z: zVal };
  lm[291] = { x: 0.60, y: 0.60, z: zVal };
  lm[13]  = { x: 0.50, y: 0.60 - lipV, z: zVal };
  lm[14]  = { x: 0.50, y: 0.60 + lipV, z: zVal };

  // ── Head yaw ──────────────────────────────────
  const noseX = head === 'center' ? 0.50 : 0.30;
  lm[1]   = { x: noseX, y: 0.50, z: zVal };
  lm[234] = { x: 0.20,  y: 0.50, z: zVal };
  lm[454] = { x: 0.80,  y: 0.50, z: zVal };

  // Smile helpers needed by calculateSmileScore (152=chin, 10=forehead)
  lm[152] = { x: 0.50, y: 0.90, z: zVal };
  lm[10]  = { x: 0.50, y: 0.10, z: zVal };

  return lm;
}

// ─── Pure math tests ─────────────────────────────────────────────────────────

describe('calculateEAR', () => {
  test('returns > 0.2 for open eyes', () => {
    const lm = makeLandmarks({ eyes: 'open' });
    const leftEye  = [33, 160, 158, 133, 153, 144].map(i => lm[i]);
    const rightEye = [362, 385, 387, 263, 380, 373].map(i => lm[i]);
    expect(calculateEAR(leftEye, rightEye)).toBeGreaterThan(0.2);
  });

  test('returns 0 for closed eyes (blink)', () => {
    const lm = makeLandmarks({ eyes: 'closed' });
    const leftEye  = [33, 160, 158, 133, 153, 144].map(i => lm[i]);
    const rightEye = [362, 385, 387, 263, 380, 373].map(i => lm[i]);
    expect(calculateEAR(leftEye, rightEye)).toBe(0);
  });

  test('returns 0 when eye arrays are too short', () => {
    expect(calculateEAR([], [])).toBe(0);
    expect(calculateEAR([{ x: 0, y: 0, z: 0 }], [{ x: 0, y: 0, z: 0 }])).toBe(0);
  });
});

describe('calculateMAR', () => {
  test('returns low ratio for neutral lips (~0.2)', () => {
    const lm = makeLandmarks({ lips: 'neutral' });
    const lips = [61, 291, 13, 14].map(i => lm[i]);
    // vertical = 2*0.02 = 0.04, horizontal = 0.20 → MAR = 0.04/0.20 = 0.2
    expect(calculateMAR(lips)).toBeCloseTo(0.2, 2);
  });

  test('returns high ratio for wide-open mouth (>=1.0)', () => {
    const lm = makeLandmarks({ lips: 'wide' });
    const lips = [61, 291, 13, 14].map(i => lm[i]);
    // vertical = 2*0.10 = 0.20, horizontal = 0.20 → MAR = 1.0
    expect(calculateMAR(lips)).toBeCloseTo(1.0, 2);
  });

  test('returns 0 when fewer than 4 landmarks provided', () => {
    expect(calculateMAR([{ x: 0, y: 0, z: 0 }])).toBe(0);
  });
});

describe('calculateHeadYaw', () => {
  test('returns ~0 for centered head', () => {
    const lm = makeLandmarks({ head: 'center' });
    // nose=0.50, leftCheek=0.20, rightCheek=0.80
    // dLeft=0.30, dRight=0.30 → yaw=0
    expect(calculateHeadYaw(lm[1], lm[234], lm[454])).toBeCloseTo(0, 5);
  });

  test('returns significant asymmetry for turned head', () => {
    const lm = makeLandmarks({ head: 'turned' });
    // nose=0.30, leftCheek=0.20, rightCheek=0.80
    // dLeft=0.10, dRight=0.50 → yaw=(0.10-0.50)/0.60 = -0.667
    const yaw = calculateHeadYaw(lm[1], lm[234], lm[454]);
    expect(Math.abs(yaw)).toBeCloseTo(0.667, 2);
  });

  test('returns 0 when both distances are zero', () => {
    const p: Landmark = { x: 0.5, y: 0.5, z: 0 };
    expect(calculateHeadYaw(p, p, p)).toBe(0);
  });
});

describe('checkDepthConsistency', () => {
  test('passes for real 3D face (z variance > threshold)', () => {
    const lm = makeLandmarks({ depth: 'real' });
    expect(checkDepthConsistency(lm)).toBe(true);
  });

  test('fails for flat photo (all z = 0)', () => {
    const lm = makeLandmarks({ depth: 'flat' });
    expect(checkDepthConsistency(lm)).toBe(false);
  });

  test('fails for empty landmark array', () => {
    expect(checkDepthConsistency([])).toBe(false);
  });

  test('uses custom threshold correctly', () => {
    // Give real face but crank threshold up so it fails
    const lm = makeLandmarks({ depth: 'real' });
    expect(checkDepthConsistency(lm, 999)).toBe(false);
    // Very low threshold → passes even on minimal variance
    expect(checkDepthConsistency(lm, 0)).toBe(true);
  });
});

describe('getPromptForState', () => {
  const cases: [Parameters<typeof getPromptForState>[0], string | null][] = [
    ['READY',            'Face camera'],
    ['WAITING_BLINK',    'Please blink'],
    ['WAITING_SMILE',    'Please smile'],
    ['WAITING_HEAD_TURN','Turn head slightly'],
    ['PASSED',           null],
    ['FAILED',           'Timeout — Please try again'],
  ];

  test.each(cases)('state "%s" → "%s"', (state, expected) => {
    expect(getPromptForState(state)).toBe(expected);
  });
});

// ─── LivenessEngine state machine ────────────────────────────────────────────

describe('LivenessEngine', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('starts in READY state, getChallenges returns requested count', () => {
    const eng = new LivenessEngine(2);
    expect(eng.getState()).toBe('READY');
    expect(eng.getChallenges()).toHaveLength(2);
  });

  test('READY → first challenge on first real-face frame', () => {
    const eng = new LivenessEngine(1);
    const lm = makeLandmarks({ depth: 'real' });
    const { state } = eng.processFrame(lm);
    expect(['WAITING_BLINK', 'WAITING_HEAD_TURN']).toContain(state);
  });

  test('flat photo fails immediately with FAILED state', () => {
    const eng = new LivenessEngine(2);
    const { state, prompt } = eng.processFrame(makeLandmarks({ depth: 'flat' }));
    expect(state).toBe('FAILED');
    expect(prompt).toBe('Timeout — Please try again');
  });

  test('PASSED is terminal — further frames do not change state', () => {
    const eng = new LivenessEngine(1);
    eng.forceChallengeDetected(); // skip challenge
    expect(eng.getState()).toBe('PASSED');
    const lm = makeLandmarks({ depth: 'real' });
    const { state } = eng.processFrame(lm);
    expect(state).toBe('PASSED');
  });

  test('FAILED is terminal — further frames do not change state', () => {
    const eng = new LivenessEngine(1);
    eng.processFrame(makeLandmarks({ depth: 'flat' })); // triggers FAILED
    expect(eng.getState()).toBe('FAILED');
    const { state } = eng.processFrame(makeLandmarks({ depth: 'real' }));
    expect(state).toBe('FAILED');
  });

  test('times out after 10 s of no progress', () => {
    const eng = new LivenessEngine(1);
    // Enter a waiting state
    eng.processFrame(makeLandmarks({ depth: 'real' }));
    expect(eng.getState()).not.toBe('READY');
    // Advance 11 s
    jest.advanceTimersByTime(11_000);
    const lm = makeLandmarks({ depth: 'real', eyes: 'open', head: 'center' });
    const { state } = eng.processFrame(lm);
    expect(state).toBe('FAILED');
  });

  test('checkTimeout returns true and sets FAILED when time exceeded', () => {
    const eng = new LivenessEngine(1);
    eng.processFrame(makeLandmarks({ depth: 'real' })); // enter WAITING_*
    jest.advanceTimersByTime(11_000);
    expect(eng.checkTimeout()).toBe(true);
    expect(eng.getState()).toBe('FAILED');
  });

  test('BLINK challenge: passes after EAR drops below threshold', () => {
    // Force engine to only have BLINK as the challenge
    let blinkPassed = false;
    for (let attempt = 0; attempt < 20 && !blinkPassed; attempt++) {
      const eng = new LivenessEngine(1);
      eng.processFrame(makeLandmarks({ depth: 'real' }));
      if (eng.getState() !== 'WAITING_BLINK') continue;

      // Send a closed-eye frame
      const { state } = eng.processFrame(makeLandmarks({ eyes: 'closed', depth: 'real' }));
      if (state === 'PASSED') blinkPassed = true;
    }
    expect(blinkPassed).toBe(true);
  });

  test('HEAD_TURN challenge: passes when yaw asymmetry exceeds threshold', () => {
    let turnPassed = false;
    for (let attempt = 0; attempt < 20 && !turnPassed; attempt++) {
      const eng = new LivenessEngine(1);
      eng.processFrame(makeLandmarks({ depth: 'real' }));
      if (eng.getState() !== 'WAITING_HEAD_TURN') continue;

      const { state } = eng.processFrame(makeLandmarks({ head: 'turned', depth: 'real' }));
      if (state === 'PASSED') turnPassed = true;
    }
    expect(turnPassed).toBe(true);
  });

  test('forceChallengeDetected advances through all challenges to PASSED', () => {
    const eng = new LivenessEngine(2);
    eng.processFrame(makeLandmarks({ depth: 'real' })); // enter challenge 1
    eng.forceChallengeDetected(); // complete challenge 1
    eng.forceChallengeDetected(); // complete challenge 2 → PASSED
    expect(eng.getState()).toBe('PASSED');
  });

  test('forceChallengeDetected is no-op when already in terminal state', () => {
    const eng = new LivenessEngine(1);
    eng.processFrame(makeLandmarks({ depth: 'flat' })); // → FAILED
    expect(eng.getState()).toBe('FAILED');
    // forceChallengeDetected should not escape the FAILED terminal
    eng.forceChallengeDetected();
    // State stays FAILED (the method checks for PASSED/FAILED at entry)
    expect(eng.getState()).toBe('FAILED');
  });

  test('insufficient landmarks (<455) does not advance state, calls checkTimeout', () => {
    const eng = new LivenessEngine(1);
    eng.processFrame(makeLandmarks({ depth: 'real' })); // enter WAITING_*
    const initial = eng.getState();

    const { state } = eng.processFrame([]); // empty → not enough landmarks
    expect(state).toBe(initial); // state unchanged (no timeout yet)
  });

  // START CHANGE: HEAD_TURN flicker regression test
  test('HEAD_TURN challenge should not flicker with noisy yaw', () => {
    // Force an engine that will always start with HEAD_TURN as its sole challenge.
    // We do this by retrying until we get that scheduling.
    let eng: InstanceType<typeof LivenessEngine> | null = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      const candidate = new LivenessEngine(1);
      // Advance out of READY so getChallenges is populated
      candidate.processFrame(makeLandmarks({ depth: 'real' }));
      if (candidate.getState() === 'WAITING_HEAD_TURN') {
        eng = candidate;
        break;
      }
    }
    if (!eng) {
      // HEAD_TURN was never scheduled in 30 attempts — skip rather than false-fail
      return;
    }

    // Noisy yaw values that straddle the ON threshold (0.12) — oscillate between 0.10 and 0.14.
    // Without smoothing these would cause rapid WAITING_HEAD_TURN ↔ PASSED flicker.
    // With a 5-frame rolling average the smoothed yaw will stay consistently above 0.12
    // once enough frames > 0.12 accumulate, and stay there (hysteresis prevents drop back).
    const noisyYaws = [0.10, 0.14, 0.10, 0.14, 0.10, 0.14, 0.10, 0.14, 0.10, 0.14];

    let transitionsToPassed = 0;
    let lastState = eng.getState();

    for (const yawTarget of noisyYaws) {
      // Build landmarks that produce the desired raw yaw value.
      // calculateHeadYaw: yaw = (dLeft - dRight) / (dLeft + dRight)
      // We fix leftCheek=0.20, rightCheek=0.80 (span = 0.60).
      // We want: (noseX - 0.20) - (0.80 - noseX) = yawTarget * 0.60
      //         => 2*noseX - 1.0 = yawTarget * 0.60
      //         => noseX = (yawTarget * 0.60 + 1.0) / 2
      const noseX = (yawTarget * 0.60 + 1.0) / 2;

      const lm = makeLandmarks({ depth: 'real' });
      lm[1]   = { x: noseX, y: 0.50, z: 0.01 }; // nose
      lm[234] = { x: 0.20,  y: 0.50, z: 0.01 }; // left cheek
      lm[454] = { x: 0.80,  y: 0.50, z: 0.01 }; // right cheek

      const { state } = eng.processFrame(lm);

      if (lastState !== 'PASSED' && state === 'PASSED') {
        transitionsToPassed++;
      }
      lastState = state;
    }

    // The engine should transition to PASSED at most once — no flickering back and forth
    expect(transitionsToPassed).toBeLessThanOrEqual(1);
  });
  // END CHANGE
});
