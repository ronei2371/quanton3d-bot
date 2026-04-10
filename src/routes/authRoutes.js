// src/routes/authRoutes.js
import express from "express";
import jwt from "jsonwebtoken";

const router = express.Router();

// ====================== VALIDAÇÃO RIGOROSA DE AMBIENTE ======================
if (!process.env.ADMIN_USER) {
    console.error("❌ [AUTH] ADMIN_USER não configurado no .env");
    process.exit(1);
}
if (!process.env.ADMIN_PASSWORD) {
    console.error("❌ [AUTH] ADMIN_PASSWORD não configurado no .env");
    process.exit(1);
}
if (!process.env.ADMIN_JWT_SECRET || process.env.ADMIN_JWT_SECRET.length < 20) {
    console.error("❌ [AUTH] ADMIN_JWT_SECRET não configurado ou muito fraco no .env");
    process.exit(1);
}

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.ADMIN_JWT_SECRET;

console.log("✅ [AUTH] Configuração de autenticação carregada com sucesso.");

// ====================== LOGIN ======================
router.post("/login", (req, res) => {
    try {
        const { password, username } = req.body ?? {};

        if (!password) {
            return res.status(400).json({ 
                success: false, 
                error: "Senha é obrigatória" 
            });
        }

        // Apenas credenciais do .env são aceitas (sem fallback)
        const isValidUser = !username || username === ADMIN_USER;
        const isValidPassword = password === ADMIN_PASSWORD;

        if (!isValidUser || !isValidPassword) {
            console.log("❌ [AUTH] Login falhou - credenciais inválidas");
            return res.status(401).json({ 
                success: false, 
                error: "Credenciais inválidas" 
            });
        }

        const token = jwt.sign(
            { 
                user: ADMIN_USER, 
                role: "admin", 
                method: "password",
                timestamp: Date.now() 
            },
            JWT_SECRET,
            { expiresIn: "24h" }
        );

        console.log(`✅ [AUTH] Login bem-sucedido para ${ADMIN_USER}`);
        res.json({ success: true, token, expiresIn: "24h" });

    } catch (err) {
        console.error("❌ [AUTH] Erro no login:", err);
        res.status(500).json({ success: false, error: "Erro interno no servidor" });
    }
});

// ====================== VERIFY TOKEN ======================
router.post("/verify", (req, res) => {
    try {
        const { token } = req.body;
        if (!token) return res.json({ success: true, valid: false, reason: "no_token" });

        jwt.verify(token, JWT_SECRET);
        res.json({ success: true, valid: true });
    } catch (err) {
        res.json({ success: true, valid: false, reason: "invalid_token" });
    }
});

// ====================== JWT MIDDLEWARE ======================
const verifyJWT = (req, res, next) => {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, error: "token_required" });
    }

    const token = authHeader.slice(7);
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        return next();
    } catch (err) {
        return res.status(401).json({ success: false, error: "invalid_token" });
    }
};

export const requireJWT = verifyJWT;
export { verifyJWT };
export { router as authRoutes };
