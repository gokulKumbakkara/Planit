-- Tracks the IST date an item was last marked done, independent of its own
-- `date` field — lets "completed today" surface on Today even when the item
-- was originally due on a different day (or has no date at all).
ALTER TABLE items ADD COLUMN done_at TEXT;
