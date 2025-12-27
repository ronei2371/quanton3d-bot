// =====================================================================
// File: admin/security.js
// Drop-in de segurança (login JWT, rotas admin protegidas e SSE).
// Por quê: tirar senha do HTML, limitar brute-force e proteger painel.
// =====================================================================
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import cors from "cors";

function allowListFromEnv(v){ return (v||"").split(",").map(s=>s.trim()).filter(Boolean); }
function issueToken(secret){ return jwt.sign({ role: "admin" }, secret, { expiresIn: "30m" }); }

function requireAdmin(jwtSecret){
  return (req,res,next)=>{
    const h = req.headers.authorization || "";
    if (!h.startsWith("Bearer ")) return res.status(401).json({ error: "unauthorized" });
    try { jwt.verify(h.slice(7), jwtSecret); return next(); }
    catch { return res.status(401).json({ error: "invalid_token" }); }
  };
}

function verifySSE(req, res, next, jwtSecret){
  // Por quê: EventSource não envia headers; usamos token via query
  const token = String(req.query.token || "");
  try { jwt.verify(token, jwtSecret); return next(); }
  catch { return res.status(401).end(); }
}

function attachAdminSecurity(app, config = {}){
  const ADMIN_SECRET = config.adminSecret ?? process.env.ADMIN_SECRET;
  const ADMIN_JWT_SECRET = config.adminJwtSecret ?? process.env.ADMIN_JWT_SECRET;
  const ADMIN_USERNAME = config.adminUsername ?? process.env.ADMIN_USERNAME ?? "admin";
  const ALLOWED = allowListFromEnv(config.allowedOrigins ?? process.env.CORS_ORIGIN);

  if (!ADMIN_SECRET || !ADMIN_JWT_SECRET) {
    console.warn("[admin] Faltam ADMIN_SECRET/ADMIN_JWT_SECRET; rotas admin não foram ativadas.");
    return;
  }

  // CORS apenas para origens informadas
  app.use("/admin", cors({
    origin(origin, cb){
      if (!origin) return cb(null, true);         // ferramentas locais (curl/Postman)
      return ALLOWED.includes(origin) ? cb(null, true) : cb(new Error("CORS not allowed"));
    }
  }));

  // Rate limit forte nas rotas admin
  const adminLimiter = rateLimit({ windowMs: 60_000, max: 10 });
  app.use("/admin", adminLimiter);

  // POST /admin/login → troca senha por JWT curto
  app.post("/admin/login", (req, res) => {
    const { username, password } = req.body || {};
    if (!password) return res.status(400).json({ error: "password_required" });
    if (username && username !== ADMIN_USERNAME) {
      return res.status(401).json({ error: "bad_credentials" });
    }
    if (password !== ADMIN_SECRET) return res.status(401).json({ error: "bad_credentials" });
    return res.json({ token: issueToken(ADMIN_JWT_SECRET), expiresIn: 1800 });
  });

  // POST /admin/feedback (exemplo protegido)
  app.post("/admin/feedback", requireAdmin(ADMIN_JWT_SECRET), (req, res) => {
    const { title, content } = req.body || {};
    if (!title || !content) return res.status(400).json({ error: "title/content_required" });
    // TODO: aqui você pode gerar embedding e salvar no Mongo/RAG
    return res.json({ ok: true, saved: { title } });
  });

  // GET /admin/stream (SSE autenticado via ?token=JWT)
  app.get("/admin/stream", (req, res) => {
    verifySSE(req, res, ()=>{}, ADMIN_JWT_SECRET);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.write("\n");
    const ping = setInterval(() => res.write("event: ping\ndata: {}\n\n"), 25000);
    res.write(`event: hello\ndata: {"ok":true}\n\n`);
    req.on("close", () => clearInterval(ping));
  });

  console.log("[admin] Rotas: /admin/login, /admin/feedback, /admin/stream");
}

export { attachAdminSecurity };


// =====================================================================
// PATCH NO SEU server.js (adicione 1 linha após criar o `app`)
// =====================================================================
// Exemplo (NÃO substitua tudo; apenas insira a linha indicada no seu arquivo):
//
// const express = require("express");
// const app = express();
// app.use(express.json({ limit: "1mb" }));
// require("./admin/security").attachAdminSecurity(app); // <-- ADICIONE ESTA LINHA
//
// // ...suas rotas existentes...
// app.listen(process.env.PORT || 3001);

// =====================================================================
// File: package.json (trecho de deps — garanta que existam)
// =====================================================================
// Adicione/garanta estas dependências no "dependencies" do seu package.json:
//
// "jsonwebtoken": "^9.0.2",
// "express-rate-limit": "^7.3.1",
// "cors": "^2.8.5"


// =====================================================================
// (Opcional) File: public/admin.html  — painel simples para testar
// =====================================================================
/*
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>Painel Admin (seguro)</title>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>body{font-family:sans-serif;margin:24px;max-width:720px}</style>
</head>
<body>
  <h1>Painel Admin</h1>

  <h3>1) Login</h3>
  <input id="pwd" type="password" placeholder="Senha de admin"/>
  <button id="btnLogin">Entrar</button>
  <pre id="loginOut"></pre>

  <h3>2) Enviar Feedback</h3>
  <input id="title" placeholder="Título"/><br/>
  <textarea id="content" rows="5" cols="60" placeholder="Conteúdo correto"></textarea><br/>
  <button id="btnSend">Salvar</button>
  <pre id="sendOut"></pre>

  <h3>3) Eventos (SSE)</h3>
  <pre id="events"></pre>

  <script>
    const API = location.origin; // troque se seu back estiver em outro domínio
    let TOKEN = localStorage.getItem("adm_jwt") || "";

    async function login() {
      const password = document.getElementById("pwd").value;
      const r = await fetch(`${API}/admin/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const js = await r.json();
      document.getElementById("loginOut").textContent = JSON.stringify(js, null, 2);
      if (js.token) { TOKEN = js.token; localStorage.setItem("adm_jwt", TOKEN); startSSE(); }
    }

    async function sendFeedback() {
      const title = document.getElementById("title").value;
      const content = document.getElementById("content").value;
      const r = await fetch(`${API}/admin/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${TOKEN}` },
        body: JSON.stringify({ title, content })
      });
      document.getElementById("sendOut").textContent = await r.text();
    }

    function startSSE() {
      if (!TOKEN) return;
      const es = new EventSource(`${API}/admin/stream?token=${encodeURIComponent(TOKEN)}`);
      es.addEventListener("hello", e => log(`hello: ${e.data}`));
      es.addEventListener("ping", _ => {});
      es.onerror = () => log("erro SSE (token ou servidor).");
      function log(t){ document.getElementById("events").textContent += t + "\n"; }
    }

    document.getElementById("btnLogin").onclick = login;
    document.getElementById("btnSend").onclick = sendFeedback;
    if (TOKEN) startSSE();
  </script>
</body>
</html>
*/
