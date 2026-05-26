import { executeSql } from './sqlite';
import { getOrCreateEncryptionKey, encryptData, decryptData } from '../encryption/secureStorage';
import base64 from 'base-64';

/**
 * Converts Float32Array to a base64 string representation.
 */
function float32ArrayToBase64(array: Float32Array): string {
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  let binary = '';
  const len = bytes.length;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return base64.encode(binary);
}

/**
 * Converts a base64 string representation back to Float32Array.
 */
function base64ToFloat32Array(base64Str: string): Float32Array {
  const binary = base64.decode(base64Str);
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
export async function insertEnrolledFace(user_id: string, embedding: Float32Array): Promise<void> {
  // Ensure the encryption key is loaded
  await getOrCreateEncryptionKey();

  // Convert Float32Array to base64, then encrypt it
  const base64Str = float32ArrayToBase64(embedding);
  const encryptedEmbedding = encryptData(base64Str);
  const enrolledAt = new Date().toISOString();

  await executeSql(
    'INSERT OR REPLACE INTO enrolled_faces (user_id, embedding, enrolled_at) VALUES (?, ?, ?)',
    [user_id, encryptedEmbedding, enrolledAt]
  );
}

/**
 * Retrieves all enrolled faces from the database, decrypting the embedding on retrieval.
 */
export async function getAllEnrolledFaces(): Promise<{ user_id: string; embedding: Float32Array }[]> {
  // Ensure the encryption key is loaded
  await getOrCreateEncryptionKey();

  const result = await executeSql('SELECT user_id, embedding FROM enrolled_faces');
  const faces: { user_id: string; embedding: Float32Array }[] = [];

  for (let i = 0; i < result.rows.length; i++) {
    const row = result.rows.item(i);
    try {
      const decryptedBase64 = decryptData(row.embedding);
      const embedding = base64ToFloat32Array(decryptedBase64);
      faces.push({ user_id: row.user_id, embedding });
    } catch (err) {
      console.error(`Failed to decrypt embedding for user ${row.user_id}:`, err);
    }
  }

  return faces;
}

/**
 * Deletes an enrolled face by user_id.
 */
export async function deleteEnrolledFace(user_id: string): Promise<void> {
  await executeSql('DELETE FROM enrolled_faces WHERE user_id = ?', [user_id]);
}
