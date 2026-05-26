"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncAuthLogs = syncAuthLogs;
exports.triggerSyncOnConnect = triggerSyncOnConnect;
const netinfo_1 = __importDefault(require("@react-native-community/netinfo"));
const authLogs_1 = require("../database/authLogs");
const config_1 = require("../../constants/config");
/**
 * Synchronizes unsynced authentication logs to the AWS Sync endpoint.
 * Returns true if successful (including if there are no logs to sync), or false on failure.
 */
async function syncAuthLogs() {
    try {
        const netState = await netinfo_1.default.fetch();
        if (!netState.isConnected) {
            return false;
        }
        const logs = await (0, authLogs_1.getUnsyncedLogs)();
        if (logs.length === 0) {
            return true;
        }
        const url = config_1.AWS_SYNC_URL || process.env.EXPO_PUBLIC_AWS_SYNC_URL;
        if (!url) {
            console.error('AWS sync URL is not configured.');
            return false;
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout
        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ logs }),
                signal: controller.signal,
            });
        }
        catch (fetchError) {
            console.error('Network or timeout error during sync:', fetchError);
            return false;
        }
        finally {
            clearTimeout(timeoutId);
        }
        if (response.status === 200) {
            const body = await response.json();
            if (body && Array.isArray(body.received_logs)) {
                await (0, authLogs_1.deleteSyncedLogs)(body.received_logs);
                return true;
            }
        }
        console.error(`Sync failed. Status: ${response.status}`);
        return false;
    }
    catch (error) {
        console.error('Error in syncAuthLogs:', error);
        return false;
    }
}
/**
 * Subscribes to network status changes and triggers sync on connection.
 * Returns the unsubscribe function.
 */
function triggerSyncOnConnect() {
    return netinfo_1.default.addEventListener((state) => {
        if (state.isConnected) {
            syncAuthLogs().catch((err) => {
                console.error('Auto-sync failed on connect:', err);
            });
        }
    });
}
