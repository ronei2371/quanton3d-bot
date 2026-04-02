// src/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

const SECRET = process.env.ADMIN_JWT_SECRET;

module.exports = function authMiddleware(req, res, next) {
  if (!SECRET) {
    console.error('[authMiddleware] ADMIN_JWT_SECRET não definido!');
    return res.status(500).json({ error: 'Configuração do servidor incompleta' });
  }

  // Aceita: Authorization: Bearer <token>  OU x-admin-token header para compatibilidade
  const authHeader = String(req.headers.authorization || '').trim();
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  const token = bearer || req.headers['x-admin-token'] || req.cookies?.admin_token || req.body?.token;

  if (!token) return res.status(401).json({ error: 'Token não fornecido' });

  try {
    const payload = jwt.verify(token, SECRET);
    // opcional: anexar dados do admin ao req
    req.admin = payload;
    return next();
  } catch (err) {
    console.warn('[authMiddleware] token inválido:', err.message);
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
};
