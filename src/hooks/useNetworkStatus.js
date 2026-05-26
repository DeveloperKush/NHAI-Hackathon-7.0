"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useNetworkStatus = useNetworkStatus;
const react_1 = require("react");
const connectionInfo_1 = require("../services/network/connectionInfo");
const awsSync_1 = require("../services/network/awsSync");
function useNetworkStatus() {
    const { isConnected, connectionType } = (0, connectionInfo_1.useNetworkStatus)();
    (0, react_1.useEffect)(() => {
        if (isConnected) {
            (0, awsSync_1.syncAuthLogs)().catch((err) => {
                console.error('Failed to auto-sync on network reconnect:', err);
            });
        }
    }, [isConnected]);
    return { isConnected, connectionType };
}
