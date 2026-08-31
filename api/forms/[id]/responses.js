const { sql, ensureSchema } = require('../../_db');
const { isAuthed } = require('../../_auth');

module.exports = async (req, res) => {
  try {
    if (!isAuthed(req)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'method not allowed' });
      return;
    }
    await ensureSchema();

    const id = Number(req.query.id);
    if (!id || !Number.isInteger(id)) {
      res.status(400).json({ error: 'id inválido' });
      return;
    }

    const { rows } = await sql`
      SELECT id, answers, submitted_at
      FROM form_responses
      WHERE form_id = ${id}
      ORDER BY submitted_at DESC
    `;
    res.status(200).json(rows);
  } catch (err) {
    res.status(500).json({ error: (err && err.message) || 'erro interno' });
  }
};
