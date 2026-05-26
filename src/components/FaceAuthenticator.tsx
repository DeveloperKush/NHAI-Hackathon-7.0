import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FaceAuthenticatorProps } from '../types';
import { useAuth } from '../hooks/useAuth';
import CameraOverlay from './CameraOverlay';
import LivenessFeedback from './LivenessFeedback';

export default function FaceAuthenticator({
  onAuthSuccess,
  onLivenessFailed,
  onEnrollmentRequired,
  similarityThreshold = 0.6,
}: FaceAuthenticatorProps) {
  const cameraRef = useRef<any>(null);

  const { status, logData, error, prompt, startAuth, reset } = useAuth(cameraRef, {
    similarityThreshold,
    onAuthSuccess,
    onLivenessFailed,
    onEnrollmentRequired,
  });

  // Start authentication flow automatically on mount
  useEffect(() => {
    startAuth(true);
  }, []);

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
    reset();
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
