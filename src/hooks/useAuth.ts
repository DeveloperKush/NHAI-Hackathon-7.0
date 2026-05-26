import { useState, useRef, useEffect } from 'react';
import { AuthLog, LivenessError, LivenessErrorCode } from '../types';
import { LivenessEngine, checkDepthConsistency } from '../services/ai/liveness';
import { extractEmbedding, findBestMatch, generateDeviceId } from '../services/ai/recognition';
import { insertAuthLog } from '../services/database/authLogs';
import { getAllEnrolledFaces } from '../services/database/enrolledFaces';
import { syncAuthLogs } from '../services/network/awsSync';
import { processCameraFrame, simulateLandmarksFromFrame } from '../services/camera/frameProcessors';
import { REQUIRED_CHALLENGES, SIMILARITY_THRESHOLD } from '../constants/config';
import * as Location from 'expo-location';

export interface UseAuthOptions {
  similarityThreshold?: number;
  requiredChallenges?: number;
  onAuthSuccess?: (log: AuthLog) => void;
  onLivenessFailed?: (err: LivenessError) => void;
  onEnrollmentRequired?: () => void;
}

/**
 * Custom UUID v4 generator for React Native.
 */
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * React Hook orchestrating the entire offline face authentication pipeline.
 * Transitions: idle -> scanning -> liveness -> matching -> authenticated / failed.
 */
