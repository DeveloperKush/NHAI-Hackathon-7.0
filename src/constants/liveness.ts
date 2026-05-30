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
  EAR: 0.3,
  MAR: 0.5,
  headYaw: 0.12,
};

// Individual thresholds for direct convenience imports
export const EAR_THRESHOLD = 0.3;
export const MAR_THRESHOLD = 0.5;
export const HEAD_YAW_THRESHOLD = 0.12;
export const SMILE_THRESHOLD = 0.25;
