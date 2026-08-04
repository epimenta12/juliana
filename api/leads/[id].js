const { sql, ensureSchema } = require('../_db');
const { isAuthed } = require('../_auth');

const ALLOWED_STATUS = ['novo_lead', 'aguardando_retorno', 'em_negociacao', 'relacionamento', 'pausado', 'fechado', 'sem_retorno'];

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
    const source = typeof body.source === 'string' ? body.source.trim().slice(0, 200) : null;
    const instagram = typeof body.instagram === 'string' ? body.instagram.trim().slice(0, 200) : null;
    const priority = typeof body.priority === 'string' ? body.priority.trim().slice(0, 20) : null;
    const statusNote = typeof body.status_note === 'string' ? body.status_note.trim().slice(0, 2000) : null;
    const observations = typeof body.observations === 'string' ? body.observations.trim().slice(0, 4000) : null;
    const firstContactDate = toDateOrNull(body.first_contact_date);
    const lastContactDate = toDateOrNull(body.last_contact_date);
    const nextContactDate = toDateOrNull(body.next_contact_date);

    await sql`
      UPDATE leads SET
        status = COALESCE(${status}, status),
        name = COALESCE(${name}, name),
        phone = COALESCE(${phone}, phone),
        email = COALESCE(${email}, email),
        program = COALESCE(${program}, program),
        source = COALESCE(${source}, source),
        instagram = COALESCE(${instagram}, instagram),
        priority = COALESCE(${priority}, priority),
        status_note = COALESCE(${statusNote}, status_note),
        observations = COALESCE(${observations}, observations),
        first_contact_date = COALESCE(${firstContactDate}, first_contact_date),
        last_contact_date = COALESCE(${lastContactDate}, last_contact_date),
        next_contact_date = COALESCE(${nextContactDate}, next_contact_date),
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
