# DB Migration Notes

## Apply Schema

1. Open Supabase SQL editor (or `psql`).
2. Execute `db/schema.sql` as a single migration.
3. If you migrate an existing ceramic catalog to audio-only, execute `db/supabase-audio-only-fix.sql`.
4. For demo data (artists, tracks, showcase, test orders), execute `db/supabase-seed-test-content.sql`.
5. Verify RPC functions exist:
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
- Set `CRON_SECRET` (recommended for Vercel Cron Authorization header).
- Process queue with `POST /api/telegram/notifications/worker?key=...`.
- Trigger queue processing with `GET /api/telegram/notifications/worker` (used by Vercel Cron).
- Inspect queue size with `GET /api/telegram/notifications/worker?mode=status&key=...`.
