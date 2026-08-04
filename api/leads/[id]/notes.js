const { sql, ensureSchema } = require('../../_db');
const { isAuthed } = require('../../_auth');

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
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
  const text = String(body.text || '').trim().slice(0, 2000);
  if (!text) {
    res.status(400).json({ error: 'nota vazia' });
    return;
  }

  const note = JSON.stringify([{ text, at: new Date().toISOString() }]);
  await sql`
    UPDATE leads
    SET notes = notes || ${note}::jsonb, updated_at = now()
    WHERE id = ${id}
  `;
  res.status(200).json({ ok: true });
};
