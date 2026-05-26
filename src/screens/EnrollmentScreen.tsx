import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { Camera, CameraType } from 'expo-camera';
import {
  captureEnrollmentFrames,
  processCameraFrame,
} from '../services/camera/frameProcessors';
import { extractEmbedding } from '../services/ai/recognition';
import {
  insertEnrolledFace,
  getAllEnrolledFaces,
} from '../services/database/enrolledFaces';
import { l2Normalize } from '../utils/math';
import LivenessFeedback from '../components/LivenessFeedback';

const { width: screenWidth } = Dimensions.get('window');

export interface EnrollmentScreenProps {
  navigation?: any;
}

export default function EnrollmentScreen({ navigation }: EnrollmentScreenProps) {
  const cameraRef = useRef<any>(null);
  const [userId, setUserId] = useState('');
  const [capturedFrames, setCapturedFrames] = useState<string[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleCapture = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsCapturing(true);
    setCurrentStep(1);

    try {
      // Capture 5 frames
      const frames = await captureEnrollmentFrames(cameraRef.current, 5);
      setCapturedFrames(frames);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to capture frames.');
    } finally {
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
      const enrolled = await getAllEnrolledFaces();
      const duplicate = enrolled.find((face) => face.user_id === userId.trim());
      if (duplicate) {
        setErrorMsg('Duplicate Personnel ID. This user is already enrolled.');
        setCurrentStep(1); // Reset to capture step
        setIsSaving(false);
        return;
      }

      // 2. Process frames and extract embeddings
      const embeddings: Float32Array[] = [];
      for (const base64Frame of capturedFrames) {
        const mockFrame = {
          uri: 'mock_frame_uri',
          width: 112,
          height: 112,
          base64: base64Frame,
        };
        const preprocessed = await processCameraFrame(mockFrame);
        const embedding = extractEmbedding(preprocessed);
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
      const normalizedAvg = l2Normalize(avgEmbedding);

      // 5. Store in SQLite DB
      await insertEnrolledFace(userId.trim(), normalizedAvg);

      // Transition to Saved
      setCurrentStep(3);
      setSuccessMsg('Enrollment Saved Successfully!');

      // Navigate back after delay
      setTimeout(() => {
        if (navigation && typeof navigation.goBack === 'function') {
          navigation.goBack();
        }
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during enrollment.');
      setCurrentStep(1);
    } finally {
      setIsSaving(false);
    }
  };

  const isSaveDisabled = capturedFrames.length < 3 || !userId.trim() || isCapturing || isSaving;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <Text style={styles.headerTitle}>Enroll New Worker</Text>

        {/* Stepper UI */}
        <View style={styles.stepperContainer}>
          <View style={styles.stepWrapper}>
            <View style={[styles.stepCircle, currentStep >= 1 && styles.stepActive]}>
              <Text style={styles.stepNumber}>1</Text>
            </View>
            <Text style={styles.stepLabel}>Capture</Text>
          </View>
          <View style={[styles.stepLine, currentStep >= 2 && styles.lineActive]} />
          <View style={styles.stepWrapper}>
            <View style={[styles.stepCircle, currentStep >= 2 && styles.stepActive]}>
              <Text style={styles.stepNumber}>2</Text>
            </View>
            <Text style={styles.stepLabel}>Processing</Text>
          </View>
          <View style={[styles.stepLine, currentStep >= 3 && styles.lineActive]} />
          <View style={styles.stepWrapper}>
            <View style={[styles.stepCircle, currentStep >= 3 && styles.stepActive]}>
              <Text style={styles.stepNumber}>3</Text>
            </View>
            <Text style={styles.stepLabel}>Saved</Text>
          </View>
        </View>

        {/* Camera Preview */}
        <View style={styles.cameraContainer}>
          <Camera
            ref={cameraRef}
            style={styles.camera}
            type={CameraType.front}
          />
          {isCapturing && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#ffffff" />
              <Text style={styles.loadingText}>Capturing 5 Frames…</Text>
            </View>
          )}
        </View>

        {/* Capture Button */}
        <TouchableOpacity
          style={styles.captureButton}
          onPress={handleCapture}
          disabled={isCapturing || isSaving}
          testID="capture-button"
        >
          <Text style={styles.captureButtonText}>
            {isCapturing ? 'Capturing…' : 'Capture Face (5 Frames)'}
          </Text>
        </TouchableOpacity>

        {/* Horizontal Scrollable Row for Captured Frames */}
        <View style={styles.framesSection}>
          <Text style={styles.sectionLabel}>Captured Frames</Text>
          <ScrollView horizontal style={styles.framesRow} contentContainerStyle={styles.framesRowContent}>
            {capturedFrames.map((frame, idx) => (
              <View key={idx} style={styles.frameThumbnailContainer}>
                {frame.startsWith('mock') ? (
                  <View style={styles.mockThumbnail}>
                    <Text style={styles.mockThumbnailText}>Frame {idx + 1}</Text>
                  </View>
                ) : (
                  <Image
                    source={{ uri: 'data:image/jpeg;base64,' + frame }}
                    style={styles.thumbnail}
                  />
                )}
                {/* Green Checkmark Overlay for Processed/Captured Frames */}
                <View style={styles.checkmarkContainer}>
                  <Text style={styles.checkmark}>✓</Text>
                </View>
              </View>
            ))}
            {capturedFrames.length === 0 && (
              <Text style={styles.emptyText}>No frames captured yet</Text>
            )}
          </ScrollView>
        </View>

        {/* User ID text input */}
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Personnel ID (user_id)</Text>
          <TextInput
            style={styles.textInput}
            value={userId}
            onChangeText={setUserId}
            placeholder="Enter unique worker ID"
            placeholderTextColor="#757575"
            autoCapitalize="none"
            editable={!isSaving}
          />
        </View>

        {/* Save button */}
        <TouchableOpacity
          style={[styles.saveButton, isSaveDisabled && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaveDisabled}
          testID="save-button"
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.saveButtonText}>Save Enrollment</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Banner Feedbacks */}
      {errorMsg && (
        <LivenessFeedback
          message={errorMsg}
          type="error"
          onDismiss={() => setErrorMsg(null)}
        />
      )}

      {successMsg && (
        <LivenessFeedback
          message={successMsg}
          type="success"
          onDismiss={() => setSuccessMsg(null)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    ...StyleSheet.absoluteFillObject,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
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
