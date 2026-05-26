'use strict';

const express = require('express');

const app = express();
const PORT = 3001;

// In-memory idempotency store: tracks log_ids already processed
const seenLogIds = new Set();

app.use(express.json());

/**
 * POST /api/sync
 * Accepts: { logs: AuthLog[] }
 * Returns: { message: "Batch synced successfully", received_logs: string[] }
 *
 * Idempotency: duplicate log_ids are acknowledged (200) but not re-processed.
 * Purge rule: client MUST only purge local logs after receiving HTTP 200.
 */
app.post('/api/sync', (req, res) => {
  const { logs } = req.body;

  if (!Array.isArray(logs)) {
    return res.status(400).json({ error: 'Request body must contain a "logs" array.' });
  }

  const receivedLogIds = [];

  for (const log of logs) {
    const logId = log.log_id;

    if (!logId) {
      return res.status(400).json({ error: 'Each log entry must have a "log_id" field.' });
    }

    if (seenLogIds.has(logId)) {
      // Idempotent: already processed — acknowledge without re-processing
      console.log(`[SKIP duplicate] log_id: ${logId}`);
    } else {
      // New log — process and record
      seenLogIds.add(logId);
      console.log(`[RECEIVED] log_id: ${logId} | user_id: ${log.user_id} | timestamp: ${log.timestamp}`);
    }

    // Always include in received_logs for client to know it was acknowledged
    receivedLogIds.push(logId);
  }

  return res.status(200).json({
    message: 'Batch synced successfully',
    received_logs: receivedLogIds,
  });
});

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', seen_count: seenLogIds.size });
});

app.listen(PORT, () => {
  console.log(`[Mock AWS Server] Running on http://localhost:${PORT}`);
  console.log(`[Mock AWS Server] POST /api/sync  — Accepts { logs: AuthLog[] }`);
  console.log(`[Mock AWS Server] GET  /health     — Server health check`);
});
