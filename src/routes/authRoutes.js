import express from "express";
import jwt from "jsonwebtoken";

const router = express.Router();


const JWT_EXPIRATION = '24h';
const INVALID_TOKEN_RESPONSE = { success: false, error: 'Token inválido' };
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.ADMIN_JWT_SECRET;

if (!ADMIN_USER || !ADMIN_PASSWORD || !JWT_SECRET) {
  throw new Error('Missing required auth env vars');
}

/**
 * POST /auth/login
 * Autentica usuário e retorna JWT token
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

    if (username && username !== ADMIN_USER) {
      console.log('❌ [AUTH] Tentativa de login com usuário incorreto');
      return res.status(401).json({
        success: false,
        error: "Usuário incorreto"
      });
    }

    if (candidatePassword !== ADMIN_PASSWORD) {
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
