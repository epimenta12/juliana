const { sql, ensureSchema } = require('../_db');
const { isAuthed } = require('../_auth');

// Uma única function cuida de toda a gestão de formulários (a Vercel Hobby
// limita o número de serverless functions por deploy, então evitamos criar
// um arquivo por rota):
//   GET    /api/forms                    -> lista formulários
//   POST   /api/forms                    -> cria formulário
//   PATCH  /api/forms?id=5               -> edita título/descrição/perguntas (o link não muda)
//   DELETE /api/forms?id=5               -> exclui formulário
//   DELETE /api/forms?id=5&responseId=9  -> exclui só uma resposta
//   GET    /api/forms?id=5&responses=1   -> lista respostas do formulário
//   GET    /api/forms?file=12            -> baixa um arquivo enviado numa resposta

const FIELD_TYPES = ['nps', 'text', 'tel', 'email', 'textarea', 'select', 'grid', 'file', 'terms'];

function cleanList(list, max) {
  const seen = new Set();
  const out = [];
  (Array.isArray(list) ? list : []).forEach((item) => {
    const s = String(item == null ? '' : item).trim().slice(0, 200);
    if (s && !seen.has(s) && out.length < max) { seen.add(s); out.push(s); }
  });
  return out;
}

// Mantém só as propriedades conhecidas de cada pergunta e limita tamanhos.
function cleanFields(fields) {
  return fields.map((f) => {
    const type = FIELD_TYPES.includes(f && f.type) ? f.type : 'text';
    const out = {
      key: String((f && f.key) || '').slice(0, 80),
      label: String((f && f.label) || '').trim().slice(0, 300),
      type,
      required: !!(f && f.required),
    };
    if (type === 'select') out.options = cleanList(f.options, 30);
    if (type === 'grid') { out.rows = cleanList(f.rows, 30); out.columns = cleanList(f.columns, 10); }
    if (type === 'terms') out.text = String(f.text || '').trim().slice(0, 20000);
    if (type === 'nps') {
      if (f.lowLabel) out.lowLabel = String(f.lowLabel).slice(0, 60);
      if (f.highLabel) out.highLabel = String(f.highLabel).slice(0, 60);
    }
    return out;
  });
}

function fieldsError(fields) {
  for (const f of fields) {
    if (!f.label) return 'preencha o texto de todas as perguntas';
    if (f.type === 'select' && !f.options.length) return `adicione ao menos uma opção em "${f.label}"`;
    if (f.type === 'grid' && (!f.rows.length || !f.columns.length)) return `a grade "${f.label}" precisa de linhas e colunas`;
    if (f.type === 'terms' && !f.text) return `escreva o texto dos termos em "${f.label}"`;
  }
  return null;
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

function slugify(text) {
  const noAccents = String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  return noAccents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'formulario';
}

module.exports = async (req, res) => {
  try {
    if (!isAuthed(req)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    await ensureSchema();

    const id = req.query.id ? Number(req.query.id) : null;

    if (req.method === 'GET' && req.query.file) {
      const fileId = Number(req.query.file);
      if (!fileId) { res.status(400).json({ error: 'arquivo inválido' }); return; }
      const { rows } = await sql`SELECT name, mime, data_b64 FROM form_files WHERE id = ${fileId}`;
      if (!rows.length) { res.status(404).json({ error: 'arquivo não encontrado' }); return; }
      const file = rows[0];
      res.setHeader('Content-Type', file.mime);
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      res.status(200).send(Buffer.from(file.data_b64, 'base64'));
      return;
    }

    if (req.method === 'GET' && id && req.query.responses) {
      const { rows } = await sql`
        SELECT id, answers, submitted_at FROM form_responses
        WHERE form_id = ${id} ORDER BY submitted_at DESC
      `;
      res.status(200).json(rows);
      return;
    }

    if (req.method === 'GET') {
      const { rows } = await sql`
        SELECT f.id, f.slug, f.title, f.description, f.fields, f.created_at,
               COUNT(r.id)::int AS response_count
        FROM forms f
        LEFT JOIN form_responses r ON r.form_id = f.id
        GROUP BY f.id
        ORDER BY f.created_at DESC
      `;
      res.status(200).json(rows);
      return;
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
      const title = String(body.title || '').trim().slice(0, 200);
      const description = String(body.description || '').trim().slice(0, 2000);
      const fields = cleanFields(Array.isArray(body.fields) ? body.fields : []);
      if (!title) { res.status(400).json({ error: 'título é obrigatório' }); return; }
      if (!fields.length) { res.status(400).json({ error: 'adicione ao menos um campo' }); return; }
      const fieldsErr = fieldsError(fields);
      if (fieldsErr) { res.status(400).json({ error: fieldsErr }); return; }

      const base = slugify(title);
      let slug = base;
      for (let i = 0; i < 20; i++) {
        const { rows } = await sql`SELECT 1 FROM forms WHERE slug = ${slug}`;
        if (!rows.length) break;
        slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
      }

      const { rows } = await sql`
        INSERT INTO forms (slug, title, description, fields)
        VALUES (${slug}, ${title}, ${description}, ${JSON.stringify(fields)}::jsonb)
        RETURNING id, slug, title, description, fields, created_at
      `;
      res.status(201).json(Object.assign({ response_count: 0 }, rows[0]));
      return;
    }

    if (req.method === 'PATCH') {
      if (!id) { res.status(400).json({ error: 'id inválido' }); return; }
      const body = parseBody(req);
      const title = String(body.title || '').trim().slice(0, 200);
      const description = String(body.description || '').trim().slice(0, 2000);
      const fields = cleanFields(Array.isArray(body.fields) ? body.fields : []);
      if (!title) { res.status(400).json({ error: 'título é obrigatório' }); return; }
      if (!fields.length) { res.status(400).json({ error: 'adicione ao menos um campo' }); return; }
      const fieldsErr = fieldsError(fields);
      if (fieldsErr) { res.status(400).json({ error: fieldsErr }); return; }

      // slug nunca muda aqui — o link que já foi compartilhado continua valendo
      const { rows } = await sql`
        UPDATE forms SET title = ${title}, description = ${description}, fields = ${JSON.stringify(fields)}::jsonb
        WHERE id = ${id}
        RETURNING id, slug, title, description, fields, created_at
      `;
      if (!rows.length) { res.status(404).json({ error: 'formulário não encontrado' }); return; }
      const { rows: countRows } = await sql`SELECT COUNT(*)::int AS c FROM form_responses WHERE form_id = ${id}`;
      res.status(200).json(Object.assign({ response_count: countRows[0].c }, rows[0]));
      return;
    }

    if (req.method === 'DELETE') {
      if (!id) { res.status(400).json({ error: 'id inválido' }); return; }
      const responseId = req.query.responseId ? Number(req.query.responseId) : null;
      if (responseId) {
        await sql`DELETE FROM form_responses WHERE id = ${responseId} AND form_id = ${id}`;
      } else {
        await sql`DELETE FROM forms WHERE id = ${id}`;
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    res.status(500).json({ error: (err && err.message) || 'erro interno' });
  }
};
