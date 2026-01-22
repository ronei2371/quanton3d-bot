import express from "express";
import jwt from "jsonwebtoken";

const router = express.Router();

const JWT_EXPIRATION = '24h';
const INVALID_TOKEN_RESPONSE = { success: false, error: 'Token inválido' };

// Carrega as variáveis de ambiente
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_SECRET = process.env.ADMIN_SECRET; // Sua chave mestra
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'quanton-admin-fallback-secret';

router.post("/login", (req, res) => {
  try {
    const { password, username, secret } = req.body ?? {};
    
    // Normaliza a senha
    const candidatePassword = (typeof password === 'string' ? password : '') || 
                              (typeof secret === 'string' ? secret : '');

    // Verifica se é a Chave Mestra (Libera tudo)
    const isSecretMatch = ADMIN_SECRET && candidatePassword === ADMIN_SECRET;
    
    // Verifica se é Usuário Normal
    const isUserMatch = ADMIN_PASSWORD && candidatePassword === ADMIN_PASSWORD;

    if (isSecretMatch || isUserMatch) {
      console.log(`✅ [AUTH] Login Aprovado!`);
      
      const token = jwt.sign(
        { role: 'admin', user: ADMIN_USER, timestamp: Date.now() },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRATION }
      );

      // AQUI ESTÁ A MÁGICA:
      // Devolvemos o 'role' e o 'user' para a janelinha saber que deve sumir!
      return res.json({ 
        success: true, 
        token, 
        role: 'admin',     // <--- O Crachá que faltava
        user: ADMIN_USER,  // <--- O Nome do usuário
        expiresIn: JWT_EXPIRATION 
      });
    }

    // Se chegou aqui, falhou
    console.log('❌ [AUTH] Credenciais inválidas');
    return res.status(401).json({ success: false, error: "Senha incorreta" });

  } catch (err) {
    console.error('❌ [AUTH] Erro no login:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Mantém as outras rotas (verify e middleware) iguais
router.post("/verify", (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.json({ success: true, valid: false, reason: 'no_token' });
    jwt.verify(token, JWT_SECRET);
    res.json({ success: true, valid: true, role: 'admin' }); // Também confirma aqui
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
