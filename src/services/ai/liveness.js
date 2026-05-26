"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LivenessEngine = void 0;
exports.calculateEAR = calculateEAR;
exports.calculateMAR = calculateMAR;
exports.calculateHeadYaw = calculateHeadYaw;
exports.checkDepthConsistency = checkDepthConsistency;
exports.getPromptForState = getPromptForState;
const liveness_1 = require("../../constants/liveness");
// Helper function to calculate Euclidean distance between two 3D points
function dist(pA, pB) {
    return Math.sqrt(Math.pow(pA.x - pB.x, 2) +
        Math.pow(pA.y - pB.y, 2) +
        Math.pow(pA.z - pB.z, 2));
}
/**
 * Calculates Eye Aspect Ratio (EAR) for left and right eyes and averages them.
 * Formula: (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
 */
function calculateEAR(leftEye, rightEye) {
    const getEyeEAR = (eye) => {
        if (eye.length < 6)
            return 0;
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
 * Calculates Mouth Aspect Ratio (MAR) using lips coordinates.
 * Formula: |top-bottom| / |left-right|
 */
function calculateMAR(lips) {
    if (lips.length < 4)
        return 0;
    const left = lips[0];
    const right = lips[1];
    const top = lips[2];
    const bottom = lips[3];
    const num = dist(top, bottom);
    const den = dist(left, right);
    return den === 0 ? 0 : num / den;
}
/**
 * Calculates horizontal head yaw asymmetry based on nose and cheek positions.
 * Formula: (dLeft - dRight) / (dLeft + dRight)
 */
function calculateHeadYaw(nose, leftCheek, rightCheek) {
    const dLeft = Math.abs(nose.x - leftCheek.x);
    const dRight = Math.abs(nose.x - rightCheek.x);
    const sum = dLeft + dRight;
    return sum === 0 ? 0 : (dLeft - dRight) / sum;
}
/**
 * Checks passive 3D depth consistency by analyzing standard deviation of z-coordinates.
 * A flat photo spoof will have z-coordinates close to 0, hence low standard deviation.
 */
function checkDepthConsistency(landmarks, threshold = 0.002) {
    if (landmarks.length === 0)
        return false;
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
function getPromptForState(state) {
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
class LivenessEngine {
    requiredChallenges;
    challenges = [];
    currentChallengeIndex = 0;
    state = 'READY';
    consecutiveBlinkFrames = 0;
    challengeStartTime = null;
    constructor(requiredChallenges = 2) {
        this.requiredChallenges = requiredChallenges;
        this.resetChallenges();
    }
    /**
     * Shuffles the challenges array and picks the subset to use.
     */
    resetChallenges() {
        const allChallenges = [liveness_1.Challenge.BLINK, liveness_1.Challenge.SMILE, liveness_1.Challenge.HEAD_TURN];
        // Fisher-Yates or simple sort shuffle
        const shuffled = [...allChallenges].sort(() => Math.random() - 0.5);
        const count = Math.min(this.requiredChallenges, shuffled.length);
        this.challenges = shuffled.slice(0, count);
        this.currentChallengeIndex = 0;
        this.state = 'READY';
        this.consecutiveBlinkFrames = 0;
        this.challengeStartTime = null;
    }
    /**
     * Processes a single video frame containing face mesh landmarks.
     */
    processFrame(landmarks) {
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
        // Evaluate current challenge condition
        const currentChallenge = this.challenges[this.currentChallengeIndex];
        let passedCurrent = false;
        if (currentChallenge === liveness_1.Challenge.BLINK) {
            // Left eye indices: 33, 160, 158, 133, 153, 144
            // Right eye indices: 362, 385, 387, 263, 380, 373
            const leftEye = [33, 160, 158, 133, 153, 144].map(idx => landmarks[idx]);
            const rightEye = [362, 385, 387, 263, 380, 373].map(idx => landmarks[idx]);
            const ear = calculateEAR(leftEye, rightEye);
            if (ear < 0.2) {
                this.consecutiveBlinkFrames++;
            }
            else {
                this.consecutiveBlinkFrames = 0;
            }
            if (this.consecutiveBlinkFrames >= 3) {
                passedCurrent = true;
            }
        }
        else if (currentChallenge === liveness_1.Challenge.SMILE) {
            // Mouth corners and lip centers: 61, 291, 13, 14
            const lips = [61, 291, 13, 14].map(idx => landmarks[idx]);
            const mar = calculateMAR(lips);
            if (mar > 0.6) {
                passedCurrent = true;
            }
        }
        else if (currentChallenge === liveness_1.Challenge.HEAD_TURN) {
            // Nose, left cheek, right cheek: 1, 234, 454
            const nose = landmarks[1];
            const leftCheek = landmarks[234];
            const rightCheek = landmarks[454];
            const yaw = calculateHeadYaw(nose, leftCheek, rightCheek);
            if (Math.abs(yaw) > 0.15) {
                passedCurrent = true;
            }
        }
        if (passedCurrent) {
            this.currentChallengeIndex++;
            if (this.currentChallengeIndex >= this.challenges.length) {
                this.state = 'PASSED';
                this.challengeStartTime = null;
            }
            else {
                this.transitionToChallenge(this.currentChallengeIndex);
            }
        }
        return { state: this.state, prompt: getPromptForState(this.state) };
    }
    /**
     * Sets up the state and timers for a given challenge index.
     */
    transitionToChallenge(index) {
        this.currentChallengeIndex = index;
        const challenge = this.challenges[index];
        this.consecutiveBlinkFrames = 0;
        this.challengeStartTime = Date.now();
        if (challenge === liveness_1.Challenge.BLINK) {
            this.state = 'WAITING_BLINK';
        }
        else if (challenge === liveness_1.Challenge.SMILE) {
            this.state = 'WAITING_SMILE';
        }
        else if (challenge === liveness_1.Challenge.HEAD_TURN) {
            this.state = 'WAITING_HEAD_TURN';
        }
    }
    /**
     * Checks if the active challenge has exceeded the 10-second timeout.
     * Returns true if it timed out (and transitions state to FAILED).
     */
    checkTimeout() {
        if (this.state !== 'READY' &&
            this.state !== 'PASSED' &&
            this.state !== 'FAILED' &&
            this.challengeStartTime !== null) {
            if (Date.now() - this.challengeStartTime > 10000) {
                this.state = 'FAILED';
                this.challengeStartTime = null;
                return true;
            }
        }
        return false;
    }
    /**
     * Expose current challenges list for testing purposes.
     */
    getChallenges() {
        return this.challenges;
    }
    /**
     * Expose current state for testing purposes.
     */
    getState() {
        return this.state;
    }
}
exports.LivenessEngine = LivenessEngine;
