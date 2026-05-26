"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODEL_PATHS = exports.AWS_SYNC_URL = exports.REQUIRED_CHALLENGES = exports.LIVENESS_TIMEOUT_MS = exports.THRESHOLD_RANGE = exports.SIMILARITY_THRESHOLD = void 0;
exports.SIMILARITY_THRESHOLD = 0.6;
exports.THRESHOLD_RANGE = {
    permissive: 0.55,
    strict: 0.65,
};
exports.LIVENESS_TIMEOUT_MS = 10000;
exports.REQUIRED_CHALLENGES = 2;
exports.AWS_SYNC_URL = process.env.EXPO_PUBLIC_AWS_SYNC_URL;
exports.MODEL_PATHS = {
    mobilefacenet: 'assets/models/mobilefacenet_int8.tflite',
};
