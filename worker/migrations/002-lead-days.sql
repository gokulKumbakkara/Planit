-- "Remind me N days before as well" — e.g. a doctor's appointment you must
-- book a week ahead. 0 means notify only on the day itself.
ALTER TABLE items ADD COLUMN lead_days INTEGER NOT NULL DEFAULT 0;
