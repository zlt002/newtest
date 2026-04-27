function normalizeRequiredText(value, fieldName) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new TypeError(`${fieldName} is required`);
  }
  return normalized;
}

function normalizeLimit(limit) {
  if (!Number.isFinite(limit)) {
    return null;
  }
  const normalized = Math.trunc(limit);
  return normalized > 0 ? normalized : 0;
}

function parseEntry(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    sessionId: row.session_id,
    type: row.type,
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at,
  };
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sdk_debug_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

export function createSdkDebugLog({ db }) {
  if (!db) {
    throw new TypeError('db is required');
  }

  ensureSchema(db);

  const insertEntry = db.prepare(`
    INSERT INTO sdk_debug_log (session_id, type, payload_json, created_at)
    VALUES (?, ?, ?, ?)
  `);
  const selectLatestEntry = db.prepare(`
    SELECT id, session_id, type, payload_json, created_at
    FROM sdk_debug_log
    WHERE id = ?
  `);
  const selectEntriesBySession = db.prepare(`
    SELECT id, session_id, type, payload_json, created_at
    FROM sdk_debug_log
    WHERE session_id = ?
    ORDER BY id ASC
  `);
  const selectLatestEntriesBySession = db.prepare(`
    SELECT id, session_id, type, payload_json, created_at
    FROM sdk_debug_log
    WHERE session_id = ?
    ORDER BY id DESC
    LIMIT ?
  `);
  const selectAnyEntryBySession = db.prepare(`
    SELECT 1
    FROM sdk_debug_log
    WHERE session_id = ?
    LIMIT 1
  `);
  const deleteEntriesBySession = db.prepare(`
    DELETE FROM sdk_debug_log
    WHERE session_id = ?
  `);
  const trimEntriesBySession = db.prepare(`
    DELETE FROM sdk_debug_log
    WHERE session_id = ?
      AND id NOT IN (
        SELECT id
        FROM sdk_debug_log
        WHERE session_id = ?
        ORDER BY id DESC
        LIMIT ?
      )
  `);

  return {
    append({ sessionId, type, payload }) {
      const record = {
        sessionId: normalizeRequiredText(sessionId, 'sessionId'),
        type: normalizeRequiredText(type, 'type'),
        payload,
        createdAt: new Date().toISOString(),
      };
      const result = insertEntry.run(
        record.sessionId,
        record.type,
        JSON.stringify(record.payload ?? null),
        record.createdAt,
      );

      return parseEntry(selectLatestEntry.get(result.lastInsertRowid));
    },

    listBySession(sessionId, { limit } = {}) {
      const normalizedSessionId = normalizeRequiredText(sessionId, 'sessionId');
      const normalizedLimit = normalizeLimit(limit);
      const rows = normalizedLimit === null
        ? selectEntriesBySession.all(normalizedSessionId)
        : selectLatestEntriesBySession.all(normalizedSessionId, normalizedLimit).reverse();
      return rows.map(parseEntry);
    },

    hasSessionLogs(sessionId) {
      const normalizedSessionId = normalizeRequiredText(sessionId, 'sessionId');
      return Boolean(selectAnyEntryBySession.get(normalizedSessionId));
    },

    trim({ sessionId, keepLatest }) {
      const normalizedSessionId = normalizeRequiredText(sessionId, 'sessionId');
      const normalizedKeepLatest = normalizeLimit(keepLatest);
      const result = normalizedKeepLatest === 0
        ? deleteEntriesBySession.run(normalizedSessionId)
        : trimEntriesBySession.run(normalizedSessionId, normalizedSessionId, normalizedKeepLatest);
      return result.changes;
    },
  };
}
