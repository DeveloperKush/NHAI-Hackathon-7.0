# Binary Brains Mock AWS Server

Simulates AWS API Gateway + DynamoDB for offline auth sync testing.

## Endpoints
- `POST /api/sync` — Batch upload auth logs
- `GET /health` — Health check

## Deploy
```bash
npm install
npm start
```
