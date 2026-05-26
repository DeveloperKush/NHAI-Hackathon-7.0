"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = DemoAuthScreen;
const react_1 = __importStar(require("react"));
const react_native_1 = require("react-native");
const FaceAuthenticator_1 = __importDefault(require("../components/FaceAuthenticator"));
const LivenessFeedback_1 = __importDefault(require("../components/LivenessFeedback"));
const useNetworkStatus_1 = require("../hooks/useNetworkStatus");
const awsSync_1 = require("../services/network/awsSync");
const sqlite_1 = require("../services/database/sqlite");
function DemoAuthScreen({ navigation }) {
    const { isConnected } = (0, useNetworkStatus_1.useNetworkStatus)();
    const [toastMessage, setToastMessage] = (0, react_1.useState)(null);
    const [toastType, setToastType] = (0, react_1.useState)('success');
    const [activeLog, setActiveLog] = (0, react_1.useState)(null);
    const [recentLogs, setRecentLogs] = (0, react_1.useState)([]);
    const [isSyncing, setIsSyncing] = (0, react_1.useState)(false);
    const [refreshKey, setRefreshKey] = (0, react_1.useState)(0); // Trigger to reload camera on retry
    // Fetch the last 5 auth logs from SQLite
    const fetchRecentLogs = async () => {
        try {
            const result = await (0, sqlite_1.executeSql)(`SELECT 
          log_id, 
          user_id, 
          timestamp, 
          gps_lat, 
          gps_lng, 
          device_id, 
          similarity_score, 
          photo_thumb 
        FROM auth_logs 
        ORDER BY timestamp DESC 
        LIMIT 5`);
            const logs = [];
            for (let i = 0; i < result.rows.length; i++) {
                logs.push(result.rows.item(i));
            }
            setRecentLogs(logs);
        }
        catch (err) {
            console.error('Failed to load recent auth logs:', err);
        }
    };
    (0, react_1.useEffect)(() => {
        fetchRecentLogs();
    }, []);
    const handleAuthSuccess = async (log) => {
        setToastType('success');
        setToastMessage(`Authenticated: ${log.user_id}`);
        setActiveLog(log);
        await fetchRecentLogs();
    };
    const handleLivenessFailed = (err) => {
        setToastType('error');
        setToastMessage(`${err.code}: ${err.message}`);
        setActiveLog(null);
    };
    const handleEnrollmentRequired = () => {
        setToastType('warning');
        setToastMessage('Enrollment required: User not recognized.');
        navigation.navigate('EnrollmentScreen');
    };
    const handleSyncNow = async () => {
        if (!isConnected)
            return;
        setIsSyncing(true);
        try {
            const success = await (0, awsSync_1.syncAuthLogs)();
            if (success) {
                setToastType('success');
                setToastMessage('Synchronization complete!');
            }
            else {
                setToastType('error');
                setToastMessage('Sync failed. Please check network status.');
            }
            await fetchRecentLogs();
        }
        catch (err) {
            setToastType('error');
            setToastMessage(err.message || 'Error occurred during sync.');
        }
        finally {
            setIsSyncing(false);
        }
    };
    // Helper to format timestamps
    const formatTime = (isoString) => {
        try {
            const date = new Date(isoString);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
        catch {
            return isoString;
        }
    };
    return (<react_native_1.SafeAreaView style={styles.container}>
      <react_native_1.View style={styles.header}>
        <react_native_1.Text style={styles.headerTitle}>NHAI Face Verification</react_native_1.Text>
        <react_native_1.TouchableOpacity style={styles.enrollButton} onPress={() => navigation.navigate('EnrollmentScreen')} testID="enroll-nav-button">
          <react_native_1.Text style={styles.enrollButtonText}>+ Enroll</react_native_1.Text>
        </react_native_1.TouchableOpacity>
      </react_native_1.View>

      <react_native_1.ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Camera container with fixed height */}
        <react_native_1.View style={styles.cameraContainer}>
          <FaceAuthenticator_1.default key={refreshKey} onAuthSuccess={handleAuthSuccess} onLivenessFailed={handleLivenessFailed} onEnrollmentRequired={handleEnrollmentRequired}/>
        </react_native_1.View>

        {/* Detailed Card for the Active Authentication Log */}
        {activeLog && (<react_native_1.View style={styles.activeLogCard} testID="active-log-card">
            <react_native_1.Text style={styles.cardTitle}>Success Details</react_native_1.Text>
            <react_native_1.View style={styles.cardRow}>
              <react_native_1.Text style={styles.cardLabel}>User ID:</react_native_1.Text>
              <react_native_1.Text style={styles.cardValue}>{activeLog.user_id}</react_native_1.Text>
            </react_native_1.View>
            <react_native_1.View style={styles.cardRow}>
              <react_native_1.Text style={styles.cardLabel}>Time:</react_native_1.Text>
              <react_native_1.Text style={styles.cardValue}>{formatTime(activeLog.timestamp)}</react_native_1.Text>
            </react_native_1.View>
            <react_native_1.View style={styles.cardRow}>
              <react_native_1.Text style={styles.cardLabel}>GPS Coordinates:</react_native_1.Text>
              <react_native_1.Text style={styles.cardValue}>
                {activeLog.gps_lat !== null && activeLog.gps_lng !== null
                ? `${activeLog.gps_lat.toFixed(4)}, ${activeLog.gps_lng.toFixed(4)}`
                : 'N/A'}
              </react_native_1.Text>
            </react_native_1.View>
            <react_native_1.View style={styles.cardRow}>
              <react_native_1.Text style={styles.cardLabel}>Similarity Score:</react_native_1.Text>
              <react_native_1.Text style={styles.cardValue}>{(activeLog.similarity_score * 100).toFixed(1)}%</react_native_1.Text>
            </react_native_1.View>
          </react_native_1.View>)}

        {/* Sync Controls */}
        {isConnected && (<react_native_1.TouchableOpacity style={[styles.syncButton, isSyncing && styles.disabledButton]} onPress={handleSyncNow} disabled={isSyncing} testID="sync-button">
            {isSyncing ? (<react_native_1.ActivityIndicator size="small" color="#ffffff"/>) : (<react_native_1.Text style={styles.syncButtonText}>Sync Now</react_native_1.Text>)}
          </react_native_1.TouchableOpacity>)}

        {/* Recent Authentication Logs List */}
        <react_native_1.View style={styles.logsSection}>
          <react_native_1.Text style={styles.sectionTitle}>Recent Logs (SQLite)</react_native_1.Text>
          <react_native_1.View style={styles.logsListContainer}>
            {recentLogs.map((log) => (<react_native_1.View key={log.log_id} style={styles.logItem} testID={`log-item-${log.log_id}`}>
                <react_native_1.View style={styles.logItemHeader}>
                  <react_native_1.Text style={styles.logUserId}>{log.user_id}</react_native_1.Text>
                  <react_native_1.Text style={styles.logTime}>{formatTime(log.timestamp)}</react_native_1.Text>
                </react_native_1.View>
                <react_native_1.View style={styles.logItemBody}>
                  <react_native_1.Text style={styles.logDetails}>Score: {(log.similarity_score * 100).toFixed(1)}%</react_native_1.Text>
                  <react_native_1.Text style={styles.logDetails}>
                    GPS: {log.gps_lat !== null && log.gps_lng !== null
                ? `${log.gps_lat.toFixed(4)}, ${log.gps_lng.toFixed(4)}`
                : 'N/A'}
                  </react_native_1.Text>
                </react_native_1.View>
              </react_native_1.View>))}
            {recentLogs.length === 0 && (<react_native_1.Text style={styles.emptyText}>No authentication logs recorded yet.</react_native_1.Text>)}
          </react_native_1.View>
        </react_native_1.View>
      </react_native_1.ScrollView>

      {/* Floating Toast Feedbacks */}
      {toastMessage && (<LivenessFeedback_1.default message={toastMessage} type={toastType} onDismiss={() => setToastMessage(null)}/>)}
    </react_native_1.SafeAreaView>);
}
const styles = react_native_1.StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#ffffff',
    },
    header: {
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f5f5f5',
        backgroundColor: '#ffffff',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1a237e', // Primary Navy
    },
    enrollButton: {
        backgroundColor: '#1a237e',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 6,
    },
    enrollButtonText: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    scrollContainer: {
        padding: 16,
        gap: 16,
        paddingBottom: 40,
    },
    cameraContainer: {
        height: 350,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#000000',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.23,
        shadowRadius: 2.62,
    },
    activeLogCard: {
        backgroundColor: '#f5f5f5', // Surface grey
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#4caf50', // Success green border
        gap: 8,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#4caf50',
        marginBottom: 4,
    },
    cardRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    cardLabel: {
        fontSize: 14,
        color: '#757575',
        fontWeight: '500',
    },
    cardValue: {
        fontSize: 14,
        color: '#212121',
        fontWeight: 'bold',
    },
    syncButton: {
        backgroundColor: '#1a237e',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    syncButtonText: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 16,
    },
    disabledButton: {
        backgroundColor: '#757575',
    },
    logsSection: {
        gap: 8,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#212121',
    },
    logsListContainer: {
        gap: 10,
    },
    logItem: {
        backgroundColor: '#f5f5f5',
        borderRadius: 8,
        padding: 12,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        gap: 4,
    },
    logItemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    logUserId: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#212121',
    },
    logTime: {
        fontSize: 12,
        color: '#757575',
    },
    logItemBody: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    logDetails: {
        fontSize: 12,
        color: '#757575',
    },
    emptyText: {
        fontSize: 14,
        color: '#757575',
        fontStyle: 'italic',
        textAlign: 'center',
        paddingVertical: 20,
    },
});
