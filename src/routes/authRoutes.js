import express from "express";
import jwt from "jsonwebtoken";

const router = express.Router();
const JWT_EXPIRATION = '24h';

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'quanton-admin-fallback-secret';
const ADMIN_SECRET_OVERRIDE = process.env.ADMIN_SECRET_OVERRIDE;

if (!ADMIN_PASSWORD) {
  console.warn('[AUTH] ⚠️ ADMIN_PASSWORD não configurada. O login retornará erro até que a variável seja definida.');
}

if (!ADMIN_SECRET_OVERRIDE) {
  console.warn('[AUTH] ⚠️ ADMIN_SECRET_OVERRIDE não configurada. O fluxo de compatibilidade ficará desativado.');
}

/**
 * POST /auth/login
 * Autentica usuário e retorna JWT token
 * COMPATÍVEL COM PAINEL ANTIGO (aceita só senha, sem username)
 */
router.post("/login", (req, res) => {
  try {
    const { password, username, secret: legacyBodySecret } = req.body ?? {};
    const jwtSecret = process.env.ADMIN_JWT_SECRET;

    if (!jwtSecret) {
      return res.status(500).json({
        success: false,
        error: "JWT secret não configurado no servidor"
      });
    }

    if (!ADMIN_PASSWORD) {
      return res.status(503).json({
        success: false,
        error: "ADMIN_PASSWORD ausente"
      });
    }

    const requestSecret = req.headers['x-admin-secret'] || legacyBodySecret;

    const hasPrimaryCreds = Boolean(
      username && password &&
      username === ADMIN_USER &&
      password === ADMIN_PASSWORD
    );

    const hasLegacyFallback = Boolean(
      ADMIN_SECRET_OVERRIDE &&
      requestSecret &&
      requestSecret === ADMIN_SECRET_OVERRIDE &&
      password === ADMIN_PASSWORD
    );

    if (!hasPrimaryCreds && !hasLegacyFallback) {
      console.log('❌ [AUTH] Login falhou - credenciais inválidas');
      return res.status(401).json({
        success: false,
        error: "Credenciais inválidas"
      });
    }

    const authMethod = hasPrimaryCreds ? 'user+password' : 'secret+password';

    const token = jwt.sign(
      {
        user: ADMIN_USER,
        role: 'admin',
        method: authMethod,
        timestamp: Date.now()
      },
      jwtSecret,
      { expiresIn: "24h" }
    );

    console.log(`✅ [AUTH] Login bem-sucedido (${authMethod})`);

    res.json({
      success: true,
      token,
      expiresIn: "24h"
    });

  } catch (err) {
    console.error('❌ [AUTH] Erro no login:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});
/**
 * POST /auth/verify
 * Verifica se um JWT token é válido
 */
router.post("/verify", (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.json({
        success: true,
        valid: false,
        reason: 'no_token'
      });
    }

    jwt.verify(token, JWT_SECRET);
    
    console.log('✅ [AUTH] Token válido verificado');
    
    res.json({
      success: true,
      valid: true
    });

  } catch (err) {
    console.log('⚠️ [AUTH] Token inválido ou expirado');
    res.json({
      success: true,
      valid: false,
      reason: 'invalid_token'
    });
  }
});

/**
 * Middleware para rotas administrativas protegidas por JWT.
 * Sem token válido → 401.
 */
const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    console.warn('⚠️ [AUTH] Requisição sem token JWT - bloqueando');
    return res.status(401).json({ success: false, error: 'token_required' });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (err) {
    console.warn('⚠️ [AUTH] Token inválido ou expirado');
    return res.status(401).json({ success: false, error: 'invalid_token' });
  }
};

export const requireJWT = verifyJWT;
export { verifyJWT };
export { router as authRoutes };
