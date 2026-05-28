import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Animated, Dimensions, SafeAreaView, ActivityIndicator, Text } from 'react-native';
import { Camera, CameraType } from 'expo-camera';

export interface CameraOverlayProps {
  cameraRef: React.RefObject<any>;
  status: 'idle' | 'scanning' | 'liveness' | 'matching' | 'authenticated' | 'failed';
  children?: React.ReactNode;
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function CameraOverlay({ cameraRef, status, children }: CameraOverlayProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      if (Camera.requestCameraPermissionsAsync) {
        const { status: permStatus } = await Camera.requestCameraPermissionsAsync();
        setHasPermission(permStatus === 'granted');
      } else {
        setHasPermission(true);
      }
    })();
  }, []);

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
  const [layout, setLayout] = useState<{ width: number; height: number } | null>(null);

  const onLayout = (event: any) => {
    const { width, height } = event.nativeEvent.layout;
    setLayout({ width, height });
  };

  const containerWidth = layout ? layout.width : screenWidth;
  const containerHeight = layout ? layout.height : 350;

  let cutoutWidth = containerWidth * 0.65;
  let cutoutHeight = cutoutWidth * (4 / 3);
  if (cutoutHeight > containerHeight * 0.7) {
    cutoutHeight = containerHeight * 0.7;
    cutoutWidth = cutoutHeight * (3 / 4);
  }

  const topOffset = (containerHeight - cutoutHeight) / 2;
  const leftOffset = (containerWidth - cutoutWidth) / 2;

  return (
    <View style={styles.container} onLayout={onLayout}>
      {hasPermission === null ? (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      ) : hasPermission === false ? (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', padding: 20 }]}>
          <Text style={{ color: '#ffffff', fontWeight: 'bold', textAlign: 'center' }}>Camera permission is required</Text>
        </View>
      ) : (
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFillObject}
          type={CameraType.front}
        />
      )}

      {/* Semi-transparent Overlay with Cutout */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
        {/* Top block */}
        <View style={[styles.overlayBlock, { height: topOffset, width: containerWidth }]} />

        {/* Middle row */}
        <View style={{ height: cutoutHeight, flexDirection: 'row', width: containerWidth }}>
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
        <View style={[styles.overlayBlock, { flex: 1, width: containerWidth }]} />
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
    ...StyleSheet.absoluteFillObject,
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
