const { sql, ensureSchema, resolveTermFields } = require('../../_db');

// Limites de upload. A Vercel aceita no máximo ~4,5 MB por requisição e o
// arquivo viaja em base64 (+33%), então o total de arquivos fica em 3 MB.
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_FILE_BYTES = 3 * 1024 * 1024;
const MAX_TERMS_SNAPSHOT = 20000;

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

// Confere o conteúdo real do arquivo (não confia no tipo informado pelo navegador).
function detectMime(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.length >= 5 && buf.slice(0, 5).toString() === '%PDF-') return 'application/pdf';
  return null;
}

function cleanFileName(name) {
  return String(name || 'arquivo')
    .replace(/[\\/]+/g, '_')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, 120) || 'arquivo';
}

// Devolve { value } com a resposta já saneada, { file } para upload pendente,
// ou { error } com a mensagem para quem está respondendo.
function sanitizeAnswer(field, raw) {
  const label = field.label || field.key;

  if (field.type === 'nps') {
    const n = Number(raw);
    if (raw === undefined || raw === null || raw === '' || !Number.isInteger(n) || n < 0 || n > 10) return { value: null };
    return { value: n };
  }

  if (field.type === 'grid') {
    const rows = Array.isArray(field.rows) ? field.rows : [];
    const cols = Array.isArray(field.columns) ? field.columns : [];
    const out = {};
    if (raw && typeof raw === 'object') {
      for (const r of rows) {
        if (cols.includes(raw[r])) out[r] = raw[r];
      }
    }
    const complete = rows.length > 0 && rows.every((r) => out[r]);
    if (field.required && !complete) return { error: `responda todas as linhas: ${label}` };
    return { value: Object.keys(out).length ? out : null };
  }

  if (field.type === 'terms') {
    const accepted = raw === true || (raw && raw.accepted === true);
    if (!accepted) {
      if (field.required) return { error: `é preciso aceitar os termos: ${label}` };
      return { value: null };
    }
    // O texto aceito é copiado da definição do formulário (nunca do cliente),
    // para guardar exatamente a versão que a pessoa leu.
    return {
      value: {
        accepted: true,
        at: new Date().toISOString(),
        text: String(field.text || '').slice(0, MAX_TERMS_SNAPSHOT),
        url: String(field.url || '').slice(0, 500),
        // quando vem de um termo salvo: qual era e em que versão
        termId: field.termId ? Number(field.termId) : null,
        title: String(field.termTitle || '').slice(0, 200),
        version: field.termVersion || null,
      },
    };
  }

  if (field.type === 'file') {
    if (!raw || typeof raw !== 'object' || !raw.data) {
      if (field.required) return { error: `envie um arquivo: ${label}` };
      return { value: null };
    }
    const b64 = String(raw.data).replace(/^data:[^;]*;base64,/, '');
    if (b64.length > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 8) return { error: `arquivo maior que 3 MB: ${label}` };
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length) return { error: `arquivo vazio: ${label}` };
    if (buf.length > MAX_FILE_BYTES) return { error: `arquivo maior que 3 MB: ${label}` };
    const mime = detectMime(buf);
    if (!mime) return { error: `formato não aceito (use imagem JPG, PNG, WebP ou PDF): ${label}` };
    return { file: { name: cleanFileName(raw.name), mime, size: buf.length, b64: buf.toString('base64') } };
  }

  const s = String(raw == null ? '' : raw).trim().slice(0, 4000);
  return { value: s || null };
}

// Rota pública — sem isAuthed: qualquer pessoa com o link deve conseguir
// abrir o formulário e responder. GET busca a definição, POST envia a
// resposta — as duas ficam no mesmo arquivo para economizar functions
// (a Vercel Hobby limita 12 por deploy).
module.exports = async (req, res) => {
  try {
    await ensureSchema();
    const slug = String(req.query.slug || '').trim().slice(0, 60);
    if (!slug) { res.status(400).json({ error: 'slug inválido' }); return; }

    if (req.method === 'GET') {
      const { rows } = await sql`
        SELECT id, slug, title, description, fields, final_page, layout
        FROM forms WHERE slug = ${slug}
      `;
      if (!rows.length) { res.status(404).json({ error: 'formulário não encontrado' }); return; }
      const form = rows[0];
      form.fields = await resolveTermFields(form.fields);
      res.status(200).json(form);
      return;
    }

    if (req.method === 'POST') {
      const { rows } = await sql`SELECT id, fields FROM forms WHERE slug = ${slug}`;
      if (!rows.length) { res.status(404).json({ error: 'formulário não encontrado' }); return; }
      const form = rows[0];
      const fields = await resolveTermFields(Array.isArray(form.fields) ? form.fields : []);
      const body = parseBody(req);
      const rawAnswers = (body && typeof body.answers === 'object' && body.answers) || {};

      const answers = {};
      const pendingFiles = [];
      let totalBytes = 0;
      for (const field of fields) {
        const result = sanitizeAnswer(field, rawAnswers[field.key]);
        if (result.error) { res.status(400).json({ error: result.error }); return; }
        if (result.file) {
          totalBytes += result.file.size;
          if (totalBytes > MAX_TOTAL_FILE_BYTES) {
            res.status(400).json({ error: 'o total de arquivos passa de 3 MB' });
            return;
          }
          pendingFiles.push(Object.assign({ key: field.key }, result.file));
          continue;
        }
        const value = result.value;
        if (field.required && (value === null || value === '')) {
          res.status(400).json({ error: `campo obrigatório não preenchido: ${field.label || field.key}` });
          return;
        }
        if (value !== null) answers[field.key] = value;
      }

      const { rows: inserted } = await sql`
        INSERT INTO form_responses (form_id, answers)
        VALUES (${form.id}, ${JSON.stringify(answers)}::jsonb)
        RETURNING id
      `;
      const responseId = inserted[0].id;

      if (pendingFiles.length) {
        try {
          for (const f of pendingFiles) {
            const { rows: fileRows } = await sql`
              INSERT INTO form_files (form_id, response_id, field_key, name, mime, size, data_b64)
              VALUES (${form.id}, ${responseId}, ${f.key}, ${f.name}, ${f.mime}, ${f.size}, ${f.b64})
              RETURNING id
            `;
            answers[f.key] = { fileId: fileRows[0].id, name: f.name, mime: f.mime, size: f.size };
          }
          await sql`UPDATE form_responses SET answers = ${JSON.stringify(answers)}::jsonb WHERE id = ${responseId}`;
        } catch (err) {
          // não deixa uma resposta pela metade (sem o arquivo) no CRM
          await sql`DELETE FROM form_responses WHERE id = ${responseId}`;
          throw err;
        }
      }

      res.status(201).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    res.status(500).json({ error: (err && err.message) || 'erro interno' });
  }
};
