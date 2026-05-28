"use strict";
// MVP degraded implementation. Upgrade path: replace with react-native-fast-tflite + MobileFaceNet INT8.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractEmbedding = extractEmbedding;
exports.findBestMatch = findBestMatch;
exports.generateDeviceId = generateDeviceId;
const expo_constants_1 = __importDefault(require("expo-constants"));
const math_1 = require("../../utils/math");
const config_1 = require("../../constants/config");
/**
 * Extracts a 512-dimensional deterministic pseudo-embedding from 112x112 image features.
 * Divide 112x112 into 16 regions, compute mean intensity, dx gradients, dy gradients,
 * and interpolate/pad to exactly 512 dimensions. Same input will produce identical output.
 */
function extractEmbedding(imageData) {
    const size = 112;
    const regionSize = 28;
    const numBlocks = 4; // 4x4 grid of 28x28 regions = 16 regions
    const means = [];
    const dxGradients = [];
    const dyGradients = [];
    for (let by = 0; by < numBlocks; by++) {
        for (let bx = 0; bx < numBlocks; bx++) {
            let sum = 0;
            let leftSum = 0;
            let rightSum = 0;
            let topSum = 0;
            let bottomSum = 0;
            for (let y = 0; y < regionSize; y++) {
                const pixelY = by * regionSize + y;
                for (let x = 0; x < regionSize; x++) {
                    const pixelX = bx * regionSize + x;
                    const idx = pixelY * size + pixelX;
                    const val = imageData[idx] || 0;
                    sum += val;
                    if (x < regionSize / 2) {
                        leftSum += val;
                    }
                    else {
                        rightSum += val;
                    }
                    if (y < regionSize / 2) {
                        topSum += val;
                    }
                    else {
                        bottomSum += val;
                    }
                }
            }
            const count = regionSize * regionSize;
            const mean = sum / count;
            const dx = (leftSum - rightSum) / count;
            const dy = (topSum - bottomSum) / count;
            means.push(mean);
            dxGradients.push(dx);
            dyGradients.push(dy);
        }
    }
    // Combine means and gradients into a single feature array
    const features = [...means, ...dxGradients, ...dyGradients];
    // Interpolate/pad to exactly 512 dimensions
    const target = new Float32Array(512);
    const S = features.length;
    for (let i = 0; i < 512; i++) {
        const srcIndex = (i / 512) * S;
        const indexLow = Math.floor(srcIndex);
        const indexHigh = Math.min(indexLow + 1, S - 1);
        const weight = srcIndex - indexLow;
        target[i] = features[indexLow] * (1 - weight) + features[indexHigh] * weight;
    }
    // Normalize the final 512-dimensional vector to unit L2 norm
    return (0, math_1.l2Normalize)(target);
}
/**
 * Compares query embedding against enrolled faces and returns the best match
 * if its similarity score exceeds the threshold.
 */
function findBestMatch(embedding, enrolledFaces) {
    if (!enrolledFaces || enrolledFaces.length === 0) {
        return { user_id: null, score: 0 };
    }
    let maxScore = -1;
    let bestUserId = null;
    const threshold = config_1.SIMILARITY_THRESHOLD;
    for (const face of enrolledFaces) {
        const score = (0, math_1.cosineSimilarity)(embedding, face.embedding);
        console.log(`Checking match for user_id: ${face.user_id}, score: ${score}, current max: ${maxScore}`);
        if (score > maxScore) {
            maxScore = score;
            bestUserId = face.user_id;
        }
    }
    if (maxScore > threshold) {
        return { user_id: bestUserId, score: maxScore };
    }
    return { user_id: null, score: 0 };
}
// Memory cache for stable device ID fallback when Constants.installationId is unavailable
let cachedDeviceId = null;
/**
 * Generates a stable device ID using expo-constants or a stable UUID fallback.
 */
function generateDeviceId() {
    if (expo_constants_1.default && expo_constants_1.default.installationId) {
        return expo_constants_1.default.installationId;
    }
    if (cachedDeviceId) {
        return cachedDeviceId;
    }
    cachedDeviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
    return cachedDeviceId;
}
