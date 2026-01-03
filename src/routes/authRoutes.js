import express from "express";
import jwt from "jsonwebtoken";

const router = express.Router();

// Configurações
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'rmartins1201';
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'quanton3d_jwt_secret_key_2025';
const JWT_EXPIRATION = '24h';

/**
 * POST /auth/login
 * Autentica usuário e retorna JWT token
 * 
 * Body: { password: string }
 * Response: { success: true, token: string, expiresIn: string }
 */
router.post("/login", (req, res) => {
  try {
    const { password } = req.body;

    // Validar senha
    if (!password) {
      return res.status(400).json({
        success: false,
        error: "Senha é obrigatória"
      });
    }

    if (password !== ADMIN_PASSWORD) {
      console.log(`❌ [AUTH] Tentativa de login com senha incorreta`);
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
 * 
 * Body: { token: string }
 * Response: { success: true, valid: boolean }
 */
router.post("/verify", (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.json({
        success: true,
        valid: false
      });
    }

    jwt.verify(token, JWT_SECRET);
    
    res.json({
      success: true,
      valid: true
    });

  } catch (err) {
    res.json({
      success: true,
      valid: false
    });
  }
});

/**
 * Middleware para proteger rotas com JWT
 * Uso: router.get("/rota-protegida", requireJWT, (req, res) => {...})
 */
export const requireJWT = (req, res, next) => {
  try {
    // Tentar pegar token do header Authorization
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: "Token JWT não fornecido"
      });
    }

    const token = authHeader.slice(7); // Remove "Bearer "
    
    // Verificar token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Adicionar dados do usuário à requisição
    req.user = decoded;
    
    next();

  } catch (err) {
    console.error('❌ [AUTH] Token inválido:', err.message);
    return res.status(401).json({
      success: false,
      error: "Token JWT inválido ou expirado"
    });
  }
};

export { router as authRoutes };
