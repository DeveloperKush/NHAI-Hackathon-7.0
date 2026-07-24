import { Challenge, EAR_THRESHOLD, HEAD_YAW_THRESHOLD } from '../../constants/liveness';

// START CHANGE: yaw smoothing constants
const YAW_WINDOW = 5;
// Hysteresis thresholds: require a higher value to trigger, lower to un-trigger
const HEAD_TURN_ON_THRESHOLD  = 0.12; // must exceed this to detect a turn
const HEAD_TURN_OFF_THRESHOLD = 0.09; // must drop below this to un-detect
// END CHANGE

export type LivenessState = 'READY' | 'WAITING_BLINK' | 'WAITING_SMILE' | 'WAITING_HEAD_TURN' | 'PASSED' | 'FAILED';

const IS_TEST = typeof (global as any).jest !== 'undefined' || process.env.NODE_ENV === 'test';

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

// Helper function to calculate Euclidean distance between two 3D points
function dist(pA: Landmark, pB: Landmark): number {
  return Math.sqrt(
    Math.pow(pA.x - pB.x, 2) +
    Math.pow(pA.y - pB.y, 2) +
    Math.pow(pA.z - pB.z, 2)
  );
}

/**
 * Calculates Eye Aspect Ratio (EAR) for left and right eyes and averages them.
 * Formula: (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
 */
export function calculateEAR(leftEye: Landmark[], rightEye: Landmark[]): number {
  const getEyeEAR = (eye: Landmark[]): number => {
    if (eye.length < 6) return 0;
    const p1 = eye[0];
    const p2 = eye[1];
    const p3 = eye[2];
    const p4 = eye[3];
    const p5 = eye[4];
    const p6 = eye[5];

    const num = dist(p2, p6) + dist(p3, p5);
    const den = 2 * dist(p1, p4);

    return den === 0 ? 0 : num / den;
  };

  return (getEyeEAR(leftEye) + getEyeEAR(rightEye)) / 2;
}

/**
 * Calculates horizontal head yaw asymmetry based on nose and cheek positions.
 * Returns a signed float: negative = turned left, positive = turned right.
 * Formula: (dRight - dLeft) / (dLeft + dRight)
 *
 * When the nose moves RIGHT, it gets closer to the right cheek (dRight shrinks)
 * and farther from the left cheek (dLeft grows) → positive value = right turn.
 * When the nose moves LEFT, dLeft shrinks and dRight grows → negative = left turn.
 */
// START CHANGE: fixed sign convention — left negative, right positive
export function calculateHeadYaw(
  nose: Landmark,
  leftCheek: Landmark,
  rightCheek: Landmark
): number {
  const dLeft  = Math.abs(nose.x - leftCheek.x);
  const dRight = Math.abs(nose.x - rightCheek.x);
  const sum = dLeft + dRight;
  // positive → nose closer to right cheek (right turn)
  // negative → nose closer to left cheek  (left turn)
  return sum === 0 ? 0 : (dLeft - dRight) / sum;
}
// END CHANGE

/**
 * Checks passive 3D depth consistency by analyzing standard deviation of z-coordinates.
 * A flat photo spoof will have z-coordinates close to 0, hence low standard deviation.
 */
