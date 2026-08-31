const { sql, ensureSchema } = require('../../_db');

// Rota pública — sem isAuthed: qualquer pessoa com o link deve conseguir
// abrir o formulário para responder.
module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'method not allowed' });
      return;
    }
    await ensureSchema();

    const slug = String(req.query.slug || '').trim().slice(0, 60);
    if (!slug) {
      res.status(400).json({ error: 'slug inválido' });
      return;
    }

    const { rows } = await sql`
      SELECT id, slug, title, description, fields
      FROM forms WHERE slug = ${slug}
    `;
    if (!rows.length) {
      res.status(404).json({ error: 'formulário não encontrado' });
      return;
    }
    res.status(200).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err && err.message) || 'erro interno' });
  }
};
