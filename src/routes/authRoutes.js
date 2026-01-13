diff --git a/src/routes/authRoutes.js b/src/routes/authRoutes.js
index 1b03ee4eb7ef0dc0ae9b02538ff3dfcf5ff96c85..b8d4f15c8fe40e88282d5eb15208375f20debf10 100644
--- a/src/routes/authRoutes.js
+++ b/src/routes/authRoutes.js
@@ -1,32 +1,32 @@
 import express from "express";
 import jwt from "jsonwebtoken";
 
 const router = express.Router();
 
 // Configurações
-const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'rmartins1201';
+const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.ADMIN_SECRET || 'rmartins1201';
 const ADMIN_USER = process.env.ADMIN_USER || 'admin';
 const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'quanton3d_jwt_secret_key_2025';
 const JWT_EXPIRATION = '24h';
 const INVALID_TOKEN_RESPONSE = { success: false, error: 'Token inválido' };
 
 /**
  * POST /auth/login
  * Autentica usuário e retorna JWT token
  */
 router.post("/login", (req, res) => {
   try {
     const { password, username } = req.body;
 
     // Validar senha
     if (!password) {
       console.log('⚠️ [AUTH] Tentativa de login sem senha');
       return res.status(400).json({
         success: false,
         error: "Senha é obrigatória"
       });
     }
 
     if (username && username !== ADMIN_USER) {
       console.log(`❌ [AUTH] Tentativa de login com usuario incorreto`);
       return res.status(401).json({
