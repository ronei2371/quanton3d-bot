import express from "express";
import jwt from "jsonwebtoken";

const router = express.Router();

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || "quanton-admin-fallback-secret";
const ADMIN_SECRET_OVERRIDE = process.env.ADMIN_SECRET_OVERRIDE;

if (!ADMIN_PASSWORD) {
  console.warn("[AUTH] ⚠️ ADMIN_PASSWORD não configurada.");
}

/**
 * POST /auth/login
 * ✅ CORRIGIDO: username é opcional — funciona só com senha
 */
router.post("/login", (req, res) => {
  try {
    const { password, username, secret: legacyBodySecret } = req.body ?? {};
    const jwtSecret = process.env.ADMIN_JWT_SECRET;

    if (!jwtSecret) {
      return res.status(500).json({ success: false, error: "JWT secret não configurado" });
    }

    if (!ADMIN_PASSWORD) {
      return res.status(503).json({ success: false, error: "ADMIN_PASSWORD ausente no servidor" });
    }

    const requestSecret = req.headers["x-admin-secret"] || legacyBodySecret;

    // ✅ CORREÇÃO: username é OPCIONAL
    // Aceita: só senha | username + senha | secret + senha
    const hasPrimaryCreds = Boolean(
      password &&
      password === ADMIN_PASSWORD &&
      (!username || username === ADMIN_USER)
    );

    const hasLegacyFallback = Boolean(
      ADMIN_SECRET_OVERRIDE &&
      requestSecret &&
      requestSecret === ADMIN_SECRET_OVERRIDE &&
      password === ADMIN_PASSWORD
    );

    if (!hasPrimaryCreds && !hasLegacyFallback) {
      console.log("❌ [AUTH] Login falhou - credenciais inválidas");
      return res.status(401).json({ success: false, error: "Credenciais inválidas" });
    }

    const authMethod = hasPrimaryCreds ? "password" : "secret+password";

    const token = jwt.sign(
      { user: ADMIN_USER, role: "admin", method: authMethod, timestamp: Date.now() },
      jwtSecret,
      { expiresIn: "24h" }
    );

    console.log(`✅ [AUTH] Login bem-sucedido (${authMethod})`);

    res.json({ success: true, token, expiresIn: "24h" });
  } catch (err) {
    console.error("❌ [AUTH] Erro no login:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /auth/verify
 */
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

/**
 * Middleware JWT para rotas protegidas
 */
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
