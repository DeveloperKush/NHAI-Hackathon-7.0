import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export interface LivenessFeedbackProps {
  message: string;
  type: 'success' | 'error' | 'warning';
  onDismiss?: () => void;
}

export default function LivenessFeedback({ message, type, onDismiss }: LivenessFeedbackProps) {
  // Auto-dismiss success after 1.5s
  useEffect(() => {
    if (type === 'success' && onDismiss) {
      const timer = setTimeout(() => {
        onDismiss();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [type, onDismiss]);

  const handlePress = () => {
    if (type === 'error' && onDismiss) {
      onDismiss();
    }
  };

  // Determine background color based on type
  let backgroundColor = '#ff9800'; // default warning
  if (type === 'success') {
    backgroundColor = '#4caf50';
  } else if (type === 'error') {
    backgroundColor = '#f44336';
  }

  return (
    <TouchableOpacity
      activeOpacity={type === 'error' ? 0.8 : 1}
      onPress={handlePress}
      style={[styles.banner, { backgroundColor }]}
      testID="liveness-feedback-banner"
    >
      <View style={styles.content}>
        <Text style={styles.primaryText}>{message}</Text>
        {type === 'error' && (
          <Text style={styles.secondaryText}>Tap to dismiss</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 40, // offset below notches/safe-area if not wrapped in SafeAreaView, but it will be within CameraOverlay which has SafeAreaView, or inside SafeAreaView of FaceAuthenticator. Let's make it top: 20 or similar so it fits nicely.
    left: 20,
    right: 20,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#ffffff',
    fontFamily: 'System', // bold sans-serif
    fontWeight: 'bold',
    fontSize: 20, // 18-20pt
    textAlign: 'center',
  },
  secondaryText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontFamily: 'System',
    fontSize: 14, // 14pt
    marginTop: 4,
    textAlign: 'center',
  },
});
