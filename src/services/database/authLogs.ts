import { executeSql } from './sqlite';
import { AuthLog } from '../../types';

/**
 * Inserts a new authentication log. The 'synced' column is set to 0.
 */
export async function insertAuthLog(log: AuthLog): Promise<void> {
  await executeSql(
    `INSERT OR REPLACE INTO auth_logs (
      log_id,
      user_id,
      timestamp,
      gps_lat,
      gps_lng,
      device_id,
      similarity_score,
      photo_thumb,
      synced
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      log.log_id,
      log.user_id,
      log.timestamp,
      log.gps_lat,
      log.gps_lng,
      log.device_id,
      log.similarity_score,
      log.photo_thumb,
    ]
  );
}

/**
 * Retrieves all authentication logs that have not yet been synced.
 */
export async function getUnsyncedLogs(): Promise<AuthLog[]> {
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
    WHERE synced = 0`
  );

  const logs: AuthLog[] = [];
  for (let i = 0; i < result.rows.length; i++) {
    const row = result.rows.item(i);
    logs.push({
      log_id: row.log_id,
      user_id: row.user_id,
      timestamp: row.timestamp,
      gps_lat: row.gps_lat,
      gps_lng: row.gps_lng,
      device_id: row.device_id,
      similarity_score: row.similarity_score,
      photo_thumb: row.photo_thumb,
    });
  }

  return logs;
}

/**
 * Deletes synced logs from the database.
 */
export async function deleteSyncedLogs(log_ids: string[]): Promise<void> {
  if (log_ids.length === 0) {
    return;
  }

  const placeholders = log_ids.map(() => '?').join(',');
  await executeSql(
    `DELETE FROM auth_logs WHERE log_id IN (${placeholders})`,
    log_ids
  );
}
