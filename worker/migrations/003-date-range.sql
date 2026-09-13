-- A window rather than a fixed day: "sometime this week, day not settled yet".
-- `date` is the start of the window, `end_date` the last acceptable day.
-- The morning push still fires on the start date.
ALTER TABLE items ADD COLUMN end_date TEXT;
