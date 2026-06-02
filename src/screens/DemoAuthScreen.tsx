import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FaceAuthenticator from '../components/FaceAuthenticator';
import LivenessFeedback from '../components/LivenessFeedback';
import { AuthLog, LivenessError } from '../types';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { syncAuthLogs, getUnsyncedCount, triggerSyncOnConnect } from '../services/network/awsSync';
import { executeSql } from '../services/database/sqlite';
import { useFocusEffect } from '@react-navigation/native';
import { useIsFocused } from '@react-navigation/native';
import { DEMO_MODE, LAST_SYNC_STORAGE_KEY } from '../constants/config';

export interface DemoAuthScreenProps {
  navigation: any;
}

export default function DemoAuthScreen({ navigation }: DemoAuthScreenProps) {
  const { isConnected } = useNetworkStatus();
  const isFocused = useIsFocused();

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error' | 'warning'>('success');
  const [activeLog, setActiveLog] = useState<AuthLog | null>(null);
  const [recentLogs, setRecentLogs] = useState<AuthLog[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Sync status state
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [lastSyncTs, setLastSyncTs] = useState<string | null>(null);
  // 'idle' | 'syncing' | 'success' | 'failed'
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'failed'>('idle');

  // Remount camera when returning from EnrollmentScreen (fixes blank preview on Android)
  useFocusEffect(
    useCallback(() => {
      setRefreshKey((k) => k + 1);
      refreshSyncStatus();
      return () => {};
    }, [])
  );

  // Auto-sync on connect
  useEffect(() => {
    const unsub = triggerSyncOnConnect();
    return unsub;
  }, []);

  const refreshSyncStatus = async () => {
    const count = await getUnsyncedCount();
    setUnsyncedCount(count);
    try {
      const ts = await AsyncStorage.getItem(LAST_SYNC_STORAGE_KEY);
      setLastSyncTs(ts);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    refreshSyncStatus();
    fetchRecentLogs();
  }, []);

  const fetchRecentLogs = async () => {
    try {
      const result = await executeSql(
        `SELECT 
          log_id, user_id, timestamp, gps_lat, gps_lng,
          device_id, similarity_score, photo_thumb
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

  const handleAuthSuccess = async (log: AuthLog) => {
    setToastType('success');
    setToastMessage(`Authenticated: ${log.user_id}`);
    setActiveLog(log);
    await fetchRecentLogs();
    await refreshSyncStatus();
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
    setIsSyncing(true);
    setSyncStatus('syncing');
    try {
      const success = await syncAuthLogs();
      if (success) {
        setSyncStatus('success');
        setToastType('success');
        setToastMessage('Synchronization complete!');
      } else {
        setSyncStatus('failed');
        setToastType('error');
        setToastMessage('Sync failed. Check network status.');
      }
      await fetchRecentLogs();
      await refreshSyncStatus();
    } catch (err: any) {
      setSyncStatus('failed');
      setToastType('error');
      setToastMessage(err.message || 'Error occurred during sync.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearDatabase = async () => {
    try {
      await executeSql('DELETE FROM enrolled_faces');
      await executeSql('DELETE FROM auth_logs');
      setToastType('success');
      setToastMessage('Database cleared successfully!');
      setActiveLog(null);
      await fetchRecentLogs();
      await refreshSyncStatus();
    } catch (err: any) {
      setToastType('error');
      setToastMessage('Failed to clear database: ' + err.message);
    }
  };

  const formatTime = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleTimeString([], {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  // Human-readable sync status label
  const syncStatusLabel = (() => {
    if (syncStatus === 'syncing') return 'Syncing...';
    if (!isConnected) {
      return unsyncedCount > 0
        ? `Pending: ${unsyncedCount} log${unsyncedCount > 1 ? 's' : ''} (offline)`
        : 'Offline';
    }
    if (syncStatus === 'failed') return `Failed — will retry on reconnect`;
    if (unsyncedCount === 0) return 'Synced';
    return `Pending: ${unsyncedCount} log${unsyncedCount > 1 ? 's' : ''}`;
  })();

  const syncStatusColor = (() => {
    if (syncStatus === 'syncing') return '#ff9800';
    if (syncStatus === 'failed') return '#f44336';
    if (unsyncedCount === 0) return '#4caf50';
    return '#ff9800';
  })();

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
        {/* Sync Status Badge */}
        <View style={styles.syncStatusCard}>
          <View style={styles.syncStatusRow}>
            <View style={[styles.syncDot, { backgroundColor: syncStatusColor }]} />
            <Text style={[styles.syncStatusText, { color: syncStatusColor }]}>
              {syncStatusLabel}
            </Text>
            {/* HACKATHON: always show Sync Now so judges can trigger manually */}
            <TouchableOpacity
              style={[
                styles.syncNowPill,
                (isSyncing || !isConnected) && styles.syncNowPillDisabled,
              ]}
              onPress={handleSyncNow}
              disabled={isSyncing || !isConnected}
              testID="sync-button"
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.syncNowPillText}>Sync Now</Text>
              )}
            </TouchableOpacity>
          </View>
          {lastSyncTs && (
            <Text style={styles.lastSyncText}>
              Last sync: {formatTime(lastSyncTs)}
            </Text>
          )}
        </View>

        {/* Camera */}
        <View style={styles.cameraContainer}>
          {isFocused ? (
            <FaceAuthenticator
              key={refreshKey}
              onAuthSuccess={handleAuthSuccess}
              onLivenessFailed={handleLivenessFailed}
              onEnrollmentRequired={handleEnrollmentRequired}
            />
          ) : (
            <View />
          )}
        </View>

        {/* Active Auth Result Card */}
        {activeLog && (
          <View style={styles.activeLogCard} testID="active-log-card">
            <Text style={styles.cardTitle}>
              {/* HACKATHON: success animation via green border + title color */}
              ✓ Authenticated
            </Text>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>User ID</Text>
              <Text style={styles.cardValue}>{activeLog.user_id}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Time</Text>
              <Text style={styles.cardValue}>{formatTime(activeLog.timestamp)}</Text>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>GPS</Text>
              <Text style={styles.cardValue}>
                {activeLog.gps_lat != null && activeLog.gps_lng != null
                  ? `${activeLog.gps_lat.toFixed(4)}, ${activeLog.gps_lng.toFixed(4)}`
                  : 'N/A'}
              </Text>
            </View>
            {/* HACKATHON: show similarity score when DEMO_MODE — builds judge confidence */}
            {DEMO_MODE && (
              <View style={styles.cardRow}>
                <Text style={styles.cardLabel}>Similarity Score</Text>
                <Text style={[styles.cardValue, styles.scoreValue]}>
                  {(activeLog.similarity_score * 100).toFixed(1)}%
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Controls */}
        <View style={styles.controlsContainer}>
          <TouchableOpacity
            style={styles.clearDbButton}
            onPress={handleClearDatabase}
            testID="clear-db-button"
          >
            <Text style={styles.clearDbButtonText}>Clear Database</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Logs */}
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
                  {DEMO_MODE && (
                    <Text style={styles.logDetails}>
                      Score: {(log.similarity_score * 100).toFixed(1)}%
                    </Text>
                  )}
                  <Text style={styles.logDetails}>
                    GPS:{' '}
                    {log.gps_lat != null && log.gps_lng != null
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
    color: '#1a237e',
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
  // Sync status badge card
  syncStatusCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 4,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  syncStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  syncStatusText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  syncNowPill: {
    backgroundColor: '#1a237e',
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 16,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncNowPillDisabled: {
    backgroundColor: '#9e9e9e',
  },
  syncNowPillText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  lastSyncText: {
    fontSize: 11,
    color: '#757575',
    marginLeft: 18,
  },
  cameraContainer: {
    width: '100%',
    aspectRatio: 3 / 4,
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
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#4caf50',
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
  scoreValue: {
    color: '#1a237e',
    fontSize: 16,
  },
  controlsContainer: {
    gap: 12,
  },
  clearDbButton: {
    backgroundColor: '#f44336',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearDbButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
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
