export enum Challenge {
  BLINK = 'BLINK',
  SMILE = 'SMILE',
  HEAD_TURN = 'HEAD_TURN',
}

export const EAR_LANDMARKS = {
  leftEye: [159, 145] as const,
  rightEye: [386, 374] as const,
};

export const MAR_INDICES = [61, 291, 13, 14] as const;

export const LIVENESS_THRESHOLDS = {
  // HACKATHON: raise threshold so blinks register on low FPS landmark sampling
  EAR: 0.33,
  MAR: 0.5,
  headYaw: 0.12,
};

// Individual thresholds for direct convenience imports
// HACKATHON: EAR in logs was ~0.30–0.33 while user blinking; allow slightly higher cutoff
export const EAR_THRESHOLD = 0.33;
export const MAR_THRESHOLD = 0.5;
export const HEAD_YAW_THRESHOLD = 0.12;
export const SMILE_THRESHOLD = 0.25;
