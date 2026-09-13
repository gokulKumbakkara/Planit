/**
 * worker/index.js — personal dashboard
 * API routes and static-asset passthrough.
 *
 * NOTE: this app deliberately has no push notifications. Web Push only
 * delivers while the device has a network connection and, on iOS/iPadOS,
 * only once the site is installed to the Home Screen — it can't match a
 * phone's native, offline-capable notification system, and a silent miss is
 * worse than no reminder at all. The app leans on being checked, not pinged.
 */

const IST = 'Asia/Kolkata';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
  });

const fail = (message, status = 400) => json({ error: message }, status);

/** Today in IST as YYYY-MM-DD. `en-CA` formats as ISO. */
function istDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

const TYPES = new Set(['event', 'todo', 'lookout']);
// Look-outs are open loops ("waiting on a delivery"); todos are work you can
// jot down now and schedule later. Both may have no date at all. Events are
// appointments with the day — they always need one.
const DATELESS_OK = new Set(['lookout', 'todo']);
// Priority means importance, not urgency — independent of whether (or when)
// something is dated, so both open loops and tasks carry one.
const PRIORITIZED = new Set(['todo', 'lookout']);
const PRIORITIES = new Set(['high', 'med', 'low']);

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const toFlag = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);

async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

/* ── /api/items ─────────────────────────────────────────────────────────── */

async function listItems(request, env) {
  const q = new URL(request.url).searchParams;
  const where = ['deleted = 0'];
  const binds = [];

  const type = q.get('type');
  if (type) {
    if (!TYPES.has(type)) return fail('type must be event, todo or lookout');
    where.push('type = ?');
    binds.push(type);
  }

  const done = q.get('done');
  if (done !== null) {
    if (done !== '0' && done !== '1') return fail('done must be 0 or 1');
    where.push('done = ?');
    binds.push(Number(done));
  }

  const date = q.get('date');
  if (date) {
    if (!isDate(date)) return fail('date must be YYYY-MM-DD');
    where.push('date = ?');
    binds.push(date);
  }

  // Undated look-out items sort after everything dated.
  const sql = `SELECT * FROM items WHERE ${where.join(' AND ')}`
    + ' ORDER BY (date IS NULL) ASC, date ASC, created_at ASC, id ASC';
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json(results ?? []);
}

async function createItem(request, env) {
  const body = await readJson(request);
  if (!body) return fail('Body must be a JSON object');

  const type = body.type;
  if (!TYPES.has(type)) return fail('type must be event, todo or lookout');

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return fail('title is required');
  if (title.length > 500) return fail('title must be 500 characters or fewer');

  let date = null;
  if (body.date === null || body.date === undefined || body.date === '') {
    if (!DATELESS_OK.has(type)) return fail('date is required as YYYY-MM-DD');
  } else {
    if (!isDate(body.date)) return fail('date must be YYYY-MM-DD');
    date = body.date;
  }

  const time = body.time ? String(body.time).slice(0, 5) : null;
  if (time !== null && !isTime(time)) return fail('time must be HH:MM');

  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 2000) : null;

  // Tasks and look-outs always carry a priority — low by default when the
  // caller doesn't say.
  let priority = null;
  if (PRIORITIZED.has(type)) {
    priority = body.priority ? String(body.priority).toLowerCase() : 'low';
    if (!PRIORITIES.has(priority)) return fail('priority must be high, med or low');
  }

  // Optional window: date is the first day it could happen, end_date the last.
  let endDate = null;
  if (body.end_date) {
    if (!isDate(body.end_date)) return fail('end_date must be YYYY-MM-DD');
    if (!date) return fail('end_date needs a start date');
    if (body.end_date < date) return fail('end_date cannot be before the start date');
    endDate = body.end_date;
  }

  // A daily range repeats every day between the two dates.
  const daily = endDate ? toFlag(body.daily) : 0;

  const row = await env.DB.prepare(
    `INSERT INTO items (type, title, date, end_date, daily, time, note, priority, done, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0) RETURNING *`,
  ).bind(type, title, date, endDate, daily, time, note, priority).first();

  return json(row, 201);
}

