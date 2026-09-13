-- Precise, minute-level reminders for items with a time set — "10 min before",
-- "on time" — independent of the morning-digest day-level lead_days.
--   lead_minutes  NULL = off; 0 = on time; N = N minutes before item.time
--   time_push_date  IST date this precise ping last fired for, so the
--                   every-5-minutes cron never double-sends within a day
ALTER TABLE items ADD COLUMN lead_minutes INTEGER;
ALTER TABLE items ADD COLUMN time_push_date TEXT;
