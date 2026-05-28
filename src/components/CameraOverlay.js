"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = CameraOverlay;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const expo_camera_1 = require("expo-camera");
const { width: screenWidth, height: screenHeight } = react_native_1.Dimensions.get('window');
function CameraOverlay({ cameraRef, status, children }) {
    const pulseAnim = (0, react_1.useRef)(new react_native_1.Animated.Value(1)).current;
    const [hasPermission, setHasPermission] = (0, react_1.useState)(null);
    (0, react_1.useEffect)(() => {
        (async () => {
            if (expo_camera_1.Camera.requestCameraPermissionsAsync) {
                const { status: permStatus } = await expo_camera_1.Camera.requestCameraPermissionsAsync();
                setHasPermission(permStatus === 'granted');
            }
            else {
                setHasPermission(true);
            }
        })();
    }, []);
    // Determine border color based on status
    let borderColor = '#1a237e'; // default navy
    if (status === 'authenticated') {
        borderColor = '#4caf50'; // green
    }
    else if (status === 'failed') {
        borderColor = '#f44336'; // red
    }
    // Pulsing animation for scanning/liveness/matching states
    (0, react_1.useEffect)(() => {
        let animation = null;
        if (status === 'scanning' || status === 'liveness' || status === 'matching') {
            animation = react_native_1.Animated.loop(react_native_1.Animated.sequence([
                react_native_1.Animated.timing(pulseAnim, {
                    toValue: 1.05,
                    duration: 800,
                    useNativeDriver: false,
                }),
                react_native_1.Animated.timing(pulseAnim, {
                    toValue: 1.0,
                    duration: 800,
                    useNativeDriver: false,
                }),
            ]));
            animation.start();
        }
        else {
            pulseAnim.setValue(1);
        }
        return () => {
            if (animation) {
                animation.stop();
            }
        };
    }, [status]);
    // Calculate cutout layout
    const [layout, setLayout] = (0, react_1.useState)(null);
    const onLayout = (event) => {
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
    return (<react_native_1.View style={styles.container} onLayout={onLayout}>
      {hasPermission === null ? (<react_native_1.View style={[react_native_1.StyleSheet.absoluteFillObject, { backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' }]}>
          <react_native_1.ActivityIndicator size="large" color="#ffffff"/>
        </react_native_1.View>) : hasPermission === false ? (<react_native_1.View style={[react_native_1.StyleSheet.absoluteFillObject, { backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', padding: 20 }]}>
          <react_native_1.Text style={{ color: '#ffffff', fontWeight: 'bold', textAlign: 'center' }}>Camera permission is required</react_native_1.Text>
        </react_native_1.View>) : (<expo_camera_1.Camera ref={cameraRef} style={react_native_1.StyleSheet.absoluteFillObject} type={expo_camera_1.CameraType.front}/>)}

      {/* Semi-transparent Overlay with Cutout */}
      <react_native_1.View style={react_native_1.StyleSheet.absoluteFillObject} pointerEvents="box-none">
        {/* Top block */}
        <react_native_1.View style={[styles.overlayBlock, { height: topOffset, width: containerWidth }]}/>

        {/* Middle row */}
        <react_native_1.View style={{ height: cutoutHeight, flexDirection: 'row', width: containerWidth }}>
          {/* Left block */}
          <react_native_1.View style={[styles.overlayBlock, { width: leftOffset, height: cutoutHeight }]}/>

          {/* Transparent Cutout & Borders */}
          <react_native_1.View style={{ width: cutoutWidth, height: cutoutHeight, position: 'relative' }}>
            {/* Animated pulsing border */}
            <react_native_1.Animated.View style={[
            styles.borderBox,
            {
                borderColor: borderColor,
                transform: [{ scale: pulseAnim }],
            },
        ]}/>
          </react_native_1.View>

          {/* Right block */}
          <react_native_1.View style={[styles.overlayBlock, { width: leftOffset, height: cutoutHeight }]}/>
        </react_native_1.View>

        {/* Bottom block */}
        <react_native_1.View style={[styles.overlayBlock, { flex: 1, width: containerWidth }]}/>
      </react_native_1.View>

      {/* Children inside safe area */}
      <react_native_1.SafeAreaView style={styles.safeArea} pointerEvents="box-none">
        {children}
      </react_native_1.SafeAreaView>
    </react_native_1.View>);
}
const styles = react_native_1.StyleSheet.create({
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
        ...react_native_1.StyleSheet.absoluteFillObject,
    },
});
