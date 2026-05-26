import NetInfo from '@react-native-community/netinfo';
import { getUnsyncedLogs, deleteSyncedLogs } from '../database/authLogs';
import { AWS_SYNC_URL } from '../../constants/config';

/**
 * Synchronizes unsynced authentication logs to the AWS Sync endpoint.
 * Returns true if successful (including if there are no logs to sync), or false on failure.
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

    const url = AWS_SYNC_URL || process.env.EXPO_PUBLIC_AWS_SYNC_URL;
    if (!url) {
      console.error('AWS sync URL is not configured.');
      return false;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ logs }),
        signal: controller.signal,
      });
    } catch (fetchError) {
      console.error('Network or timeout error during sync:', fetchError);
      return false;
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status === 200) {
      const body = await response.json();
      if (body && Array.isArray(body.received_logs)) {
        await deleteSyncedLogs(body.received_logs);
        return true;
      }
    }

    console.error(`Sync failed. Status: ${response.status}`);
    return false;
  } catch (error) {
    console.error('Error in syncAuthLogs:', error);
    return false;
  }
}

/**
 * Subscribes to network status changes and triggers sync on connection.
 * Returns the unsubscribe function.
 */
export function triggerSyncOnConnect(): () => void {
  return NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      syncAuthLogs().catch((err) => {
        console.error('Auto-sync failed on connect:', err);
      });
    }
  });
}
