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
  due_soon_days INTEGER NOT NULL DEFAULT 0, -- look-outs only: days before due that the "due soon" badge lights up
  done INTEGER DEFAULT 0,
  done_at TEXT,                    -- IST date last marked done; NULL if never/not done
  deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_items_date ON items(date);
CREATE INDEX IF NOT EXISTS idx_items_live ON items(deleted, date);

-- Scribble: one free-text scratchpad, not tied to any date or item.
CREATE TABLE IF NOT EXISTS scribble (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  text TEXT NOT NULL DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO scribble (id, text) VALUES (1, '');
