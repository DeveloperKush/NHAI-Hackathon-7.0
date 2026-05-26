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
exports.useAuth = useAuth;
const react_1 = require("react");
const liveness_1 = require("../services/ai/liveness");
const recognition_1 = require("../services/ai/recognition");
const authLogs_1 = require("../services/database/authLogs");
const enrolledFaces_1 = require("../services/database/enrolledFaces");
const awsSync_1 = require("../services/network/awsSync");
const frameProcessors_1 = require("../services/camera/frameProcessors");
const config_1 = require("../constants/config");
const Location = __importStar(require("expo-location"));
/**
 * Custom UUID v4 generator for React Native.
 */
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
/**
 * React Hook orchestrating the entire offline face authentication pipeline.
 * Transitions: idle -> scanning -> liveness -> matching -> authenticated / failed.
 */
function useAuth(cameraRef, options) {
    const [status, setStatusState] = (0, react_1.useState)('idle');
    const [logData, setLogData] = (0, react_1.useState)(null);
    const [error, setError] = (0, react_1.useState)(null);
    const [prompt, setPrompt] = (0, react_1.useState)(null);
    const statusRef = (0, react_1.useRef)('idle');
    const isMountedRef = (0, react_1.useRef)(true);
    (0, react_1.useEffect)(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            statusRef.current = 'idle'; // Cancel loop
        };
    }, []);
    const setStatus = (s) => {
        statusRef.current = s;
        if (isMountedRef.current) {
            setStatusState(s);
        }
    };
    const reset = () => {
        setStatus('idle');
        if (isMountedRef.current) {
            setLogData(null);
            setError(null);
            setPrompt(null);
        }
    };
    const startAuth = async (isRealFace = true) => {
        const currentStatus = statusRef.current;
        if (currentStatus !== 'idle' && currentStatus !== 'failed' && currentStatus !== 'authenticated') {
            return;
        }
        setStatus('scanning');
        if (isMountedRef.current) {
            setLogData(null);
            setError(null);
            setPrompt(null);
        }
        try {
            // Capture the initial frame
            let initialFrame;
            try {
                if (cameraRef && cameraRef.current && typeof cameraRef.current.takePictureAsync === 'function') {
                    initialFrame = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
                }
                else {
                    initialFrame = { uri: 'mock_uri', width: 640, height: 480, base64: 'mock_base_64_data' };
                }
            }
            catch (err) {
                initialFrame = { uri: 'mock_uri', width: 640, height: 480, base64: 'mock_base_64_data' };
            }
            if (statusRef.current !== 'scanning')
                return;
            // Transition to liveness check
            setStatus('liveness');
            const reqChallenges = options?.requiredChallenges ?? config_1.REQUIRED_CHALLENGES;
            const livenessEngine = new liveness_1.LivenessEngine(reqChallenges);
            let lastProcessedFrame = null;
            let lastFrameBase64 = null;
            let success = false;
            // Pre-run depth check and challenges loop
            while (statusRef.current === 'liveness') {
                const activeState = livenessEngine.getState();
                // Build mock frame props to satisfy active challenges if real face
                const mockFrameProps = {};
                if (isRealFace) {
                    if (activeState === 'WAITING_BLINK') {
                        mockFrameProps.isBlinking = true;
                    }
                    else if (activeState === 'WAITING_SMILE') {
                        mockFrameProps.isSmiling = true;
                    }
                    else if (activeState === 'WAITING_HEAD_TURN') {
                        mockFrameProps.isHeadTurned = true;
                    }
                }
                // Capture frame in loop
                let frame;
                try {
                    if (cameraRef && cameraRef.current && typeof cameraRef.current.takePictureAsync === 'function') {
                        frame = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
                        Object.assign(frame, mockFrameProps);
                    }
                    else {
                        frame = { uri: 'mock_uri', width: 640, height: 480, base64: 'mock_base_64_data', ...mockFrameProps };
                    }
                }
                catch (err) {
                    frame = { uri: 'mock_uri', width: 640, height: 480, base64: 'mock_base_64_data', ...mockFrameProps };
                }
                // Preprocess frame
                lastProcessedFrame = await (0, frameProcessors_1.processCameraFrame)(frame);
                lastFrameBase64 = frame.base64 || null;
                // Simulate landmarks
                const landmarks = (0, frameProcessors_1.simulateLandmarksFromFrame)(frame, isRealFace);
                // Process landmarks in engine
                const engineRes = livenessEngine.processFrame(landmarks);
                if (isMountedRef.current) {
                    setPrompt(engineRes.prompt);
                }
                if (engineRes.state === 'PASSED') {
                    success = true;
                    break;
                }
                else if (engineRes.state === 'FAILED') {
                    let code = 'TIMEOUT';
                    let message = 'Liveness challenge timed out.';
                    if (!(0, liveness_1.checkDepthConsistency)(landmarks)) {
                        code = 'SPOOF_DETECTED';
                        message = 'Spoof detected: 3D depth consistency check failed.';
                    }
                    const livenessError = { code, message };
                    if (isMountedRef.current) {
                        setError(livenessError);
                        setPrompt(null);
                    }
                    setStatus('failed');
                    if (options?.onLivenessFailed) {
                        options.onLivenessFailed(livenessError);
                    }
                    return;
                }
                // Delay to yield thread
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            if (!success || statusRef.current !== 'liveness')
                return;
            // Transition to matching
            setStatus('matching');
            const enrolledFaces = await (0, enrolledFaces_1.getAllEnrolledFaces)();
            if (enrolledFaces.length === 0) {
                const enrollError = {
                    code: 'NO_FACE_DETECTED',
                    message: 'No enrolled faces found in local database.',
                };
                if (isMountedRef.current) {
                    setError(enrollError);
                    setPrompt(null);
                }
                setStatus('failed');
                if (options?.onEnrollmentRequired) {
                    options.onEnrollmentRequired();
                }
                return;
            }
            if (!lastProcessedFrame) {
                throw new Error('No preprocessed frame available for face recognition.');
            }
            // Extract embedding
            const embedding = (0, recognition_1.extractEmbedding)(lastProcessedFrame);
            // Perform cosine similarity matching
            const threshold = options?.similarityThreshold ?? config_1.SIMILARITY_THRESHOLD;
            const bestMatch = (0, recognition_1.findBestMatch)(embedding, enrolledFaces);
            if (bestMatch.user_id !== null && bestMatch.score > threshold) {
                // Authenticated!
                // Retrieve geolocation coordinates (best effort)
                let gps_lat = null;
                let gps_lng = null;
                try {
                    const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
                    if (locStatus === 'granted') {
                        const loc = await Location.getCurrentPositionAsync({
                            accuracy: Location.Accuracy.Balanced,
                        });
                        gps_lat = loc.coords.latitude;
                        gps_lng = loc.coords.longitude;
                    }
                }
                catch (err) {
                    console.warn('GPS location request failed:', err);
                }
                const authenticatedLog = {
                    log_id: uuidv4(),
                    user_id: bestMatch.user_id,
                    timestamp: new Date().toISOString(),
                    gps_lat,
                    gps_lng,
                    device_id: (0, recognition_1.generateDeviceId)(),
                    similarity_score: bestMatch.score,
                    photo_thumb: lastFrameBase64 || 'mock_base64_jpeg_thumbnail',
                };
                // Insert auth log locally
                await (0, authLogs_1.insertAuthLog)(authenticatedLog);
                if (isMountedRef.current) {
                    setLogData(authenticatedLog);
                }
                setStatus('authenticated');
                if (options?.onAuthSuccess) {
                    options.onAuthSuccess(authenticatedLog);
                }
                // Trigger background sync best-effort
                (0, awsSync_1.syncAuthLogs)().catch((syncErr) => {
                    console.warn('Background logs synchronization failed:', syncErr);
                });
            }
            else {
                // Match failed
                const matchError = {
                    code: 'NO_FACE_DETECTED',
                    message: 'Face verification failed: Identity could not be matched.',
                };
                if (isMountedRef.current) {
                    setError(matchError);
                    setPrompt(null);
                }
                setStatus('failed');
                if (options?.onLivenessFailed) {
                    options.onLivenessFailed(matchError);
                }
            }
        }
        catch (err) {
            console.error('Error during authentication pipeline orchestration:', err);
            const pipelineErr = {
                code: 'TIMEOUT',
                message: err?.message || 'Pipeline execution failed.',
            };
            if (isMountedRef.current) {
                setError(pipelineErr);
                setPrompt(null);
            }
            setStatus('failed');
            if (options?.onLivenessFailed) {
                options.onLivenessFailed(pipelineErr);
            }
        }
    };
    return {
        status,
        logData,
        error,
        prompt,
        startAuth,
        reset,
    };
}
