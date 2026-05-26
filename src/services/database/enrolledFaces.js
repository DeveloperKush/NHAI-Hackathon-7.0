"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertEnrolledFace = insertEnrolledFace;
exports.getAllEnrolledFaces = getAllEnrolledFaces;
exports.deleteEnrolledFace = deleteEnrolledFace;
const sqlite_1 = require("./sqlite");
const secureStorage_1 = require("../encryption/secureStorage");
const base_64_1 = __importDefault(require("base-64"));
/**
 * Converts Float32Array to a base64 string representation.
 */
function float32ArrayToBase64(array) {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    let binary = '';
    const len = bytes.length;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return base_64_1.default.encode(binary);
}
/**
 * Converts a base64 string representation back to Float32Array.
 */
function base64ToFloat32Array(base64Str) {
    const binary = base_64_1.default.decode(base64Str);
    const bytes = new Uint8Array(binary.length);
    const len = binary.length;
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}
/**
 * Inserts or replaces an enrolled face.
 * The face embedding is encrypted as an AES-256 base64 ciphertext string before insertion.
 */
async function insertEnrolledFace(user_id, embedding) {
    // Ensure the encryption key is loaded
    await (0, secureStorage_1.getOrCreateEncryptionKey)();
    // Convert Float32Array to base64, then encrypt it
    const base64Str = float32ArrayToBase64(embedding);
    const encryptedEmbedding = (0, secureStorage_1.encryptData)(base64Str);
    const enrolledAt = new Date().toISOString();
    await (0, sqlite_1.executeSql)('INSERT OR REPLACE INTO enrolled_faces (user_id, embedding, enrolled_at) VALUES (?, ?, ?)', [user_id, encryptedEmbedding, enrolledAt]);
}
/**
 * Retrieves all enrolled faces from the database, decrypting the embedding on retrieval.
 */
async function getAllEnrolledFaces() {
    // Ensure the encryption key is loaded
    await (0, secureStorage_1.getOrCreateEncryptionKey)();
    const result = await (0, sqlite_1.executeSql)('SELECT user_id, embedding FROM enrolled_faces');
    const faces = [];
    for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);
        try {
            const decryptedBase64 = (0, secureStorage_1.decryptData)(row.embedding);
            const embedding = base64ToFloat32Array(decryptedBase64);
            faces.push({ user_id: row.user_id, embedding });
        }
        catch (err) {
            console.error(`Failed to decrypt embedding for user ${row.user_id}:`, err);
        }
    }
    return faces;
}
/**
 * Deletes an enrolled face by user_id.
 */
async function deleteEnrolledFace(user_id) {
    await (0, sqlite_1.executeSql)('DELETE FROM enrolled_faces WHERE user_id = ?', [user_id]);
}
