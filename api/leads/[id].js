const { sql, ensureSchema } = require('../_db');
const { isAuthed } = require('../_auth');

const ALLOWED_STATUS = ['novo', 'em_conversa', 'proposta_enviada', 'fechado', 'perdido'];

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
  await ensureSchema();

  const id = Number(req.query.id);
  if (!id || !Number.isInteger(id)) {
    res.status(400).json({ error: 'id inválido' });
    return;
  }

  if (req.method === 'PATCH') {
    const body = parseBody(req);
    const status = ALLOWED_STATUS.includes(body.status) ? body.status : null;
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : null;
    const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 60) : null;
    const email = typeof body.email === 'string' ? body.email.trim().slice(0, 200) : null;
    const program = typeof body.program === 'string' ? body.program.trim().slice(0, 200) : null;

    await sql`
      UPDATE leads SET
        status = COALESCE(${status}, status),
        name = COALESCE(${name}, name),
        phone = COALESCE(${phone}, phone),
        email = COALESCE(${email}, email),
        program = COALESCE(${program}, program),
        updated_at = now()
      WHERE id = ${id}
    `;
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    await sql`DELETE FROM leads WHERE id = ${id}`;
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
};
