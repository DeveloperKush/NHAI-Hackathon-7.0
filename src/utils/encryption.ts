/**
 * Re-exports encryption utilities from services/encryption/secureStorage.
 * Import from here for a stable public path, or directly from secureStorage.
 */
export {
  getOrCreateEncryptionKey,
  encryptData,
  decryptData,
  clearCachedKey,
} from '../services/encryption/secureStorage';
