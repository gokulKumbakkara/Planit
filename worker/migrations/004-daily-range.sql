-- Two meanings for a date range:
--   daily = 0  "sometime between these dates" — notify on the start day only
--   daily = 1  "runs every day between these dates" — notify each day of it
ALTER TABLE items ADD COLUMN daily INTEGER NOT NULL DEFAULT 0;
