import { useEffect } from 'react';
import { useNetworkStatus as useConnectionInfo } from '../services/network/connectionInfo';
import { syncAuthLogs } from '../services/network/awsSync';

export function useNetworkStatus() {
  const { isConnected, connectionType } = useConnectionInfo();

  useEffect(() => {
    if (isConnected) {
      syncAuthLogs().catch((err) => {
        console.error('Failed to auto-sync on network reconnect:', err);
      });
    }
  }, [isConnected]);

  return { isConnected, connectionType };
}
