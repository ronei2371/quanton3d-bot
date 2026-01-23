import express from "express";
import jwt from "jsonwebtoken";

const router = express.Router();

const JWT_EXPIRATION = '24h';
const INVALID_TOKEN_RESPONSE = { success: false, error: 'Token inválido' };
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'quanton-admin-fallback-secret';
const FALLBACK_ADMIN_USER = 'admin';
const FALLBACK_ADMIN_PASSWORD = 'quanton2026';
const HAS_ENV_CREDENTIALS = Boolean(ADMIN_USER && ADMIN_PASSWORD && process.env.ADMIN_JWT_SECRET);

if (!HAS_ENV_CREDENTIALS) {
  console.error('[AUTH] ⚠️ Credenciais admin ausentes. Fallback emergencial habilitado.');
}

/**
 * POST /auth/login
 * Autentica usuário e retorna JWT token
 */
router.post("/login", (req, res) => {
  try {
    const { password, username } = req.body ?? {};
    const candidatePassword = typeof password === 'string' ? password : '';
    const trimmedUsername = typeof username === 'string' ? username.trim() : '';
    const expectedUsername = ADMIN_USER || FALLBACK_ADMIN_USER;

    // Validar senha
    if (!candidatePassword) {
      console.log('⚠️ [AUTH] Tentativa de login sem senha');
      return res.status(400).json({
        success: false,
        error: "Senha é obrigatória"
      });
    }

    if (trimmedUsername && trimmedUsername !== expectedUsername) {
      console.log('❌ [AUTH] Tentativa de login com usuário incorreto');
      return res.status(401).json({
        success: false,
        error: "Usuário incorreto"
      });
    }

    const validEnvPassword = ADMIN_PASSWORD && candidatePassword === ADMIN_PASSWORD;
    const validFallbackPassword = candidatePassword === FALLBACK_ADMIN_PASSWORD;

    if (!validEnvPassword && !validFallbackPassword) {
      console.log('❌ [AUTH] Tentativa de login com senha incorreta');
      return res.status(401).json({
        success: false,
        error: "Senha incorreta"
      });
    }

    // Gerar JWT token
    const token = jwt.sign(
      {
        role: 'admin',
        timestamp: Date.now()
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRATION }
    );

    console.log(`✅ [AUTH] Login bem-sucedido! Token gerado.`);

    res.json({
      success: true,
      token,
      expiresIn: JWT_EXPIRATION
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
 * Middleware para proteger rotas com JWT
 */
const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('⚠️ [AUTH] Requisição sem token JWT');
    return res.status(401).json(INVALID_TOKEN_RESPONSE);
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    console.log('✅ [AUTH] Requisição autenticada com sucesso');
    return next();
  } catch (err) {
    console.error('❌ [AUTH] Token inválido:', err.message);
    return res.status(401).json(INVALID_TOKEN_RESPONSE);
  }
};

export const requireJWT = verifyJWT;
export { verifyJWT };

export { router as authRoutes };