async function updateItem(request, env, id) {
  const body = await readJson(request);
  if (!body) return fail('Body must be a JSON object');

  const sets = [];
  const binds = [];
  const colIndex = new Map();
  const set = (col, val) => {
    if (colIndex.has(col)) { binds[colIndex.get(col)] = val; return; }   // last write wins
    colIndex.set(col, binds.length);
    sets.push(`${col} = ?`);
    binds.push(val);
  };

  // Cheap cache so the "is this a task?" lookup below only hits the DB once,
  // reusing the row the type-reclassification branch already fetched.
  let currentTypeCache;
  async function currentType() {
    if (currentTypeCache !== undefined) return currentTypeCache;
    const row = await env.DB.prepare('SELECT type FROM items WHERE id = ?').bind(id).first();
    currentTypeCache = row?.type ?? null;
    return currentTypeCache;
  }

  // Reclassifying an item (e.g. an appointment that needs to become a task).
  if ('type' in body) {
    if (!TYPES.has(body.type)) return fail('type must be event, todo or lookout');

    const current = await env.DB.prepare('SELECT type, date FROM items WHERE id = ?').bind(id).first();
    if (!current) return fail('Item not found', 404);
    currentTypeCache = current.type;

    // Only look-out items may be dateless, so anything else needs a date first.
    const nextDate = 'date' in body ? body.date : current.date;
    if (!DATELESS_OK.has(body.type) && !nextDate) {
      return fail(`A ${body.type} needs a date — set one in the same request`);
    }

    set('type', body.type);
    // Priority only applies to tasks and look-outs; drop it when leaving both.
    if (!PRIORITIZED.has(body.type) && !('priority' in body)) set('priority', null);
    // Default low when actually becoming one of those two kinds (never touch
    // it if the item already was one and stays one).
    if (PRIORITIZED.has(body.type) && !PRIORITIZED.has(current.type) && !('priority' in body)) set('priority', 'low');
  }

  if ('title' in body) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return fail('title cannot be empty');
    set('title', title.slice(0, 500));
  }
  if ('date' in body) {
    if (body.date === null || body.date === '') {
      set('date', null);
      set('end_date', null);                 // a window without a start is meaningless
      set('daily', 0);
    } else {
      if (!isDate(body.date)) return fail('date must be YYYY-MM-DD');
      set('date', body.date);
    }
  }
  if ('end_date' in body) {
    if (body.end_date === null || body.end_date === '') {
      set('end_date', null);
      set('daily', 0);                       // no range, nothing to repeat
    } else {
      if (!isDate(body.end_date)) return fail('end_date must be YYYY-MM-DD');
      const current = await env.DB.prepare('SELECT date FROM items WHERE id = ?').bind(id).first();
      if (!current) return fail('Item not found', 404);
      const start = 'date' in body && body.date ? body.date : current.date;
      if (!start) return fail('end_date needs a start date');
      if (body.end_date < start) return fail('end_date cannot be before the start date');
      set('end_date', body.end_date);
    }
  }
  if ('daily' in body) set('daily', toFlag(body.daily));
  if ('time' in body) {
    const time = body.time ? String(body.time).slice(0, 5) : null;
    if (time !== null && !isTime(time)) return fail('time must be HH:MM');
    set('time', time);
  }
  if ('note' in body) {
    set('note', typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 2000) : null);
  }
  if ('priority' in body) {
    if (body.priority === null || body.priority === '') {
      // Clearing priority on a task or look-out collapses to the default
      // (low) rather than leaving it genuinely unset; for every other type
      // it's null, since priority simply doesn't apply there.
      const willHavePriority = 'type' in body ? PRIORITIZED.has(body.type) : PRIORITIZED.has(await currentType());
      set('priority', willHavePriority ? 'low' : null);
    } else {
      const p = String(body.priority).toLowerCase();
      if (!PRIORITIES.has(p)) return fail('priority must be high, med or low');
      set('priority', p);
    }
  }
  if ('done' in body) set('done', toFlag(body.done));
  if ('deleted' in body) set('deleted', toFlag(body.deleted));

  if (!sets.length) return fail('No updatable fields supplied');

  binds.push(id);
  const row = await env.DB.prepare(
    `UPDATE items SET ${sets.join(', ')} WHERE id = ? RETURNING *`,
  ).bind(...binds).first();

  return row ? json(row) : fail('Item not found', 404);
}

async function deleteItem(env, id) {
  const row = await env.DB.prepare('UPDATE items SET deleted = 1 WHERE id = ? RETURNING id').bind(id).first();
  return row ? json({ ok: true, id: row.id }) : fail('Item not found', 404);
}

/* ── router ─────────────────────────────────────────────────────────────── */

async function handleApi(request, env, path) {
  const method = request.method;

  if (path === '/api/config' && method === 'GET') {
    return json({ today: istDate(), timeZone: IST });
  }

  if (path === '/api/items') {
    if (method === 'GET') return listItems(request, env);
    if (method === 'POST') return createItem(request, env);
    return fail('Method not allowed', 405);
  }

  const itemMatch = /^\/api\/items\/(\d+)$/.exec(path);
  if (itemMatch) {
    const id = Number(itemMatch[1]);
    if (method === 'PUT' || method === 'PATCH') return updateItem(request, env, id);
    if (method === 'DELETE') return deleteItem(env, id);
    return fail('Method not allowed', 405);
  }

  return fail('Not found', 404);
}

/* ── entrypoint ─────────────────────────────────────────────────────────── */

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const path = new URL(request.url).pathname;

    if (path.startsWith('/api/')) {
      try {
        return await handleApi(request, env, path);
      } catch (err) {
        console.error('[api]', path, err);
        return fail(String(err?.message ?? err), 500);
      }
    }

    // Everything else is a static file from ./public (see [assets] in wrangler.toml).
    return env.ASSETS.fetch(request);
  },
};
