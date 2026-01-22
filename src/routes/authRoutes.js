import express from "express";
import jwt from "jsonwebtoken";

const router = express.Router();

const JWT_EXPIRATION = '24h';
const INVALID_TOKEN_RESPONSE = { success: false, error: 'Token inválido' };

// Carrega as variáveis de ambiente
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_SECRET = process.env.ADMIN_SECRET; // Sua chave mestra (quanton3d_admin_secret)
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'quanton-admin-fallback-secret';

/**
 * POST /auth/login
 * Autentica usuário e retorna JWT token
 */
router.post("/login", (req, res) => {
  try {
    // Pega os dados que vêm da tela
    const { password, username, secret } = req.body ?? {};
    
    // Normaliza a senha (pega do campo password ou do campo secret)
    const candidatePassword = (typeof password === 'string' ? password : '') || 
                              (typeof secret === 'string' ? secret : '');

    // 1. REGRA DE OURO (Chave Mestra):
    // Se a senha digitada for igual à chave mestra, LIBERA GERAL.
    // Ignora qual nome de usuário foi digitado.
    if (ADMIN_SECRET && candidatePassword === ADMIN_SECRET) {
      console.log(`✅ [AUTH] Login liberado via Chave Mestra!`);
      const token = jwt.sign(
        { role: 'admin', user: ADMIN_USER, timestamp: Date.now() },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRATION }
      );
      return res.json({ success: true, token, expiresIn: JWT_EXPIRATION });
    }

    // 2. Se não for chave mestra, verifica usuário e senha normais
    // Aqui ele vai ser rigoroso com o nome de usuário
    const trimmedUsername = typeof username === 'string' ? username.trim() : '';
    
    // Se tiver usuário definido e não bater, erro
    if (trimmedUsername && trimmedUsername !== ADMIN_USER && trimmedUsername !== "admin") {
      console.log(`❌ [AUTH] Usuário incorreto: ${trimmedUsername}`);
      return res.status(401).json({ success: false, error: "Usuário incorreto" });
    }

    // Verifica a senha normal
    if (ADMIN_PASSWORD && candidatePassword === ADMIN_PASSWORD) {
      console.log(`✅ [AUTH] Login liberado via Senha de Usuário!`);
      const token = jwt.sign(
        { role: 'admin', user: ADMIN_USER, timestamp: Date.now() },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRATION }
      );
      return res.json({ success: true, token, expiresIn: JWT_EXPIRATION });
    }

    // Se chegou aqui, nada bateu
    console.log('❌ [AUTH] Credenciais inválidas');
    return res.status(401).json({ success: false, error: "Senha incorreta" });

  } catch (err) {
    console.error('❌ [AUTH] Erro no login:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /auth/verify
 * Verifica se um JWT token é válido
 */
router.post("/verify", (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.json({ success: true, valid: false, reason: 'no_token' });

    jwt.verify(token, JWT_SECRET);
    res.json({ success: true, valid: true });
  } catch (err) {
    res.json({ success: true, valid: false, reason: 'invalid_token' });
  }
});

/**
 * Middleware para proteger rotas com JWT
 */
export const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json(INVALID_TOKEN_RESPONSE);
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (err) {
    return res.status(401).json(INVALID_TOKEN_RESPONSE);
  }
};

export const requireJWT = verifyJWT;
export const authRoutes = router;
