import express from "express";
import jwt from "jsonwebtoken";

const router = express.Router();

const JWT_EXPIRATION = '24h';
const INVALID_TOKEN_RESPONSE = { success: false, error: 'Token inválido' };

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_SECRET = process.env.ADMIN_SECRET; 
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'quanton-admin-fallback-secret';

router.post("/login", (req, res) => {
  try {
    const { password, username, secret } = req.body ?? {};
    
    // Normaliza a senha
    const candidatePassword = (typeof password === 'string' ? password : '') || 
                              (typeof secret === 'string' ? secret : '');

    // Verifica se é a Chave Mestra OU Senha Normal
    const isSecretMatch = ADMIN_SECRET && candidatePassword === ADMIN_SECRET;
    const isUserMatch = ADMIN_PASSWORD && candidatePassword === ADMIN_PASSWORD;

    if (isSecretMatch || isUserMatch) {
      console.log(`✅ [AUTH] Login Aprovado via Chave Mestra/Senha!`);
      
      const token = jwt.sign(
        { role: 'admin', user: ADMIN_USER, isAdmin: true, timestamp: Date.now() },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRATION }
      );

      // --- O PACOTE COMPLETO (SUPER RESPOSTA) ---
      // Mandamos tudo o que o frontend possa estar esperando
      return res.json({ 
        success: true, 
        token, 
        // Variação 1: Direto na raiz
        role: 'admin',      
        isAdmin: true,      
        valid: true,
        type: 'admin',
        // Variação 2: Dentro de um objeto user
        user: {
            name: ADMIN_USER,
            username: ADMIN_USER,
            role: 'admin',
            isAdmin: true
        },
        // Variação 3: Legado
        username: ADMIN_USER,
        expiresIn: JWT_EXPIRATION 
      });
    }

    console.log('❌ [AUTH] Credenciais inválidas');
    return res.status(401).json({ success: false, error: "Senha incorreta" });

  } catch (err) {
    console.error('❌ [AUTH] Erro no login:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Verificação de Token também reforçada
router.post("/verify", (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.json({ success: true, valid: false, reason: 'no_token' });

    jwt.verify(token, JWT_SECRET);
    // Responde com todas as variações também
    res.json({ 
        success: true, 
        valid: true, 
        role: 'admin', 
        isAdmin: true,
        user: { role: 'admin' }
    }); 
  } catch (err) {
    res.json({ success: true, valid: false, reason: 'invalid_token' });
  }
});

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
