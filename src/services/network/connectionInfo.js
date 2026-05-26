"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useNetworkStatus = useNetworkStatus;
const netinfo_1 = require("@react-native-community/netinfo");
function useNetworkStatus() {
    const netInfo = (0, netinfo_1.useNetInfo)();
    return {
        isConnected: netInfo.isConnected ?? false,
        connectionType: netInfo.type ?? 'unknown',
    };
}
