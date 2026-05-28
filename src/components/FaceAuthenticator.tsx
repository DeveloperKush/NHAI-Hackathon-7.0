import React, { useEffect, useRef, useState, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FaceAuthenticatorProps } from '../types';
import { useAuth } from '../hooks/useAuth';
import CameraOverlay from './CameraOverlay';
import LivenessFeedback from './LivenessFeedback';
import { WebView } from 'react-native-webview';
import {
  getMediaPipeHTMLUri,
  MEDIAPIPE_CACHE_DIR,
  setWebViewRef,
  handleWebViewMessage,
  setOnWebViewReady,
} from '../services/ai/mediapipeLandmarks';

export default function FaceAuthenticator({
  onAuthSuccess,
  onLivenessFailed,
  onEnrollmentRequired,
  similarityThreshold = 0.6,
}: FaceAuthenticatorProps) {
  const cameraRef = useRef<any>(null);
  const webViewRef = useRef<any>(null);
  const [webViewReady, setWebViewReady] = useState(false);
  const authStartedRef = useRef(false);

  const { status, logData, error, prompt, startAuth, reset } = useAuth(cameraRef, {
    similarityThreshold,
    onAuthSuccess,
    onLivenessFailed,
    onEnrollmentRequired,
  });

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

  useEffect(() => {
    setWebViewRef(webViewRef.current);
    return () => {
      setWebViewRef(null);
    };
  }, [webViewRef.current]);

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
    statusText = 'Scanning…';
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
      <WebView
        ref={webViewRef}
        style={{ width: 0, height: 0, opacity: 0, position: 'absolute' }}
        originWhitelist={['*', 'file://*']}
        source={{ uri: getMediaPipeHTMLUri() }}
        onMessage={handleWebViewMessage}
        allowFileAccess={true}
        allowFileAccessFromFileURLs={true}
        allowUniversalAccessFromFileURLs={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        mixedContentMode="always"
      />
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
});
