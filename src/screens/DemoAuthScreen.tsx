import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import FaceAuthenticator from '../components/FaceAuthenticator';
import LivenessFeedback from '../components/LivenessFeedback';
import { AuthLog, LivenessError } from '../types';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { syncAuthLogs } from '../services/network/awsSync';
import { executeSql } from '../services/database/sqlite';

export interface DemoAuthScreenProps {
  navigation: any;
}

export default function DemoAuthScreen({ navigation }: DemoAuthScreenProps) {
  const { isConnected } = useNetworkStatus();
  
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error' | 'warning'>('success');
  const [activeLog, setActiveLog] = useState<AuthLog | null>(null);
  const [recentLogs, setRecentLogs] = useState<AuthLog[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); // Trigger to reload camera on retry

  // Fetch the last 5 auth logs from SQLite
  const fetchRecentLogs = async () => {
    try {
      const result = await executeSql(
        `SELECT 
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
        LIMIT 5`
      );
      const logs: AuthLog[] = [];
      for (let i = 0; i < result.rows.length; i++) {
        logs.push(result.rows.item(i));
      }
      setRecentLogs(logs);
    } catch (err) {
      console.error('Failed to load recent auth logs:', err);
    }
  };

  useEffect(() => {
    fetchRecentLogs();
  }, []);

  const handleAuthSuccess = async (log: AuthLog) => {
    setToastType('success');
    setToastMessage(`Authenticated: ${log.user_id}`);
    setActiveLog(log);
    await fetchRecentLogs();
  };

  const handleLivenessFailed = (err: LivenessError) => {
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
    if (!isConnected) return;
    setIsSyncing(true);
    try {
      const success = await syncAuthLogs();
      if (success) {
        setToastType('success');
        setToastMessage('Synchronization complete!');
      } else {
        setToastType('error');
        setToastMessage('Sync failed. Please check network status.');
      }
      await fetchRecentLogs();
    } catch (err: any) {
      setToastType('error');
      setToastMessage(err.message || 'Error occurred during sync.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Helper to format timestamps
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return isoString;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>NHAI Face Verification</Text>
        <TouchableOpacity
          style={styles.enrollButton}
          onPress={() => navigation.navigate('EnrollmentScreen')}
          testID="enroll-nav-button"
        >
          <Text style={styles.enrollButtonText}>+ Enroll</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Camera container with fixed height */}
        <View style={styles.cameraContainer}>
          <FaceAuthenticator
            key={refreshKey}
            onAuthSuccess={handleAuthSuccess}
            onLivenessFailed={handleLivenessFailed}
            onEnrollmentRequired={handleEnrollmentRequired}
          />
        </View>

        {/* Detailed Card for the Active Authentication Log */}
        {activeLog && (
          <View style={styles.activeLogCard} testID="active-log-card">
            <Text style={styles.cardTitle}>Success Details</Text>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>User ID:</Text>
              <Text style={styles.cardValue}>{activeLog.user_id}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Time:</Text>
              <Text style={styles.cardValue}>{formatTime(activeLog.timestamp)}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>GPS Coordinates:</Text>
              <Text style={styles.cardValue}>
                {activeLog.gps_lat !== null && activeLog.gps_lng !== null
                  ? `${activeLog.gps_lat.toFixed(4)}, ${activeLog.gps_lng.toFixed(4)}`
                  : 'N/A'}
              </Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Similarity Score:</Text>
              <Text style={styles.cardValue}>{(activeLog.similarity_score * 100).toFixed(1)}%</Text>
            </View>
          </View>
        )}

        {/* Sync Controls */}
        {isConnected && (
          <TouchableOpacity
            style={[styles.syncButton, isSyncing && styles.disabledButton]}
            onPress={handleSyncNow}
            disabled={isSyncing}
            testID="sync-button"
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.syncButtonText}>Sync Now</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Recent Authentication Logs List */}
        <View style={styles.logsSection}>
          <Text style={styles.sectionTitle}>Recent Logs (SQLite)</Text>
          <View style={styles.logsListContainer}>
            {recentLogs.map((log) => (
              <View key={log.log_id} style={styles.logItem} testID={`log-item-${log.log_id}`}>
                <View style={styles.logItemHeader}>
                  <Text style={styles.logUserId}>{log.user_id}</Text>
                  <Text style={styles.logTime}>{formatTime(log.timestamp)}</Text>
                </View>
                <View style={styles.logItemBody}>
                  <Text style={styles.logDetails}>Score: {(log.similarity_score * 100).toFixed(1)}%</Text>
                  <Text style={styles.logDetails}>
                    GPS: {log.gps_lat !== null && log.gps_lng !== null
                      ? `${log.gps_lat.toFixed(4)}, ${log.gps_lng.toFixed(4)}`
                      : 'N/A'}
                  </Text>
                </View>
              </View>
            ))}
            {recentLogs.length === 0 && (
              <Text style={styles.emptyText}>No authentication logs recorded yet.</Text>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Floating Toast Feedbacks */}
      {toastMessage && (
        <LivenessFeedback
          message={toastMessage}
          type={toastType}
          onDismiss={() => setToastMessage(null)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
