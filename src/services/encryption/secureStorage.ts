import EncryptedStorage from 'react-native-encrypted-storage';
import CryptoJS from 'crypto-js';

const KEY_ALIAS = 'database_encryption_key';
let cachedKey: string | null = null;

/**
 * Retrieves the database encryption key from secure storage, or creates
 * a new 256-bit key if it does not already exist.
 */
export async function getOrCreateEncryptionKey(): Promise<string> {
  if (cachedKey) {
    return cachedKey;
  }

  try {
    let key = await EncryptedStorage.getItem(KEY_ALIAS);
    if (!key) {
      // Generate a cryptographically secure 256-bit key (32 bytes = 256 bits)
      key = CryptoJS.lib.WordArray.random(32).toString();
      await EncryptedStorage.setItem(KEY_ALIAS, key);
    }
    cachedKey = key;
    return key;
  } catch (error) {
    console.error('Failed to get or create encryption key:', error);
    throw error;
  }
}

/**
 * Encrypts plain text using the cached AES-256 key.
 * Throws an error if the key is not yet loaded in memory.
 */
export function encryptData(plainText: string): string {
  if (!cachedKey) {
    throw new Error('Encryption key not loaded. Call getOrCreateEncryptionKey() first.');
  }
  return CryptoJS.AES.encrypt(plainText, cachedKey).toString();
}

/**
 * Decrypts cipher text using the cached AES-256 key.
 * Throws an error if the key is not yet loaded in memory.
 */
export function decryptData(cipherText: string): string {
  if (!cachedKey) {
    throw new Error('Encryption key not loaded. Call getOrCreateEncryptionKey() first.');
  }
  const decrypted = CryptoJS.AES.decrypt(cipherText, cachedKey);
  const plainText = decrypted.toString(CryptoJS.enc.Utf8);
  if (!plainText) {
    throw new Error('Decryption failed. Data may be corrupted or key is incorrect.');
  }
  return plainText;
}

/**
 * Helper to clear cached key (mostly used for testing purposes).
 */
export function clearCachedKey(): void {
  cachedKey = null;
}
