-- Per-item look-out lead time, replacing the flat 5-day "due soon" threshold
-- with one the user sets when creating each look-out. Repurposes the old
-- reminder-era lead_days column (unused since push notifications were
-- removed) rather than adding a new one.
ALTER TABLE items RENAME COLUMN lead_days TO due_soon_days;
