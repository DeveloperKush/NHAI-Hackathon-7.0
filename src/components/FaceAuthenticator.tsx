import React, { useEffect, useRef, useState, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FaceAuthenticatorProps } from '../types';
import { useAuth } from '../hooks/useAuth';
import CameraOverlay from './CameraOverlay';
import LivenessFeedback from './LivenessFeedback';
import {
  setOnWebViewReady,
} from '../services/ai/mediapipeLandmarks';
import { SIMILARITY_THRESHOLD, DEMO_MODE } from '../constants/config';

export default function FaceAuthenticator({
  onAuthSuccess,
  onLivenessFailed,
  onEnrollmentRequired,
  similarityThreshold = SIMILARITY_THRESHOLD,
  autoStart = true,
  startTrigger = 0,
}: FaceAuthenticatorProps) {
  const cameraRef = useRef<any>(null);
  const IS_TEST = typeof (global as any).jest !== 'undefined' || process.env.NODE_ENV === 'test';
  const [webViewReady, setWebViewReady] = useState(IS_TEST);
  const authStartedRef = useRef(false);
  const [showAnalyzingWarning, setShowAnalyzingWarning] = useState(false);

  const { status, logData, error, prompt, startAuth, reset } = useAuth(cameraRef, {
    similarityThreshold,
    onAuthSuccess,
    onLivenessFailed,
    onEnrollmentRequired,
  });



  // Show "analyzing" only during matching (not during liveness prompts)
  useEffect(() => {
    if (status === 'matching') {
      setShowAnalyzingWarning(false);
      const timer = setTimeout(() => {
        setShowAnalyzingWarning(true);
      }, 800);
      return () => clearTimeout(timer);
    }
    setShowAnalyzingWarning(false);
  }, [status]);

  // Register callback so auth starts only after MediaPipe WebView is ready
  useEffect(() => {
    setOnWebViewReady(() => {
      setWebViewReady(true);
    });
  }, []);

  // Start auth once WebView is ready — brief delay so Camera is running after navigation
  useEffect(() => {
    if (autoStart && webViewReady && !authStartedRef.current) {
      authStartedRef.current = true;
      const timer = setTimeout(() => {
        startAuth(true);
      }, IS_TEST ? 0 : 600);
      return () => clearTimeout(timer);
    }
  }, [webViewReady, autoStart]);

  // Handle manual start/trigger from parent
  useEffect(() => {
    if (!autoStart && startTrigger > 0 && webViewReady) {
      if (cameraRef.current) {
        authStartedRef.current = true;
        reset();
        const timer = setTimeout(() => {
          startAuth(true);
        }, 50);
        return () => clearTimeout(timer);
      } else {
        console.warn('Camera is not ready yet.');
      }
    }
  }, [startTrigger, webViewReady, autoStart]);



  // Haptic feedback logic
  // 1. Light haptic on challenge change (prompt changes)
  useEffect(() => {
    if (prompt) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, [prompt]);

  // 2. Heavy haptic on authentication success
  useEffect(() => {
    if (status === 'authenticated') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }
  }, [status]);

  // 3. Error notification feedback on failure
  useEffect(() => {
    if (status === 'failed') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  }, [status]);

  // Map state + liveness prompt to bottom status pill text
  let statusText = 'Ready';
  if (status === 'scanning') {
    statusText = 'Hold still…';
  } else if (status === 'liveness') {
    // Show actual challenge instruction directly in the pill
    statusText = prompt || 'Liveness Check';
  } else if (status === 'matching') {
    statusText = 'Matching…';
  } else if (status === 'authenticated') {
    statusText = logData ? `Welcome back, ${logData.user_id}` : 'Authenticated';
  } else if (status === 'failed') {
    statusText = 'Failed';
  }

  // Handle manual retry on failure
  const handleRetry = () => {
    authStartedRef.current = false;
    reset();
    // WebView stays mounted and MediaPipe stays ready — start auth directly
    startAuth(true);
  };

  return (
    <View style={styles.container}>
      <CameraOverlay cameraRef={cameraRef} status={status}>
        {/* Liveness & Error Feedback Banners */}
        {status === 'liveness' && prompt && (
          <LivenessFeedback
            message={prompt}
            type="warning"
            onDismiss={() => {}}
          />
        )}

        {status === 'matching' && showAnalyzingWarning && (
          <View style={styles.analyzingBanner} testID="analyzing-banner">
            <Text style={styles.analyzingText}>Analyzing…</Text>
          </View>
        )}

        {status === 'authenticated' && (
          <LivenessFeedback
            message="Verification Successful"
            type="success"
            onDismiss={() => {}}
          />
        )}



        {status === 'failed' && error && (
          <LivenessFeedback
            message={error.message}
            type="error"
            onDismiss={handleRetry}
          />
        )}

        {/* Bottom Status Pill */}
        <View style={styles.pillContainer} pointerEvents="box-none">


          <View style={styles.statusPill} testID="status-pill">
            <Text style={styles.statusText}>{statusText}</Text>
          </View>

          {status === 'failed' && (
            <TouchableOpacity style={styles.retryButton} onPress={handleRetry} testID="retry-button">
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      </CameraOverlay>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  pillContainer: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  statusPill: {
    backgroundColor: '#1a237e', // Primary Navy
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
  },
  statusText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#f5f5f5', // Surface grey
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#757575',
  },
  retryText: {
    color: '#212121', // Text Primary
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
  },

  analyzingBanner: {
    position: 'absolute',
    top: 130, // rendered below the main liveness feedback banner (top: 40)
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  analyzingText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
  },
});
