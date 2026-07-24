import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUnsyncedLogs, deleteSyncedLogs } from '../database/authLogs';
import { AWS_SYNC_URL, LAST_SYNC_STORAGE_KEY } from '../../constants/config';

/**
 * Returns the number of unsynced auth logs in SQLite.
 * Used by DemoAuthScreen sync badge.
 */
export async function getUnsyncedCount(): Promise<number> {
  try {
    const logs = await getUnsyncedLogs();
    return logs.length;
  } catch {
    return 0;
  }
}

/**
 * Synchronizes unsynced authentication logs to the AWS Sync endpoint.
 * Returns true if successful (including if there are no logs to sync), or false on failure.
 *
 * Safety rules:
 *   - Never purge unless HTTP 200 AND received_logs is a non-empty array
 *   - Only purge log_ids confirmed by the server (partial-batch safe)
 *   - On any error/timeout/malformed response: return false, leave SQLite intact
 */
export async function syncAuthLogs(): Promise<boolean> {
  try {
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      return false;
    }

    const logs = await getUnsyncedLogs();
    if (logs.length === 0) {
      return true;
    }

    const url = AWS_SYNC_URL;
    if (!url) {
      console.error('AWS sync URL is not configured.');
      return false;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs }),
        signal: controller.signal,
      });
    } catch (fetchError) {
      console.warn('Network or timeout error during sync:', fetchError);
      return false; // DO NOT purge
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      console.warn('Sync failed with HTTP status:', response.status);
      return false; // DO NOT purge
    }

    let data: any;
    try {
      data = await response.json();
    } catch (parseError) {
      console.warn('Sync response is not valid JSON:', parseError);
      return false; // DO NOT purge
    }

    if (!data.received_logs || !Array.isArray(data.received_logs)) {
      console.warn('Sync response malformed — missing received_logs array:', data);
      return false; // DO NOT purge
    }

    // Only purge log_ids explicitly confirmed by the server (partial-batch safe)
    if (data.received_logs.length > 0) {
      await deleteSyncedLogs(data.received_logs);
    }

    // Persist last successful sync timestamp for UI display
    await AsyncStorage.setItem(LAST_SYNC_STORAGE_KEY, new Date().toISOString());

    return true;
  } catch (error) {
    console.error('Unexpected error in syncAuthLogs:', error);
    return false;
  }
}

/**
 * Subscribes to network state changes and auto-triggers sync on connect.
 * Returns unsubscribe function — call it in useEffect cleanup.
 */
export function triggerSyncOnConnect(): () => void {
  return NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      syncAuthLogs().catch((err) => {
        console.warn('Auto-sync on connect failed:', err);
      });
    }
  });
}
