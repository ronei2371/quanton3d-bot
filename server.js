// =========================
// 🤖 Quanton3D IA - Servidor Oficial (FINAL: COMPLETO + TRAVA + CORREÇÕES)
// =========================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import multer from "multer";
import { initializeRAG, searchKnowledge, formatContext, addDocument, listDocuments, deleteDocument, updateDocument, addVisualKnowledge, searchVisualKnowledge, formatVisualResponse, listVisualKnowledge, deleteVisualKnowledge } from './rag-search.js';
import { connectToMongo, getMessagesCollection, getGalleryCollection, getVisualKnowledgeCollection, getSuggestionsCollection } from './db.js';
import { v2 as cloudinary } from 'cloudinary';
import {
  analyzeQuestionType,
  extractEntities,
  generateIntelligentContext,
  learnFromConversation,
  generateSmartSuggestions,
  analyzeSentiment,
  personalizeResponse,
  calculateIntelligenceMetrics
} from './ai-intelligence-system.js';

dotenv.config();

// ===== CONFIGURACAO DO CLOUDINARY =====
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

if (process.env.CLOUDINARY_CLOUD_NAME) {
  console.log('☁️ Cloudinary configurado:', process.env.CLOUDINARY_CLOUD_NAME);
} else {
  console.warn('⚠️ Cloudinary nao configurado');
}

console.log('🔧 Sistema configurado para usar APENAS MongoDB para persistencia');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// === VARIÁVEIS GLOBAIS (MOVIDAS PARA O TOPO PARA EVITAR ERROS) ===
const conversationHistory = new Map();
const knowledgeSuggestions = [];
const customRequests = [];
const conversationMetrics = [];
const userRegistrations = [];
const registeredUsers = new Map(); // Mapa Sessão -> Dados do Usuário

// Rota principal
app.get("/", (req, res) => {
  res.send("🚀 Quanton3D IA Online! Backend Completo e Operacional.");
});

// === ROTA INTELIGENTE DO CHAT ===
app.post("/ask", async (req, res) => {
  try {
    const { message, sessionId, userName } = req.body;
    const model = process.env.OPENAI_MODEL || "gpt-4o";
    
    // 1. IDENTIFICAR O CONTEXTO DO USUÁRIO (TRAVA DE SEGURANÇA)
    const currentUser = registeredUsers.get(sessionId);
    const userResin = currentUser ? currentUser.resin : (extractEntities(message).resins[0] || 'Não identificada');
    
    console.log(`🧠 Chat: ${userName || 'Anônimo'} | Resina Fixada: ${userResin}`);

    if (!conversationHistory.has(sessionId)) conversationHistory.set(sessionId, []);
    const history = conversationHistory.get(sessionId);

    // 2. ANÁLISE INTELIGENTE (Mantendo a inteligência do Manus)
    const questionType = analyzeQuestionType(message);
    const entities = extractEntities(message);
    const sentiment = analyzeSentiment(message);

    // 3. BUSCAR CONHECIMENTO (RAG)
    const relevantKnowledge = await searchKnowledge(message, 5);
    const knowledgeContext = formatContext(relevantKnowledge);

    // 4. O PROMPT MESTRE (COM A REGRA DE OURO)
    let contextualPrompt = `Você é o assistente oficial da Quanton3D, especialista em resinas UV.

🚨 **TRAVA DE CONTEXTO ATIVADA** 🚨
O usuário informou que está utilizando a resina: **${userResin}**.

1. **FOCO TOTAL:** Todas as suas respostas, parâmetros e exemplos DEVEM ser focados na resina **${userResin}**.
2. **FILTRAGEM:** Se o "Conhecimento da Empresa" abaixo citar outra resina (ex: FlexForm) como exemplo e isso contradizer a ${userResin}, **IGNORE** a outra resina. Use apenas a lógica que se aplica à ${userResin}.
3. **SEGURANÇA:** NUNCA sugira parâmetros de uma resina diferente da que o usuário está usando.
4. **FALLBACK:** Se não houver dados específicos para a ${userResin} no texto abaixo, dê orientações gerais de resina "Standard/ABS-Like" mas AVISE CLARAMENTE que são gerais.

=== CONHECIMENTO DA EMPRESA (RAG) ===
${knowledgeContext}
=== FIM DA BASE ===

DIRETRIZES TÉCNICAS:
- Seja direto e resolva o problema.
- Não invente parâmetros. Use os do contexto.
- Cite FISPQs se falar de segurança.
`;

    if (userName && userName.toLowerCase().includes('ronei')) {
      contextualPrompt += "\n\n(Nota: Você está falando com Ronei Fonseca, seu criador. Seja técnico e preciso.)";
    }

    const messages = [
      { role: "system", content: contextualPrompt },
      ...history,
      { role: "user", content: message }
    ];

    // Temperatura adaptativa
    let adjustedTemperature = 0.1;
    if (questionType.type === 'parameters') adjustedTemperature = 0.05;

    const completion = await openai.chat.completions.create({
      model,
      temperature: adjustedTemperature,
      messages,
    });

    let reply = completion.choices[0].message.content;

    // Atualizar histórico
    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: reply });
    if (history.length > 20) history.splice(0, history.length - 20);

    // Métricas
    conversationMetrics.push({
      sessionId,
      userName: currentUser ? currentUser.name : userName,
      userResin,
      message,
      reply,
      timestamp: new Date().toISOString(),
      documentsFound: relevantKnowledge.length,
      questionType: questionType.type
    });

    res.json({ reply });

  } catch (err) {
    console.error("❌ Erro OpenAI:", err);
    res.status(500).json({ reply: "Tive um problema técnico momentâneo. Tente novamente." });
  }
});

