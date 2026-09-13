-- D1 schema
-- Apply with: wrangler d1 execute planit-db --file=worker/schema.sql --remote

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('event','todo','lookout')),
  title TEXT NOT NULL,
  date TEXT,                       -- optional for look-outs and tasks; start of the window when end_date is set
  end_date TEXT,                   -- optional: last day of a date range
  daily INTEGER NOT NULL DEFAULT 0, -- 1 = the range repeats daily, 0 = any one day in it
  time TEXT,
  note TEXT,
  priority TEXT CHECK(priority IN ('high','med','low')),
  done INTEGER DEFAULT 0,
  deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_items_date ON items(date);
CREATE INDEX IF NOT EXISTS idx_items_live ON items(deleted, date);
