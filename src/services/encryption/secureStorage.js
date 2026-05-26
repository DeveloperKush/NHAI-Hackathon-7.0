"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrCreateEncryptionKey = getOrCreateEncryptionKey;
exports.encryptData = encryptData;
exports.decryptData = decryptData;
exports.clearCachedKey = clearCachedKey;
const react_native_encrypted_storage_1 = __importDefault(require("react-native-encrypted-storage"));
const crypto_js_1 = __importDefault(require("crypto-js"));
const KEY_ALIAS = 'database_encryption_key';
let cachedKey = null;
/**
 * Retrieves the database encryption key from secure storage, or creates
 * a new 256-bit key if it does not already exist.
 */
async function getOrCreateEncryptionKey() {
    if (cachedKey) {
        return cachedKey;
    }
    try {
        let key = await react_native_encrypted_storage_1.default.getItem(KEY_ALIAS);
        if (!key) {
            // Generate a cryptographically secure 256-bit key (32 bytes = 256 bits)
            key = crypto_js_1.default.lib.WordArray.random(32).toString();
            await react_native_encrypted_storage_1.default.setItem(KEY_ALIAS, key);
        }
        cachedKey = key;
        return key;
    }
    catch (error) {
        console.error('Failed to get or create encryption key:', error);
        throw error;
    }
}
/**
 * Encrypts plain text using the cached AES-256 key.
 * Throws an error if the key is not yet loaded in memory.
 */
function encryptData(plainText) {
    if (!cachedKey) {
        throw new Error('Encryption key not loaded. Call getOrCreateEncryptionKey() first.');
    }
    return crypto_js_1.default.AES.encrypt(plainText, cachedKey).toString();
}
/**
 * Decrypts cipher text using the cached AES-256 key.
 * Throws an error if the key is not yet loaded in memory.
 */
function decryptData(cipherText) {
    if (!cachedKey) {
        throw new Error('Encryption key not loaded. Call getOrCreateEncryptionKey() first.');
    }
    const decrypted = crypto_js_1.default.AES.decrypt(cipherText, cachedKey);
    const plainText = decrypted.toString(crypto_js_1.default.enc.Utf8);
    if (!plainText) {
        throw new Error('Decryption failed. Data may be corrupted or key is incorrect.');
    }
    return plainText;
}
/**
 * Helper to clear cached key (mostly used for testing purposes).
 */
function clearCachedKey() {
    cachedKey = null;
}