export function checkDepthConsistency(
  landmarks: Landmark[],
  threshold: number = 0.001
): boolean {
  if (landmarks.length === 0) return false;
  const n = landmarks.length;
  const zs = landmarks.map(l => l.z);
  const mean = zs.reduce((sum, z) => sum + z, 0) / n;
  const variance = zs.reduce((sum, z) => sum + Math.pow(z - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  return stdDev > threshold;
}

/**
 * Returns prompt string corresponding to a given LivenessState.
 */
export function getPromptForState(state: LivenessState): string | null {
  switch (state) {
    case 'READY':
      return 'Face camera';
    case 'WAITING_BLINK':
      return 'Please blink';
    case 'WAITING_SMILE':
      return 'Please smile';
    case 'WAITING_HEAD_TURN':
      return 'Turn head slightly';
    case 'PASSED':
      return null;
    case 'FAILED':
      return 'Timeout — Please try again';
    default:
      return null;
  }
}

/**
 * State machine managing facial liveness detection challenges.
 */
export class LivenessEngine {
  private requiredChallenges: number;
  private challenges: Challenge[] = [];
  private currentChallengeIndex: number = 0;
  private state: LivenessState = 'READY';
  private consecutiveBlinkFrames: number = 0;
  private consecutiveHeadTurnFrames: number = 0;
  private challengeStartTime: number | null = null;
  // START CHANGE: yaw smoothing state
  private yawHistory: number[] = [];
  private headTurnDetected: boolean = false;
  // END CHANGE

  constructor(requiredChallenges: number = 2) {
    this.requiredChallenges = requiredChallenges;
    this.resetChallenges();
  }

  /**
   * Shuffles the challenges array and picks the subset to use.
   */
  private resetChallenges(): void {
    // HACKATHON: smile challenge unreliable on WebView MediaPipe — blink + head turn only
    const allChallenges = [Challenge.BLINK, Challenge.HEAD_TURN];
    // Fisher-Yates or simple sort shuffle
    const shuffled = [...allChallenges].sort(() => Math.random() - 0.5);
    const count = Math.min(this.requiredChallenges, shuffled.length);
    this.challenges = shuffled.slice(0, count);
    this.currentChallengeIndex = 0;
    this.state = 'READY';
    this.consecutiveBlinkFrames = 0;
    this.consecutiveHeadTurnFrames = 0;
    this.challengeStartTime = null;
    // START CHANGE: reset yaw smoother
    this.yawHistory = [];
    this.headTurnDetected = false;
    // END CHANGE
  }

  /**
   * Processes a single video frame containing face mesh landmarks.
   */
  public processFrame(landmarks: Landmark[]): { state: LivenessState; prompt: string | null } {
    // If already in terminal states, do not process
    if (this.state === 'PASSED' || this.state === 'FAILED') {
      return { state: this.state, prompt: getPromptForState(this.state) };
    }

    // Face detection check: requires enough landmarks (right cheek is index 454)
    if (!landmarks || landmarks.length < 455) {
      this.checkTimeout();
      return { state: this.state, prompt: getPromptForState(this.state) };
    }

    // Passive 3D depth check runs on EVERY frame regardless of state
    if (!checkDepthConsistency(landmarks)) {
      this.state = 'FAILED';
      this.challengeStartTime = null;
      return { state: this.state, prompt: getPromptForState(this.state) };
    }

    // State transition from READY to first challenge
    if (this.state === 'READY') {
      if (this.challenges.length === 0) {
        this.state = 'PASSED';
        return { state: this.state, prompt: getPromptForState(this.state) };
      }
      this.transitionToChallenge(0);
    }

    // Check timeout for the active challenge
    if (this.checkTimeout()) {
      return { state: this.state, prompt: getPromptForState(this.state) };
    }

    // Calculate features for debugging and checking
    const leftEye = [33, 160, 158, 133, 153, 144].map(idx => landmarks[idx]);
    const rightEye = [362, 385, 387, 263, 380, 373].map(idx => landmarks[idx]);
    const ear = calculateEAR(leftEye, rightEye);

    const nose = landmarks[1];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];
    const yaw = calculateHeadYaw(nose, leftCheek, rightCheek);

    // START CHANGE: rolling average smoothing for yaw
    this.yawHistory.push(yaw);
    if (this.yawHistory.length > YAW_WINDOW) {
      this.yawHistory.shift();
    }
    const smoothedYaw = this.yawHistory.reduce((sum, v) => sum + v, 0) / this.yawHistory.length;
    // END CHANGE

    // Debug log
    if (!IS_TEST) {
      console.log(
        '[Liveness]',
        this.state,
        'EAR=' + ear.toFixed(3),
        'yaw=' + yaw.toFixed(3),
        'smoothedYaw=' + smoothedYaw.toFixed(3)  // START CHANGE
      );
    }

    // Evaluate current challenge condition
    const currentChallenge = this.challenges[this.currentChallengeIndex];
    let passedCurrent = false;

    if (currentChallenge === Challenge.BLINK) {
      if (ear < EAR_THRESHOLD) {
        this.consecutiveBlinkFrames++;
      } else {
        this.consecutiveBlinkFrames = 0;
      }
      // HACKATHON: landmarks are sampled ~every 300ms; require 1 hit to avoid missing blinks
      if (this.consecutiveBlinkFrames >= 1) {
        passedCurrent = true;
      }
    } else if (currentChallenge === Challenge.HEAD_TURN) {
      // START CHANGE: hysteresis on smoothed yaw to prevent flicker
      const absSmoothedYaw = Math.abs(smoothedYaw);
      if (!this.headTurnDetected) {
        // Require smoothedYaw to exceed the ON threshold to trigger
        if (absSmoothedYaw > HEAD_TURN_ON_THRESHOLD) {
          this.headTurnDetected = true;
          this.consecutiveHeadTurnFrames++;
        } else {
          this.consecutiveHeadTurnFrames = 0;
        }
      } else {
        // Once triggered, only un-trigger if smoothedYaw drops below the OFF threshold
        if (absSmoothedYaw >= HEAD_TURN_OFF_THRESHOLD) {
          this.consecutiveHeadTurnFrames++;
        } else {
          // Hysteresis gap crossed — reset detection
          this.headTurnDetected = false;
          this.consecutiveHeadTurnFrames = 0;
        }
      }
      if (this.consecutiveHeadTurnFrames >= 1) {
        passedCurrent = true;
      }
      // END CHANGE
    }

    if (passedCurrent) {
      this.currentChallengeIndex++;
      if (this.currentChallengeIndex >= this.challenges.length) {
        this.state = 'PASSED';
        this.challengeStartTime = null;
      } else {
        this.transitionToChallenge(this.currentChallengeIndex);
      }
    }

    return { state: this.state, prompt: getPromptForState(this.state) };
  }

  /**
   * Sets up the state and timers for a given challenge index.
   */
  private transitionToChallenge(index: number): void {
    this.currentChallengeIndex = index;
    const challenge = this.challenges[index];
    this.consecutiveBlinkFrames = 0;
    this.consecutiveHeadTurnFrames = 0;
    this.challengeStartTime = Date.now();
    // START CHANGE: reset yaw smoother when entering a new challenge
    this.yawHistory = [];
    this.headTurnDetected = false;
    // END CHANGE

    if (challenge === Challenge.BLINK) {
      this.state = 'WAITING_BLINK';
    } else if (challenge === Challenge.HEAD_TURN) {
      this.state = 'WAITING_HEAD_TURN';
    }
  }

  /**
   * Checks if the active challenge has exceeded the 10-second timeout.
   * Returns true if it timed out (and transitions state to FAILED).
   */
  public checkTimeout(): boolean {
    if (
      this.state !== 'READY' &&
      this.state !== 'PASSED' &&
      this.state !== 'FAILED' &&
      this.challengeStartTime !== null
    ) {
      if (Date.now() - this.challengeStartTime > 10000) {
        this.state = 'FAILED';
        this.challengeStartTime = null;
        return true;
      }
    }
    return false;
  }

  /**
   * Forces the current challenge to be marked as passed (for demo purposes).
   */
  public forceChallengeDetected(): void {
    if (this.state === 'PASSED' || this.state === 'FAILED') {
      return;
    }
    this.currentChallengeIndex++;
    if (this.currentChallengeIndex >= this.challenges.length) {
      this.state = 'PASSED';
      this.challengeStartTime = null;
    } else {
      this.transitionToChallenge(this.currentChallengeIndex);
    }
  }

  /**
   * Expose current challenges list for testing purposes.
   */
  public getChallenges(): Challenge[] {
    return this.challenges;
  }

  /**
   * Expose current state for testing purposes.
   */
  public getState(): LivenessState {
    return this.state;
  }
}
