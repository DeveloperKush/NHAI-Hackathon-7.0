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
exports.default = EnrollmentScreen;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const expo_camera_1 = require("expo-camera");
const frameProcessors_1 = require("../services/camera/frameProcessors");
const recognition_1 = require("../services/ai/recognition");
const enrolledFaces_1 = require("../services/database/enrolledFaces");
const math_1 = require("../utils/math");
const LivenessFeedback_1 = __importDefault(require("../components/LivenessFeedback"));
const { width: screenWidth } = react_native_1.Dimensions.get('window');
function EnrollmentScreen({ navigation }) {
    const cameraRef = (0, react_1.useRef)(null);
    const [userId, setUserId] = (0, react_1.useState)('');
    const [capturedFrames, setCapturedFrames] = (0, react_1.useState)([]);
    const [isCapturing, setIsCapturing] = (0, react_1.useState)(false);
    const [isSaving, setIsSaving] = (0, react_1.useState)(false);
    const [currentStep, setCurrentStep] = (0, react_1.useState)(1);
    const [errorMsg, setErrorMsg] = (0, react_1.useState)(null);
    const [successMsg, setSuccessMsg] = (0, react_1.useState)(null);
    const handleCapture = async () => {
        setErrorMsg(null);
        setSuccessMsg(null);
        setIsCapturing(true);
        setCurrentStep(1);
        try {
            // Capture 5 frames
            const frames = await (0, frameProcessors_1.captureEnrollmentFrames)(cameraRef.current, 5);
            setCapturedFrames(frames);
        }
        catch (err) {
            setErrorMsg(err.message || 'Failed to capture frames.');
        }
        finally {
            setIsCapturing(false);
        }
    };
    const handleSave = async () => {
        if (!userId.trim()) {
            setErrorMsg('Personnel ID is required.');
            return;
        }
        if (capturedFrames.length < 3) {
            setErrorMsg('At least 3 captured frames are required.');
            return;
        }
        setErrorMsg(null);
        setSuccessMsg(null);
        setIsSaving(true);
        setCurrentStep(2); // Step 2: Processing
        try {
            // 1. Validate unique user_id
            const enrolled = await (0, enrolledFaces_1.getAllEnrolledFaces)();
            const duplicate = enrolled.find((face) => face.user_id === userId.trim());
            if (duplicate) {
                setErrorMsg('Duplicate Personnel ID. This user is already enrolled.');
                setCurrentStep(1); // Reset to capture step
                setIsSaving(false);
                return;
            }
            // 2. Process frames and extract embeddings
            const embeddings = [];
            for (const base64Frame of capturedFrames) {
                const mockFrame = {
                    uri: 'mock_frame_uri',
                    width: 112,
                    height: 112,
                    base64: base64Frame,
                };
                const preprocessed = await (0, frameProcessors_1.processCameraFrame)(mockFrame);
                const embedding = (0, recognition_1.extractEmbedding)(preprocessed);
                embeddings.push(embedding);
            }
            // 3. Average all embeddings index-by-index
            const avgEmbedding = new Float32Array(512);
            for (let i = 0; i < 512; i++) {
                let sum = 0;
                for (const emb of embeddings) {
                    sum += emb[i];
                }
                avgEmbedding[i] = sum / embeddings.length;
            }
            // 4. L2 normalize the averaged embedding
            const normalizedAvg = (0, math_1.l2Normalize)(avgEmbedding);
            // 5. Store in SQLite DB
            await (0, enrolledFaces_1.insertEnrolledFace)(userId.trim(), normalizedAvg);
            // Transition to Saved
            setCurrentStep(3);
            setSuccessMsg('Enrollment Saved Successfully!');
            // Navigate back after delay
            setTimeout(() => {
                if (navigation && typeof navigation.goBack === 'function') {
                    navigation.goBack();
                }
            }, 1500);
        }
        catch (err) {
            setErrorMsg(err.message || 'An error occurred during enrollment.');
            setCurrentStep(1);
        }
        finally {
            setIsSaving(false);
        }
    };
    const isSaveDisabled = capturedFrames.length < 3 || !userId.trim() || isCapturing || isSaving;
    return (<react_native_1.SafeAreaView style={styles.container}>
      <react_native_1.ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <react_native_1.Text style={styles.headerTitle}>Enroll New Worker</react_native_1.Text>

        {/* Stepper UI */}
        <react_native_1.View style={styles.stepperContainer}>
          <react_native_1.View style={styles.stepWrapper}>
            <react_native_1.View style={[styles.stepCircle, currentStep >= 1 && styles.stepActive]}>
              <react_native_1.Text style={styles.stepNumber}>1</react_native_1.Text>
            </react_native_1.View>
            <react_native_1.Text style={styles.stepLabel}>Capture</react_native_1.Text>
          </react_native_1.View>
          <react_native_1.View style={[styles.stepLine, currentStep >= 2 && styles.lineActive]}/>
          <react_native_1.View style={styles.stepWrapper}>
            <react_native_1.View style={[styles.stepCircle, currentStep >= 2 && styles.stepActive]}>
              <react_native_1.Text style={styles.stepNumber}>2</react_native_1.Text>
            </react_native_1.View>
            <react_native_1.Text style={styles.stepLabel}>Processing</react_native_1.Text>
          </react_native_1.View>
          <react_native_1.View style={[styles.stepLine, currentStep >= 3 && styles.lineActive]}/>
          <react_native_1.View style={styles.stepWrapper}>
            <react_native_1.View style={[styles.stepCircle, currentStep >= 3 && styles.stepActive]}>
              <react_native_1.Text style={styles.stepNumber}>3</react_native_1.Text>
            </react_native_1.View>
            <react_native_1.Text style={styles.stepLabel}>Saved</react_native_1.Text>
          </react_native_1.View>
        </react_native_1.View>

        {/* Camera Preview */}
        <react_native_1.View style={styles.cameraContainer}>
          <expo_camera_1.Camera ref={cameraRef} style={styles.camera} type={expo_camera_1.CameraType.front}/>
          {isCapturing && (<react_native_1.View style={styles.loadingOverlay}>
              <react_native_1.ActivityIndicator size="large" color="#ffffff"/>
              <react_native_1.Text style={styles.loadingText}>Capturing 5 Frames…</react_native_1.Text>
            </react_native_1.View>)}
        </react_native_1.View>

        {/* Capture Button */}
        <react_native_1.TouchableOpacity style={styles.captureButton} onPress={handleCapture} disabled={isCapturing || isSaving} testID="capture-button">
          <react_native_1.Text style={styles.captureButtonText}>
            {isCapturing ? 'Capturing…' : 'Capture Face (5 Frames)'}
          </react_native_1.Text>
        </react_native_1.TouchableOpacity>

        {/* Horizontal Scrollable Row for Captured Frames */}
        <react_native_1.View style={styles.framesSection}>
          <react_native_1.Text style={styles.sectionLabel}>Captured Frames</react_native_1.Text>
          <react_native_1.ScrollView horizontal style={styles.framesRow} contentContainerStyle={styles.framesRowContent}>
            {capturedFrames.map((frame, idx) => (<react_native_1.View key={idx} style={styles.frameThumbnailContainer}>
                {frame.startsWith('mock') ? (<react_native_1.View style={styles.mockThumbnail}>
                    <react_native_1.Text style={styles.mockThumbnailText}>Frame {idx + 1}</react_native_1.Text>
                  </react_native_1.View>) : (<react_native_1.Image source={{ uri: 'data:image/jpeg;base64,' + frame }} style={styles.thumbnail}/>)}
                {/* Green Checkmark Overlay for Processed/Captured Frames */}
                <react_native_1.View style={styles.checkmarkContainer}>
                  <react_native_1.Text style={styles.checkmark}>✓</react_native_1.Text>
                </react_native_1.View>
              </react_native_1.View>))}
            {capturedFrames.length === 0 && (<react_native_1.Text style={styles.emptyText}>No frames captured yet</react_native_1.Text>)}
          </react_native_1.ScrollView>
        </react_native_1.View>

        {/* User ID text input */}
        <react_native_1.View style={styles.inputContainer}>
          <react_native_1.Text style={styles.inputLabel}>Personnel ID (user_id)</react_native_1.Text>
          <react_native_1.TextInput style={styles.textInput} value={userId} onChangeText={setUserId} placeholder="Enter unique worker ID" placeholderTextColor="#757575" autoCapitalize="none" editable={!isSaving}/>
        </react_native_1.View>

        {/* Save button */}
        <react_native_1.TouchableOpacity style={[styles.saveButton, isSaveDisabled && styles.saveButtonDisabled]} onPress={handleSave} disabled={isSaveDisabled} testID="save-button">
          {isSaving ? (<react_native_1.ActivityIndicator size="small" color="#ffffff"/>) : (<react_native_1.Text style={styles.saveButtonText}>Save Enrollment</react_native_1.Text>)}
        </react_native_1.TouchableOpacity>
      </react_native_1.ScrollView>

      {/* Banner Feedbacks */}
      {errorMsg && (<LivenessFeedback_1.default message={errorMsg} type="error" onDismiss={() => setErrorMsg(null)}/>)}

      {successMsg && (<LivenessFeedback_1.default message={successMsg} type="success" onDismiss={() => setSuccessMsg(null)}/>)}
    </react_native_1.SafeAreaView>);
}
const styles = react_native_1.StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#ffffff',
    },
    scrollContent: {
        padding: 20,
        alignItems: 'center',
        gap: 20,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1a237e', // Primary Navy
        textAlign: 'center',
        marginVertical: 10,
    },
    stepperContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        paddingHorizontal: 20,
    },
    stepWrapper: {
        alignItems: 'center',
        gap: 6,
    },
    stepCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#f5f5f5', // Surface grey
        borderWidth: 2,
        borderColor: '#757575',
        alignItems: 'center',
        justifyContent: 'center',
    },
    stepActive: {
        backgroundColor: '#1a237e', // Primary Navy
        borderColor: '#1a237e',
    },
    stepNumber: {
        color: '#212121',
        fontWeight: 'bold',
        fontSize: 14,
    },
    stepLabel: {
        fontSize: 12,
        color: '#757575',
        fontWeight: '500',
    },
    stepLine: {
        flex: 1,
        height: 2,
        backgroundColor: '#f5f5f5',
        marginHorizontal: 8,
    },
    lineActive: {
        backgroundColor: '#1a237e',
    },
    cameraContainer: {
        width: screenWidth - 40,
        height: (screenWidth - 40) * (4 / 3),
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#000000',
        position: 'relative',
    },
    camera: {
        ...react_native_1.StyleSheet.absoluteFillObject,
    },
    loadingOverlay: {
        ...react_native_1.StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    loadingText: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 16,
    },
    captureButton: {
        backgroundColor: '#1a237e',
        paddingVertical: 14,
        width: '100%',
        borderRadius: 12,
        alignItems: 'center',
    },
    captureButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    framesSection: {
        width: '100%',
        alignItems: 'flex-start',
        gap: 8,
    },
    sectionLabel: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#212121',
    },
    framesRow: {
        width: '100%',
    },
    framesRowContent: {
        gap: 12,
        paddingVertical: 4,
    },
    frameThumbnailContainer: {
        position: 'relative',
    },
    thumbnail: {
        width: 80,
        height: 80,
        borderRadius: 8,
    },
    mockThumbnail: {
        width: 80,
        height: 80,
        borderRadius: 8,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#757575',
    },
    mockThumbnailText: {
        fontSize: 12,
        color: '#757575',
    },
    checkmarkContainer: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#4caf50', // Success green
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkmark: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 12,
    },
    emptyText: {
        color: '#757575',
        fontStyle: 'italic',
        paddingVertical: 30,
    },
    inputContainer: {
        width: '100%',
        gap: 8,
        alignItems: 'flex-start',
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#212121',
    },
    textInput: {
        width: '100%',
        height: 48,
        borderWidth: 1,
        borderColor: '#757575',
        borderRadius: 8,
        paddingHorizontal: 16,
        color: '#212121',
        fontSize: 16,
    },
    saveButton: {
        backgroundColor: '#4caf50', // Success green
        paddingVertical: 14,
        width: '100%',
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 10,
    },
    saveButtonDisabled: {
        backgroundColor: '#f5f5f5',
        borderWidth: 1,
        borderColor: '#757575',
    },
    saveButtonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
