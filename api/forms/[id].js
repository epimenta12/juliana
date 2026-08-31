const { sql, ensureSchema } = require('../_db');
const { isAuthed } = require('../_auth');

module.exports = async (req, res) => {
  try {
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

    if (req.method === 'DELETE') {
      await sql`DELETE FROM forms WHERE id = ${id}`;
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    res.status(500).json({ error: (err && err.message) || 'erro interno' });
  }
};
