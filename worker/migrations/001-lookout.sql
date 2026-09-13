-- Adds the 'lookout' type and makes `date` optional (a look-out item is an
-- open loop that may have no due date at all). SQLite cannot relax NOT NULL
-- or widen a CHECK in place, so the table is rebuilt and copied.

CREATE TABLE items_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('event','reminder','todo','lookout')),
  title TEXT NOT NULL,
  date TEXT,
  time TEXT,
  note TEXT,
  priority TEXT CHECK(priority IN ('high','med','low')),
  done INTEGER DEFAULT 0,
  deleted INTEGER DEFAULT 0,
  notify INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT INTO items_new (id,type,title,date,time,note,priority,done,deleted,notify,created_at)
  SELECT id,type,title,date,time,note,priority,done,deleted,notify,created_at FROM items;

DROP TABLE items;
ALTER TABLE items_new RENAME TO items;

CREATE INDEX IF NOT EXISTS idx_items_date ON items(date);
CREATE INDEX IF NOT EXISTS idx_items_live ON items(deleted, date);
CREATE INDEX IF NOT EXISTS idx_items_notify ON items(date, notify, done, deleted);