// === ROTA DE REGISTRO (CORRIGIDA) ===
app.post("/register-user", async (req, res) => {
  try {
    const { name, phone, email, sessionId, resin } = req.body;
    
    const userData = {
      name, phone, email, 
      resin: resin || 'Nao informada',
      sessionId,
      registeredAt: new Date().toISOString()
    };

    // AGORA FUNCIONA: registeredUsers já foi declarada no topo
    registeredUsers.set(sessionId, userData);
    userRegistrations.push(userData);

    try {
        const col = getMessagesCollection();
        if(col) await col.insertOne({ type: 'user_registration', ...userData, createdAt: new Date() });
    } catch(e) { console.log('Erro Mongo:', e.message); }

    console.log(`✅ Usuário Registrado: ${name} - Resina: ${userData.resin}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// === GALERIA (CORRIGIDA PARA SALVAR DADOS NO "PARAMS") ===
app.post("/api/gallery", upload.array('images', 2), async (req, res) => {
    try {
        const uploadedImages = [];
        for (const file of req.files) {
            const b64 = Buffer.from(file.buffer).toString('base64');
            const result = await cloudinary.uploader.upload(`data:${file.mimetype};base64,${b64}`, {folder: 'quanton3d-gallery'});
            uploadedImages.push({url: result.secure_url, publicId: result.public_id});
        }

        const col = getGalleryCollection();
        
        // AQUI ESTÁ O SEGREDO: Salva "flat" E "nested" para garantir compatibilidade
        const entry = {
            ...req.body, 
            params: {
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
        res.status(500).json({success: false, error: e.message}); 
    }
});

// === ROTAS DE MÉTRICAS (RESTAURADAS PARA O PAINEL ORIGINAL) ===

app.get("/metrics", async (req, res) => {
    if (req.query.auth !== 'quanton3d_admin_secret') return res.status(401).json({success:false});
    
    // Garante que todas as resinas apareçam com zero se vazio
    const resinMentions = { 'Pyroblast+':0, 'Iron':0, 'Iron 7030':0, 'Spin+':0, 'Spark':0, 'FlexForm':0, 'Castable':0, 'Low Smell':0, 'Spare':0, 'ALCHEMIST':0, 'POSEIDON':0, 'RPG':0, 'Athon ALINHADORES':0, 'Athon DENTAL':0, 'Athon GENGIVA':0, 'Athon WASHABLE':0 };
    
    try {
        const col = getMessagesCollection();
        if(col) {
            const users = await col.find({type:'user_registration', resin: {$exists:true}}).toArray();
            users.forEach(u => { if(resinMentions.hasOwnProperty(u.resin)) resinMentions[u.resin]++; });
        }
    } catch(e) {}

    // Calcular estatísticas básicas
    const questionCounts = {};
    conversationMetrics.forEach(conv => {
        const q = conv.message.toLowerCase();
        if(q.length > 3) questionCounts[q] = (questionCounts[q] || 0) + 1;
    });
    const topQuestions = Object.entries(questionCounts).sort((a,b) => b[1]-a[1]).slice(0,5).map(([question, count]) => ({question, count}));

    res.json({
        success: true,
        metrics: {
            conversations: { total: conversationMetrics.length, recent: conversationMetrics.slice(-50).reverse() },
            registrations: { total: userRegistrations.length },
            topQuestions, 
            resinMentions, 
            topClients: [], 
            topTopics: []
        }
    });
});

app.get("/metrics/resin-details", async (req, res) => {
  const { auth, resin } = req.query;
  if (auth !== 'quanton3d_admin_secret') return res.status(401).json({ success: false });

  try {
    const col = getMessagesCollection();
    let customers = [];
    if (col) {
      const users = await col.find({ type: 'user_registration', resin: resin }).toArray();
      customers = users.map(u => ({
        name: u.name || 'Anonimo',
        email: u.email || '',
        phone: u.phone || '',
        printer: u.printer || '',
        registeredAt: u.createdAt
      }));
    }
    res.json({ success: true, resin, customersCount: customers.length, customers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/metrics/client-history", async (req, res) => {
  const { auth, clientKey } = req.query;
  if (auth !== 'quanton3d_admin_secret') return res.status(401).json({ success: false });

  try {
    const col = getMessagesCollection();
    let clientInfo = null;
    let conversations = [];

    if (col) {
      const user = await col.findOne({ type: 'user_registration', $or: [{email: clientKey}, {name: clientKey}] });
      if(user) clientInfo = { name: user.name, email: user.email };
    }
    
    conversations = conversationMetrics.filter(c => c.userName === clientKey || c.userEmail === clientKey)
        .map(c => ({ timestamp: c.timestamp, prompt: c.message, reply: c.reply }));

    res.json({ success: true, client: clientInfo, conversations, totalInteractions: conversations.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Outras rotas padrão
app.post("/api/custom-request", async (req, res) => { customRequests.push({ ...req.body, id: Date.now(), status: "Novo" }); res.json({ success: true }); });
app.get("/custom-requests", (req, res) => res.json({ success: true, requests: customRequests }));
app.get("/suggestions", async (req, res) => res.json({ success: true, suggestions: knowledgeSuggestions }));
app.post("/suggest-knowledge", async (req, res) => { knowledgeSuggestions.push({ ...req.body, status: 'pending', id: Date.now() }); res.json({ success: true }); });
app.put("/approve-suggestion/:id", async (req, res) => { 
    const { editedAnswer } = req.body;
    await addDocument(`Sugestão Aprovada ${req.params.id}`, editedAnswer || 'Resposta Aprovada', 'suggestion');
    res.json({success:true}); 
});
app.get("/api/gallery/all", async (req, res) => { const e = await getGalleryCollection().find({}).sort({createdAt:-1}).toArray(); res.json({success: true, entries: e}); });
app.get("/api/gallery", async (req, res) => { const e = await getGalleryCollection().find({status:'approved'}).sort({createdAt:-1}).toArray(); res.json({success: true, entries: e}); });
// Rota de deleção galeria
app.delete("/api/gallery/:id", async (req, res) => { const {ObjectId} = await import('mongodb'); await getGalleryCollection().deleteOne({_id: new ObjectId(req.params.id)}); res.json({success:true}); });
// R
