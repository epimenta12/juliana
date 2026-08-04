const { setSessionCookie } = require('../_auth');

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const validUser = process.env.CRM_USERNAME;
  const validPass = process.env.CRM_PASSWORD;
  if (!validUser || !validPass || !process.env.CRM_SESSION_SECRET) {
    res.status(500).json({ error: 'CRM não configurado no servidor' });
    return;
  }

  const { username, password } = parseBody(req);
  if (username !== validUser || password !== validPass) {
    res.status(401).json({ error: 'Usuário ou senha incorretos' });
    return;
  }

  setSessionCookie(res);
  res.status(200).json({ ok: true });
};
