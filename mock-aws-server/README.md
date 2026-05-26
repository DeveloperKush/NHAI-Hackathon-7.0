# Mock AWS Sync Server

Lightweight Express server that simulates the AWS batch-sync endpoint for local development and testing.

---

## Prerequisites

```bash
cd mock-aws-server
npm install
```

---

## Start the Server

```bash
node server.js
```

Server runs on **http://localhost:3001**

---

## Endpoints

### `POST /api/sync`

Accepts a batch of `AuthLog` objects and returns acknowledgement.

**Request body:**
```json
{
  "logs": [
    {
      "log_id": "uuid-string",
      "user_id": "u1",
      "timestamp": "2026-05-25T10:00:00Z",
      "gps_lat": 12.97,
      "gps_lng": 77.59,
      "device_id": "d1",
      "similarity_score": 0.85,
      "photo_thumb": "data:image/jpeg;base64,abc123"
    }
  ]
}
```

**Success response (HTTP 200):**
```json
{
  "message": "Batch synced successfully",
  "received_logs": ["uuid-string"]
}
```

> **Purge rule:** The mobile client MUST only delete local log rows after receiving HTTP 200. On 4xx/5xx the local queue is retained and retried.

### `GET /health`

Returns server health and count of seen log IDs.

---

## Idempotency

The server tracks all received `log_id` values in memory. Duplicate submissions return HTTP 200 but are not reprocessed. This prevents double-counting on network retries.

---

## Test with curl

```bash
curl -X POST http://localhost:3001/api/sync \
  -H "Content-Type: application/json" \
  -d '{"logs":[{"log_id":"test-1","user_id":"u1","timestamp":"2026-05-25T10:00:00Z","gps_lat":12.97,"gps_lng":77.59,"device_id":"d1","similarity_score":0.85,"photo_thumb":"data:image/jpeg;base64,abc123"}]}'
```

Expected response:
```json
{
  "message": "Batch synced successfully",
  "received_logs": ["test-1"]
}
```
