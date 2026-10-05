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

// Só aceita endereços http(s); qualquer outra coisa (javascript:, data:...) vira vazio.
function cleanUrl(value) {
  const s = String(value || '').trim().slice(0, 500);
  if (!s) return '';
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : 'https://' + s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch {
    return '';
  }
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
    if (type === 'terms') {
      const termId = Number(f.termId);
      if (Number.isInteger(termId) && termId > 0) {
        out.termId = termId; // conteúdo vem do termo salvo na aba Termos
      } else {
        out.text = String(f.text || '').trim().slice(0, 20000);
        out.url = cleanUrl(f.url);
      }
    }
    if (type === 'nps') {
      if (f.lowLabel) out.lowLabel = String(f.lowLabel).slice(0, 60);
      if (f.highLabel) out.highLabel = String(f.highLabel).slice(0, 60);
    }
    return out;
  });
}

// Página final (depois do envio): título, mensagem e botão opcional (rótulo + link http/https).
function cleanFinalPage(raw) {
  const f = raw && typeof raw === 'object' ? raw : {};
  const out = {
    title: String(f.title || '').trim().slice(0, 200),
    message: String(f.message || '').trim().slice(0, 5000),
    buttonLabel: String(f.buttonLabel || '').trim().slice(0, 60),
    buttonUrl: cleanUrl(f.buttonUrl),
  };
  if (!out.buttonLabel || !out.buttonUrl) { out.buttonLabel = ''; out.buttonUrl = ''; }
  return out;
}

function fieldsError(fields) {
  for (const f of fields) {
    if (!f.label) return 'preencha o texto de todas as perguntas';
    if (f.type === 'select' && !f.options.length) return `adicione ao menos uma opção em "${f.label}"`;
    if (f.type === 'grid' && (!f.rows.length || !f.columns.length)) return `a grade "${f.label}" precisa de linhas e colunas`;
    if (f.type === 'terms' && !f.termId && !f.text && !f.url) return `escolha um termo (ou informe link/texto) em "${f.label}"`;
  }
  return null;
}

// Termos (aba "Termos" do CRM), na mesma function para não passar do limite da Vercel:
//   GET    /api/forms?terms=1           -> lista, com os formulários que usam cada termo
//   POST   /api/forms?terms=1           -> cria
//   PATCH  /api/forms?terms=1&id=3      -> edita (a versão sobe se o conteúdo mudar)
//   DELETE /api/forms?terms=1&id=3      -> exclui (bloqueado se algum formulário usa)
async function handleTerms(req, res, id) {
  if (req.method === 'GET') {
    const { rows } = await sql`SELECT id, product, title, url, text, version, updated_at FROM terms ORDER BY product, title`;
    const { rows: forms } = await sql`SELECT title, fields FROM forms`;
    rows.forEach((t) => {
      t.used_by = forms
        .filter((f) => (Array.isArray(f.fields) ? f.fields : []).some((x) => x && x.type === 'terms' && Number(x.termId) === t.id))
        .map((f) => f.title);
    });
    res.status(200).json(rows);
    return;
  }

  if (req.method === 'POST' || req.method === 'PATCH') {
    const body = parseBody(req);
    const product = String(body.product || '').trim().slice(0, 80);
    const title = String(body.title || '').trim().slice(0, 200);
    const url = cleanUrl(body.url);
    const text = String(body.text || '').trim().slice(0, 20000);
    if (!product) { res.status(400).json({ error: 'escolha o produto' }); return; }
    if (!title) { res.status(400).json({ error: 'título é obrigatório' }); return; }
    if (!url && !text) { res.status(400).json({ error: 'informe o link ou o texto dos termos' }); return; }
    if (body.url && String(body.url).trim() && !url) { res.status(400).json({ error: 'link inválido (use um endereço http ou https)' }); return; }

    if (req.method === 'POST') {
      const { rows } = await sql`
        INSERT INTO terms (product, title, url, text) VALUES (${product}, ${title}, ${url}, ${text})
        RETURNING id, product, title, url, text, version, updated_at
      `;
      res.status(201).json(Object.assign({ used_by: [] }, rows[0]));
      return;
    }

    if (!id) { res.status(400).json({ error: 'id inválido' }); return; }
    const { rows: current } = await sql`SELECT url, text, version FROM terms WHERE id = ${id}`;
    if (!current.length) { res.status(404).json({ error: 'termo não encontrado' }); return; }
    const changed = current[0].url !== url || current[0].text !== text;
    const version = current[0].version + (changed ? 1 : 0);
    const { rows } = await sql`
      UPDATE terms SET product = ${product}, title = ${title}, url = ${url}, text = ${text},
        version = ${version}, updated_at = now()
      WHERE id = ${id}
      RETURNING id, product, title, url, text, version, updated_at
    `;
    res.status(200).json(rows[0]);
    return;
  }

  if (req.method === 'DELETE') {
    if (!id) { res.status(400).json({ error: 'id inválido' }); return; }
    const { rows: forms } = await sql`SELECT title, fields FROM forms`;
    const using = forms
      .filter((f) => (Array.isArray(f.fields) ? f.fields : []).some((x) => x && x.type === 'terms' && Number(x.termId) === id))
      .map((f) => f.title);
    if (using.length) {
      res.status(409).json({ error: `este termo está em uso no(s) formulário(s): ${using.join(', ')}. Troque o termo nele antes de excluir.` });
      return;
    }
    await sql`DELETE FROM terms WHERE id = ${id}`;
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
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

    if (req.query.terms) { await handleTerms(req, res, id); return; }

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
        SELECT f.id, f.slug, f.title, f.description, f.fields, f.final_page, f.layout, f.created_at,
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
        INSERT INTO forms (slug, title, description, fields, final_page, layout)
        VALUES (${slug}, ${title}, ${description}, ${JSON.stringify(fields)}::jsonb, ${JSON.stringify(cleanFinalPage(body.finalPage))}::jsonb, ${body.layout === 'page' ? 'page' : 'step'})
        RETURNING id, slug, title, description, fields, final_page, layout, created_at
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
        UPDATE forms SET title = ${title}, description = ${description}, fields = ${JSON.stringify(fields)}::jsonb,
          final_page = COALESCE(${body.finalPage === undefined ? null : JSON.stringify(cleanFinalPage(body.finalPage))}::jsonb, final_page),
          layout = COALESCE(${body.layout === undefined ? null : (body.layout === 'page' ? 'page' : 'step')}::text, layout)
        WHERE id = ${id}
        RETURNING id, slug, title, description, fields, final_page, layout, created_at
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
