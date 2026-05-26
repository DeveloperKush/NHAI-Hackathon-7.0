"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cosineSimilarity = cosineSimilarity;
exports.l2Normalize = l2Normalize;
/**
 * Computes the cosine similarity between two Float32Array vectors.
 * Formula: dot(a, b) / (norm(a) * norm(b))
 */
function cosineSimilarity(a, b) {
    if (a.length !== b.length || a.length === 0) {
        return 0;
    }
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        const valA = a[i];
        const valB = b[i];
        dotProduct += valA * valB;
        normA += valA * valA;
        normB += valB * valB;
    }
    if (normA === 0 || normB === 0) {
        return 0;
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
/**
 * Normalizes a Float32Array vector to unit L2 norm.
 */
function l2Normalize(vec) {
    const n = vec.length;
    const normalized = new Float32Array(n);
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
        sumSq += vec[i] * vec[i];
    }
    const norm = Math.sqrt(sumSq);
    if (norm === 0) {
        return normalized;
    }
    for (let i = 0; i < n; i++) {
        normalized[i] = vec[i] / norm;
    }
    return normalized;
}
