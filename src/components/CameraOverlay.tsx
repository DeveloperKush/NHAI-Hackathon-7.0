import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Animated, Dimensions, SafeAreaView } from 'react-native';
import { Camera, CameraType } from 'expo-camera';

export interface CameraOverlayProps {
  cameraRef: React.RefObject<any>;
  status: 'idle' | 'scanning' | 'liveness' | 'matching' | 'authenticated' | 'failed';
  children?: React.ReactNode;
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function CameraOverlay({ cameraRef, status, children }: CameraOverlayProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Determine border color based on status
  let borderColor = '#1a237e'; // default navy
  if (status === 'authenticated') {
    borderColor = '#4caf50'; // green
  } else if (status === 'failed') {
    borderColor = '#f44336'; // red
  }

  // Pulsing animation for scanning/liveness/matching states
  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;

    if (status === 'scanning' || status === 'liveness' || status === 'matching') {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 800,
            useNativeDriver: false,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 800,
            useNativeDriver: false,
          }),
        ])
      );
      animation.start();
    } else {
      pulseAnim.setValue(1);
    }

    return () => {
      if (animation) {
        animation.stop();
      }
    };
  }, [status]);

  // Calculate cutout layout
  const cutoutWidth = screenWidth * 0.75;
  const cutoutHeight = cutoutWidth * (4 / 3); // 3:4 aspect ratio
  const topOffset = (screenHeight - cutoutHeight) / 2;
  const leftOffset = (screenWidth - cutoutWidth) / 2;

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFillObject}
        type={CameraType.front}
      />

      {/* Semi-transparent Overlay with Cutout */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
        {/* Top block */}
        <View style={[styles.overlayBlock, { height: topOffset, width: screenWidth }]} />

        {/* Middle row */}
        <View style={{ height: cutoutHeight, flexDirection: 'row', width: screenWidth }}>
          {/* Left block */}
          <View style={[styles.overlayBlock, { width: leftOffset, height: cutoutHeight }]} />

          {/* Transparent Cutout & Borders */}
          <View style={{ width: cutoutWidth, height: cutoutHeight, position: 'relative' }}>
            {/* Animated pulsing border */}
            <Animated.View
              style={[
                styles.borderBox,
                {
                  borderColor: borderColor,
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            />
          </View>

          {/* Right block */}
          <View style={[styles.overlayBlock, { width: leftOffset, height: cutoutHeight }]} />
        </View>

        {/* Bottom block */}
        <View style={[styles.overlayBlock, { flex: 1, width: screenWidth }]} />
      </View>

      {/* Children inside safe area */}
      <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  overlayBlock: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  borderBox: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    borderWidth: 4,
  },
  safeArea: {
    ...StyleSheet.absoluteFillObject,
  },
});