export function useAuth(cameraRef: any, options?: UseAuthOptions) {
  const [status, setStatusState] = useState<'idle' | 'scanning' | 'liveness' | 'matching' | 'authenticated' | 'failed'>('idle');
  const [logData, setLogData] = useState<AuthLog | null>(null);
  const [error, setError] = useState<LivenessError | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);

  const statusRef = useRef<any>('idle');
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      statusRef.current = 'idle'; // Cancel loop
    };
  }, []);

  const setStatus = (s: typeof status) => {
    statusRef.current = s;
    if (isMountedRef.current) {
      setStatusState(s);
    }
  };

  const reset = () => {
    setStatus('idle');
    if (isMountedRef.current) {
      setLogData(null);
      setError(null);
      setPrompt(null);
    }
  };

  const startAuth = async (isRealFace: boolean = true) => {
    const currentStatus = statusRef.current;
    if (currentStatus !== 'idle' && currentStatus !== 'failed' && currentStatus !== 'authenticated') {
      return;
    }

    setStatus('scanning');
    if (isMountedRef.current) {
      setLogData(null);
      setError(null);
      setPrompt(null);
    }

    try {
      // Capture the initial frame
      let initialFrame: any;
      try {
        if (cameraRef && cameraRef.current && typeof cameraRef.current.takePictureAsync === 'function') {
          initialFrame = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
        } else {
          initialFrame = { uri: 'mock_uri', width: 640, height: 480, base64: 'mock_base_64_data' };
        }
      } catch (err) {
        initialFrame = { uri: 'mock_uri', width: 640, height: 480, base64: 'mock_base_64_data' };
      }

      if (statusRef.current !== 'scanning') return;

      // Transition to liveness check
      setStatus('liveness');

      const reqChallenges = options?.requiredChallenges ?? REQUIRED_CHALLENGES;
      const livenessEngine = new LivenessEngine(reqChallenges);

      let lastProcessedFrame: Float32Array | null = null;
      let lastFrameBase64: string | null = null;
      let success = false;

      // Pre-run depth check and challenges loop
      while (statusRef.current === 'liveness') {
        const activeState = livenessEngine.getState();

        // Build mock frame props to satisfy active challenges if real face
        const mockFrameProps: any = {};
        if (isRealFace) {
          if (activeState === 'WAITING_BLINK') {
            mockFrameProps.isBlinking = true;
          } else if (activeState === 'WAITING_SMILE') {
            mockFrameProps.isSmiling = true;
          } else if (activeState === 'WAITING_HEAD_TURN') {
            mockFrameProps.isHeadTurned = true;
          }
        }

        // Capture frame in loop
        let frame: any;
        try {
          if (cameraRef && cameraRef.current && typeof cameraRef.current.takePictureAsync === 'function') {
            frame = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
            Object.assign(frame, mockFrameProps);
          } else {
            frame = { uri: 'mock_uri', width: 640, height: 480, base64: 'mock_base_64_data', ...mockFrameProps };
          }
        } catch (err) {
          frame = { uri: 'mock_uri', width: 640, height: 480, base64: 'mock_base_64_data', ...mockFrameProps };
        }

        // Preprocess frame
        lastProcessedFrame = await processCameraFrame(frame);
        lastFrameBase64 = frame.base64 || null;

        // Simulate landmarks
        const landmarks = simulateLandmarksFromFrame(frame, isRealFace);

        // Process landmarks in engine
        const engineRes = livenessEngine.processFrame(landmarks);

        if (isMountedRef.current) {
          setPrompt(engineRes.prompt);
        }

        if (engineRes.state === 'PASSED') {
          success = true;
          break;
        } else if (engineRes.state === 'FAILED') {
          let code: LivenessErrorCode = 'TIMEOUT';
          let message = 'Liveness challenge timed out.';

          if (!checkDepthConsistency(landmarks)) {
            code = 'SPOOF_DETECTED';
            message = 'Spoof detected: 3D depth consistency check failed.';
          }

          const livenessError: LivenessError = { code, message };
          if (isMountedRef.current) {
            setError(livenessError);
            setPrompt(null);
          }
          setStatus('failed');
          if (options?.onLivenessFailed) {
            options.onLivenessFailed(livenessError);
          }
          return;
        }

        // Delay to yield thread
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (!success || statusRef.current !== 'liveness') return;

      // Transition to matching
      setStatus('matching');

      const enrolledFaces = await getAllEnrolledFaces();
      if (enrolledFaces.length === 0) {
        const enrollError: LivenessError = {
          code: 'NO_FACE_DETECTED',
          message: 'No enrolled faces found in local database.',
        };
        if (isMountedRef.current) {
          setError(enrollError);
          setPrompt(null);
        }
        setStatus('failed');
        if (options?.onEnrollmentRequired) {
          options.onEnrollmentRequired();
        }
        return;
      }

      if (!lastProcessedFrame) {
        throw new Error('No preprocessed frame available for face recognition.');
      }

      // Extract embedding
      const embedding = extractEmbedding(lastProcessedFrame);

      // Perform cosine similarity matching
      const threshold = options?.similarityThreshold ?? SIMILARITY_THRESHOLD;
      const bestMatch = findBestMatch(embedding, enrolledFaces);

      if (bestMatch.user_id !== null && bestMatch.score > threshold) {
        // Authenticated!
        // Retrieve geolocation coordinates (best effort)
        let gps_lat: number | null = null;
        let gps_lng: number | null = null;
        try {
          const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
          if (locStatus === 'granted') {
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            gps_lat = loc.coords.latitude;
            gps_lng = loc.coords.longitude;
          }
        } catch (err) {
          console.warn('GPS location request failed:', err);
        }

        const authenticatedLog: AuthLog = {
          log_id: uuidv4(),
          user_id: bestMatch.user_id,
          timestamp: new Date().toISOString(),
          gps_lat,
          gps_lng,
          device_id: generateDeviceId(),
          similarity_score: bestMatch.score,
          photo_thumb: lastFrameBase64 || 'mock_base64_jpeg_thumbnail',
        };

        // Insert auth log locally
        await insertAuthLog(authenticatedLog);

        if (isMountedRef.current) {
          setLogData(authenticatedLog);
        }
        setStatus('authenticated');

        if (options?.onAuthSuccess) {
          options.onAuthSuccess(authenticatedLog);
        }

        // Trigger background sync best-effort
        syncAuthLogs().catch((syncErr) => {
          console.warn('Background logs synchronization failed:', syncErr);
        });
      } else {
        // Match failed
        const matchError: LivenessError = {
          code: 'NO_FACE_DETECTED',
          message: 'Face verification failed: Identity could not be matched.',
        };
        if (isMountedRef.current) {
          setError(matchError);
          setPrompt(null);
        }
        setStatus('failed');
        if (options?.onLivenessFailed) {
          options.onLivenessFailed(matchError);
        }
      }
    } catch (err: any) {
      console.error('Error during authentication pipeline orchestration:', err);
      const pipelineErr: LivenessError = {
        code: 'TIMEOUT',
        message: err?.message || 'Pipeline execution failed.',
      };
      if (isMountedRef.current) {
        setError(pipelineErr);
        setPrompt(null);
      }
      setStatus('failed');
      if (options?.onLivenessFailed) {
        options.onLivenessFailed(pipelineErr);
      }
    }
  };

  return {
    status,
    logData,
    error,
    prompt,
    startAuth,
    reset,
  };
}
