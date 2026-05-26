import { useNetInfo } from '@react-native-community/netinfo';

export function useNetworkStatus() {
  const netInfo = useNetInfo();
  return {
    isConnected: netInfo.isConnected ?? false,
    connectionType: netInfo.type ?? 'unknown',
  };
}
