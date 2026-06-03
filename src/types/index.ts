export interface AuthLog {
  log_id: string;
  user_id: string;
  timestamp: string; // ISO8601 format
  gps_lat: number | null;
  gps_lng: number | null;
  device_id: string;
  similarity_score: number;
  photo_thumb: string; // base64 JPEG
}

export type LivenessErrorCode = 'TIMEOUT' | 'SPOOF_DETECTED' | 'NO_FACE_DETECTED';

export interface LivenessError {
  code: LivenessErrorCode;
  message: string;
}

export interface FaceAuthenticatorProps {
  onAuthSuccess: (log: AuthLog) => void;
  onLivenessFailed: (err: LivenessError) => void;
  onEnrollmentRequired: () => void;
  similarityThreshold?: number; // default 0.6
  autoStart?: boolean;
  startTrigger?: number;
}
