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
import { SIMILARITY_THRESHOLD } from '../constants/config';

export default function FaceAuthenticator({
  onAuthSuccess,
  onLivenessFailed,
  onEnrollmentRequired,
  similarityThreshold = SIMILARITY_THRESHOLD,
}: FaceAuthenticatorProps) {
  const cameraRef = useRef<any>(null);
  const IS_TEST = typeof (global as any).jest !== 'undefined' || process.env.NODE_ENV === 'test';
  const [webViewReady, setWebViewReady] = useState(IS_TEST);
  const authStartedRef = useRef(false);
  const [showBypass, setShowBypass] = useState(false);
  const [showAnalyzingWarning, setShowAnalyzingWarning] = useState(false);

  const { status, logData, error, prompt, startAuth, reset, forceChallenge } = useAuth(cameraRef, {
    similarityThreshold,
    onAuthSuccess,
    onLivenessFailed,
    onEnrollmentRequired,
  });

  // Track time spent in liveness challenge to show bypass option after 3 seconds
  useEffect(() => {
    if (
      status === 'liveness' &&
      prompt &&
      (prompt === 'Please blink' ||
        prompt === 'Please smile' ||
        prompt === 'Turn head slightly')
    ) {
      setShowBypass(false);
      const timer = setTimeout(() => {
        setShowBypass(true);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setShowBypass(false);
    }
  }, [status, prompt]);

  const handleBypass = () => {
    forceChallenge();
    setShowBypass(false);
  };

  // Track time spent in liveness challenge to show analyzing warning after 5 seconds
  useEffect(() => {
    if (status === 'liveness') {
      setShowAnalyzingWarning(false);
      const timer = setTimeout(() => {
        setShowAnalyzingWarning(true);
      }, 5000);
      return () => clearTimeout(timer);
    } else {
      setShowAnalyzingWarning(false);
    }
  }, [status]);

  // Register callback so auth starts only after MediaPipe WebView is ready
  useEffect(() => {
    setOnWebViewReady(() => {
      setWebViewReady(true);
    });
  }, []);

  // Start auth once WebView is ready (fires exactly once per mount)
  useEffect(() => {
    if (webViewReady && !authStartedRef.current) {
      authStartedRef.current = true;
      startAuth(true);
    }
  }, [webViewReady]);



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

  // Map state to bottom status pill text
  let statusText = 'Ready';
  if (status === 'scanning') {
    statusText = 'Hold still…';
  } else if (status === 'liveness') {
    statusText = 'Liveness Check';
  } else if (status === 'matching') {
    statusText = 'Matching…';
  } else if (status === 'authenticated') {
    statusText = 'Authenticated';
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

        {status === 'liveness' && showAnalyzingWarning && (
          <View style={styles.analyzingBanner} testID="analyzing-banner">
            <Text style={styles.analyzingText}>Hold still, analyzing...</Text>
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
          {status === 'liveness' && showBypass && (
            <TouchableOpacity style={styles.bypassButton} onPress={handleBypass} testID="bypass-button">
              <Text style={styles.bypassText}>Tap here if detection is slow</Text>
            </TouchableOpacity>
          )}

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
  bypassButton: {
    backgroundColor: '#ff9800', // Warning orange
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
  },
  bypassText: {
    color: '#ffffff',
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
