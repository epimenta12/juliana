const { sql, ensureSchema } = require('../_db');
const { isAuthed } = require('../_auth');

const ALLOWED_STATUS = ['ativo', 'renovacao', 'pausado', 'encerrado'];

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
    const product = typeof body.product === 'string' ? body.product.trim().slice(0, 200) : null;
    const nextProduct = typeof body.next_product === 'string' ? body.next_product.trim().slice(0, 200) : null;
    const observations = typeof body.observations === 'string' ? body.observations.trim().slice(0, 4000) : null;
    const purchaseDate = toDateOrNull(body.purchase_date);
    const endDate = toDateOrNull(body.end_date);

    await sql`
      UPDATE clientes SET
        status = COALESCE(${status}, status),
        name = COALESCE(${name}, name),
        phone = COALESCE(${phone}, phone),
        product = COALESCE(${product}, product),
        next_product = COALESCE(${nextProduct}, next_product),
        observations = COALESCE(${observations}, observations),
        purchase_date = COALESCE(${purchaseDate}, purchase_date),
        end_date = COALESCE(${endDate}, end_date),
        updated_at = now()
      WHERE id = ${id}
    `;
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'DELETE') {
    await sql`DELETE FROM clientes WHERE id = ${id}`;
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
};
