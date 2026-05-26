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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = FaceAuthenticator;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const Haptics = __importStar(require("expo-haptics"));
const useAuth_1 = require("../hooks/useAuth");
const CameraOverlay_1 = __importDefault(require("./CameraOverlay"));
const LivenessFeedback_1 = __importDefault(require("./LivenessFeedback"));
function FaceAuthenticator({ onAuthSuccess, onLivenessFailed, onEnrollmentRequired, similarityThreshold = 0.6, }) {
    const cameraRef = (0, react_1.useRef)(null);
    const { status, logData, error, prompt, startAuth, reset } = (0, useAuth_1.useAuth)(cameraRef, {
        similarityThreshold,
        onAuthSuccess,
        onLivenessFailed,
        onEnrollmentRequired,
    });
    // Start authentication flow automatically on mount
    (0, react_1.useEffect)(() => {
        startAuth(true);
    }, []);
    // Haptic feedback logic
    // 1. Light haptic on challenge change (prompt changes)
    (0, react_1.useEffect)(() => {
        if (prompt) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
        }
    }, [prompt]);
    // 2. Heavy haptic on authentication success
    (0, react_1.useEffect)(() => {
        if (status === 'authenticated') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => { });
        }
    }, [status]);
    // 3. Error notification feedback on failure
    (0, react_1.useEffect)(() => {
        if (status === 'failed') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => { });
        }
    }, [status]);
    // Map state to bottom status pill text
    let statusText = 'Ready';
    if (status === 'scanning') {
        statusText = 'Scanning…';
    }
    else if (status === 'liveness') {
        statusText = 'Liveness Check';
    }
    else if (status === 'matching') {
        statusText = 'Matching…';
    }
    else if (status === 'authenticated') {
        statusText = 'Authenticated';
    }
    else if (status === 'failed') {
        statusText = 'Failed';
    }
    // Handle manual retry on failure
    const handleRetry = () => {
        reset();
        startAuth(true);
    };
    return (<react_native_1.View style={styles.container}>
      <CameraOverlay_1.default cameraRef={cameraRef} status={status}>
        {/* Liveness & Error Feedback Banners */}
        {status === 'liveness' && prompt && (<LivenessFeedback_1.default message={prompt} type="warning" onDismiss={() => { }}/>)}

        {status === 'authenticated' && (<LivenessFeedback_1.default message="Verification Successful" type="success" onDismiss={() => { }}/>)}

        {status === 'failed' && error && (<LivenessFeedback_1.default message={error.message} type="error" onDismiss={handleRetry}/>)}

        {/* Bottom Status Pill */}
        <react_native_1.View style={styles.pillContainer} pointerEvents="box-none">
          <react_native_1.View style={styles.statusPill} testID="status-pill">
            <react_native_1.Text style={styles.statusText}>{statusText}</react_native_1.Text>
          </react_native_1.View>

          {status === 'failed' && (<react_native_1.TouchableOpacity style={styles.retryButton} onPress={handleRetry} testID="retry-button">
              <react_native_1.Text style={styles.retryText}>Retry</react_native_1.Text>
            </react_native_1.TouchableOpacity>)}
        </react_native_1.View>
      </CameraOverlay_1.default>
    </react_native_1.View>);
}
const styles = react_native_1.StyleSheet.create({
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
