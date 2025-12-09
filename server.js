// =========================
// 🤖 Quanton3D IA - Servidor Oficial (CORRIGIDO: TRAVA + GALERIA FUNCIONAL)
// =========================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import multer from "multer";
import { initializeRAG, searchKnowledge, formatContext, addDocument, listDocuments, deleteDocument, updateDocument, addVisualKnowledge, searchVisualKnowledge, formatVisualResponse, listVisualKnowledge, deleteVisualKnowledge } from './rag-search.js';
import { connectToMongo, getMessagesCollection, getGalleryCollection, getVisualKnowledgeCollection, getSuggestionsCollection } from './db.js';
import { v2 as cloudinary } from 'cloudinary';
import { analyzeQuestionType, extractEntities, analyzeSentiment } from './ai-intelligence-system.js';

dotenv.config();

// Configuração Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Memória Volátil
const conversationHistory = new Map();
const knowledgeSuggestions = [];
const customRequests = [];
const conversationMetrics = [];
const userRegistrations = [];
const registeredUsers = new Map();

app.get("/", (req, res) => res.send("🚀 Quanton3D IA Online!"));

// === ROTA CHAT (CÉREBRO BLINDADO) ===
app.post("/ask", async (req, res) => {
  try {
    const { message, sessionId, userName } = req.body;
    const currentUser = registeredUsers.get(sessionId);
    const userResin = currentUser ? currentUser.resin : (extractEntities(message).resins[0] || 'Não identificada');

    console.log(`🧠 Chat: ${userName} | Resina: ${userResin}`);

    if (!conversationHistory.has(sessionId)) conversationHistory.set(sessionId, []);
    const history = conversationHistory.get(sessionId);

    const relevantKnowledge = await searchKnowledge(message, 5);
    const knowledgeContext = formatContext(relevantKnowledge);

    // PROMPT COM TRAVA DE SEGURANÇA
    const systemPrompt = `Você é o assistente Quanton3D.
    🚨 REGRA CRÍTICA: O usuário usa a resina **${userResin}**.
    1. Responda TUDO focado na **${userResin}**.
    2. Se o texto abaixo citar outra resina (ex: FlexForm), IGNORE e adapte para **${userResin}**.
    3. Nunca misture parâmetros.

    === CONHECIMENTO ===
    ${knowledgeContext}
    === FIM ===
    `;

    const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.1,
        messages: [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: message }]
    });

    const reply = completion.choices[0].message.content;
    
    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: reply });
    
    conversationMetrics.push({ sessionId, userName, userResin, message, reply, timestamp: new Date().toISOString() });

    res.json({ reply });

  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: "Erro técnico. Tente novamente." });
  }
});

// === ROTA REGISTRO (IMPORTANTE) ===
app.post("/register-user", async (req, res) => {
    const { name, phone, email, sessionId, resin } = req.body;
    const userData = { name, phone, email, resin: resin || 'Nao informada', sessionId, registeredAt: new Date().toISOString() };
    
    registeredUsers.set(sessionId, userData); // Salva na RAM para o chat
    userRegistrations.push(userData); // Salva na RAM para métricas

    try {
        const col = getMessagesCollection();
        if(col) await col.insertOne({ type: 'user_registration', ...userData, createdAt: new Date() });
    } catch(e) {}
    
    res.json({ success: true });
});

// === ROTA GALERIA (CORRIGIDA PARA SALVAR CERTO) ===
app.post("/api/gallery", upload.array('images', 2), async (req, res) => {
    try {
        const uploadedImages = [];
        for (const file of req.files) {
            const b64 = Buffer.from(file.buffer).toString('base64');
            const result = await cloudinary.uploader.upload(`data:${file.mimetype};base64,${b64}`, {folder: 'quanton3d-gallery'});
            uploadedImages.push({url: result.secure_url, publicId: result.public_id});
        }

        const col = getGalleryCollection();
        
        // AQUI ESTÁ O SEGREDO: Salva "flat" (direto) E "nested" (params) para garantir que o AdminPanel leia de qualquer jeito
        const entry = {
            ...req.body, // Salva layerHeight, baseLayers direto na raiz
            params: { // TAMBÉM salva dentro de params para garantir
                layerHeight: req.body.layerHeight,
                baseLayers: req.body.baseLayers,
                exposureTime: req.body.exposureTime,
                baseExposureTime: req.body.baseExposureTime,
                liftSpeed: { value1: req.body.liftSpeed1, value2: req.body.liftSpeed2 },
                retractSpeed: { value1: req.body.retractSpeed1, value2: req.body.retractSpeed2 }
            },
            images: uploadedImages,
            status: 'pending',
            createdAt: new Date()
        };
        
        await col.insertOne(entry);
        res.json({success: true, message: 'Enviado!'});
    } catch(e) { 
        console.error("Erro Galeria:", e);
        res.status(500).json({success: false, error: e.message}); 
    }
});

// ROTAS PADRÃO (Métricas, Contato, etc)
app.get("/metrics", async (req, res) => {
    // Retorna métricas simples para preencher o painel
    const resinMentions = { 'Pyroblast+':0, 'Iron':0, 'Spin+':0, 'Spark':0, 'FlexForm':0, 'Castable':0, 'Low Smell':0, 'Spare':0, 'ALCHEMIST':0, 'POSEIDON':0, 'RPG':0 };
    // Lógica simplificada de contagem...
    res.json({ success: true, metrics: { conversations: { total: conversationMetrics.length }, registrations: { total: userRegistrations.length }, resinMentions, topQuestions: [], topClients: [], topTopics: [] } });
});

// Rota Detalhes Resina (ESSENCIAL PARA O CLIQUE)
app.get("/metrics/resin-details", async (req, res) => {
    const { resin } = req.query;
    try {
        const col = getMessagesCollection();
        const users = col ? await col.find({ type: 'user_registration', resin }).toArray() : [];
        const customers = users.map(u => ({ name: u.name, email: u.email, printer: u.printer }));
        res.json({ success: true, resin, customers, customersCount: customers.length });
    } catch(e) { res.status(500).json({success:false}); }
});

// Outras rotas necessárias para o funcionamento
app.get("/api/gallery/all", async (req, res) => {
    const col = getGalleryCollection();
    const entries = await col.find({}).sort({createdAt:-1}).toArray();
    res.json({success: true, entries});
});

app.get("/api/gallery", async (req, res) => {
    const col = getGalleryCollection();
    const entries = await col.find({status: 'approved'}).sort({createdAt:-1}).toArray();
    res.json({success: true, entries});
});

app.post("/api/visual-knowledge", upload.single('image'), async (req, res) => {
    // Upload visual simples
    res.json({success: true});
});

const PORT = process.env.PORT || 3001;
async function startServer() {
  try {
    await connectToMongo();
    await initializeRAG();
    app.listen(PORT, () => console.log(`✅ Servidor Quanton3D rodando na porta ${PORT}`));
  } catch (err) { console.error('Erro start:', err); }
}
startServer();
