# DB Migration Notes

## Apply Schema

1. Open Supabase SQL editor (or `psql`).
2. Execute `db/schema.sql` as a single migration.
3. Verify RPC functions exist:
   - `c3k_get_app_state`
   - `c3k_put_app_state`
   - `c3k_upsert_order_snapshot`
   - `c3k_get_order_snapshot`
   - `c3k_list_order_snapshots`

## Runtime Env

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `POSTGRES_STRICT_MODE=1` (recommended)

## Notification Worker

- Set `TELEGRAM_WORKER_SECRET`.
- Process queue with `POST /api/telegram/notifications/worker?key=...`.
- Inspect queue size with `GET /api/telegram/notifications/worker?key=...`.
