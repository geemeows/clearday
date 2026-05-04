-- Web Push device labels + last-delivered tracking.
--
-- The base web_push_subscriptions table from 0001 stores the endpoint + keys
-- needed to deliver a push. This adds:
--   * device_label: human label shown in Settings → Notifications → Devices
--     (e.g. "Chrome on macOS"); seeded from the User-Agent at register time
--     and editable later.
--   * last_delivered_at: stamped by web-push-dispatcher on a successful send.

alter table public.web_push_subscriptions
  add column if not exists device_label text,
  add column if not exists last_delivered_at timestamptz;
