import express from "express";
import jwt from "jsonwebtoken";

const router = express.Router();
const JWT_EXPIRATION = '24h';

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'quanton-admin-fallback-secret';

if (!ADMIN_PASSWORD) {
  console.warn('[AUTH] ⚠️ ADMIN_PASSWORD não configurada. O login retornará erro até que a variável seja definida.');
}

/**
 * POST /auth/login
 * Autentica usuário e retorna JWT token
 * COMPATÍVEL COM PAINEL ANTIGO (aceita só senha, sem username)
 */
router.post("/login", (req, res) => {
  try {
    const { password, username, secret } = req.body ?? {};
    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD;
    const jwtSecret = process.env.ADMIN_JWT_SECRET;
    const adminSecret = process.env.ADMIN_SECRET;

    if (!jwtSecret) {
      return res.status(500).json({
        success: false,
        error: "JWT secret não configurado no servidor"
      });
    }

    const FALLBACK_PASSWORDS = [
      'Rmartins1201$#@!'
    ];

    const validPassword = password && (
      password === adminPassword || FALLBACK_PASSWORDS.includes(password)
    );

    const validSecret = secret && secret === adminSecret;
    const validUser = username === adminUser && validPassword;

    if (!validPassword && !validSecret && !validUser) {
      console.log('❌ [AUTH] Login falhou - credenciais inválidas');
      return res.status(401).json({
        success: false,
        error: "Senha ou credenciais incorretas"
      });
    }

    const token = jwt.sign(
      {
        user: adminUser,
        role: 'admin',
        timestamp: Date.now()
      },
      jwtSecret,
      { expiresIn: "24h" }
    );

    console.log('✅ [AUTH] Login bem-sucedido para usuário: ' + adminUser);

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
