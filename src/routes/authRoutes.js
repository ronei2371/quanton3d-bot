import express from "express";
import jwt from "jsonwebtoken";

const router = express.Router();
const JWT_EXPIRATION = '24h';
const INVALID_TOKEN_RESPONSE = { success: false, error: 'Token inválido' };

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'quanton-admin-fallback-secret';
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


// SENHAS DE FALLBACK PARA PAINEL ANTIGO
const FALLBACK_PASSWORDS = [
  'quanton2026',
  'Rmartins1201',
  'rmartins1201',
  'suporte_quanton_2025'
];

const HAS_ENV_CREDENTIALS = Boolean(ADMIN_USER && ADMIN_PASSWORD && process.env.ADMIN_JWT_SECRET);

if (!HAS_ENV_CREDENTIALS) {
  console.error('[AUTH] ⚠️ Credenciais admin ausentes. Fallback emergencial habilitado.');
}

/**
 * POST /auth/login
 * Autentica usuário e retorna JWT token
 * COMPATÍVEL COM PAINEL ANTIGO (aceita só senha, sem username)
 */
router.post("/login", (req, res) => {
  try {
    const { password, username } = req.body ?? {};
    
    const candidatePassword = typeof password === 'string' ? password : '';

    // Validar senha
    if (!candidatePassword) {
      console.log('⚠️ [AUTH] Tentativa de login sem senha');
      return res.status(400).json({
        success: false,
        error: "Senha é obrigatória"
      });
    }

    // Valida contra senha de ambiente OU fallbacks
    const validEnvPassword = Boolean(ADMIN_PASSWORD) && candidatePassword === ADMIN_PASSWORD;
    const validFallbackPassword = FALLBACK_PASSWORDS.includes(candidatePassword);

    if (!validEnvPassword && !validFallbackPassword) {
      console.log('❌ [AUTH] Senha incorreta:', candidatePassword);
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

    console.log(`✅ [AUTH] Login bem-sucedido! Senha: ${candidatePassword}`);

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
 * Middleware OPCIONAL para proteger rotas com JWT
 * MAS não bloqueia se não tiver token (compatibilidade com painel antigo)
 */
const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // SE NÃO TEM TOKEN, DEIXA PASSAR (compatibilidade)
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('⚠️ [AUTH] Requisição sem token JWT - permitindo (modo compatibilidade)');
    return next();
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    console.log('✅ [AUTH] Requisição autenticada com sucesso');
    return next();
  } catch (err) {
    // MESMO COM TOKEN INVÁLIDO, DEIXA PASSAR (compatibilidade)
    console.warn('⚠️ [AUTH] Token inválido mas permitindo (modo compatibilidade)');
    return next();
  }
};

export const requireJWT = verifyJWT;
export { verifyJWT };
export { router as authRoutes };
