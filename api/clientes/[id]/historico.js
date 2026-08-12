const { sql, ensureSchema } = require('../../_db');
const { isAuthed } = require('../../_auth');

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

function toDateOrNull(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

module.exports = async (req, res) => {
  if (!isAuthed(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }
  await ensureSchema();

  const id = Number(req.query.id);
  if (!id || !Number.isInteger(id)) {
    res.status(400).json({ error: 'id inválido' });
    return;
  }

  const body = parseBody(req);
  const produto = String(body.produto || '').trim().slice(0, 200);
  const data = toDateOrNull(body.data);
  if (!produto) {
    res.status(400).json({ error: 'produto é obrigatório' });
    return;
  }

  const entry = JSON.stringify([{ produto, data, at: new Date().toISOString() }]);
  await sql`
    UPDATE clientes
    SET purchase_history = purchase_history || ${entry}::jsonb, updated_at = now()
    WHERE id = ${id}
  `;
  res.status(200).json({ ok: true });
};
