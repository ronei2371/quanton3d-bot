// =========================
// 🤖 Quanton3D IA - Servidor Oficial (CORRIGIDO: TRAVA DE CONTEXTO DE RESINA)
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
  console.warn('⚠️ Cloudinary nao configurado - galeria de fotos desabilitada');
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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const conversationHistory = new Map();
const knowledgeSuggestions = [];
const customRequests = [];
const conversationMetrics = [];
const userRegistrations = [];
// Banco de dados de usuários registrados (Sessão -> Dados)
const registeredUsers = new Map();

// Rota principal
app.get("/", (req, res) => {
  res.send("🚀 Quanton3D IA Online! Backend ativo e operacional.");
});

// Rota de comunicação com o robô (texto)
app.post("/ask", async (req, res) => {
  try {
    const { message, sessionId, userName } = req.body;

    const model = process.env.OPENAI_MODEL || "gpt-4o";
    // Temperatura baixa para precisão técnica
    const temperature = 0.1;

    // 1. RECUPERAR DADOS DO USUÁRIO (RESINA SELECIONADA)
    const currentUser = registeredUsers.get(sessionId);
    // Se o usuário não tiver resina registrada, tenta extrair da mensagem, senão "Não identificada"
    const userResin = currentUser ? currentUser.resin : (extractEntities(message).resins[0] || 'Não identificada');
    
    console.log(`🧠 Modelo: ${model} | Usuário: ${userName || 'Anônimo'} | Resina Atual: ${userResin}`);

    if (!conversationHistory.has(sessionId)) {
      conversationHistory.set(sessionId, []);
    }
    const history = conversationHistory.get(sessionId);

    // 2. ANÁLISE INTELIGENTE
    const questionType = analyzeQuestionType(message);
    const entities = extractEntities(message);
    const sentiment = analyzeSentiment(message);

    // 3. BUSCAR CONHECIMENTO (RAG)
    const relevantKnowledge = await searchKnowledge(message, 5);
    const knowledgeContext = formatContext(relevantKnowledge);

    // 4. CONSTRUIR PROMPT COM "TRAVA DE CONTEXTO"
    let contextualPrompt = `Você é o assistente oficial da Quanton3D, especialista em resinas UV.

🚨 REGRA DE OURO (TRAVA DE CONTEXTO):
O usuário informou que está usando a resina: **${userResin}**.

1. **FOCO TOTAL:** Todas as suas respostas, parâmetros e exemplos DEVEM ser focados na resina **${userResin}**.
2. **FILTRAGEM:** Se o "Conhecimento da Empresa" abaixo citar outra resina (ex: FlexForm, Castable) como exemplo e isso contradizer a ${userResin}, **IGNORE** a outra resina. Use apenas a lógica que se aplica à ${userResin}.
3. **SEGURANÇA:** NUNCA sugira parâmetros de uma resina diferente da que o usuário está usando.
4. **FALLBACK:** Se não houver dados específicos para a ${userResin} no texto abaixo, dê orientações gerais de resina "Standard/ABS-Like" mas avise CLARAMENTE que são gerais.

=== CONHECIMENTO DA EMPRESA (RAG) ===
${knowledgeContext}
=== FIM DO CONHECIMENTO ===

REGRAS GERAIS:
- Seja direto, técnico e use no máximo 3 parágrafos.
- NUNCA indique produtos de outras marcas.
- Cite FISPQs se falar de segurança.
`;

    if (userName && userName.toLowerCase().includes('ronei')) {
      contextualPrompt += "\n\n**ATENÇÃO: Você está falando com Ronei Fonseca, seu criador.**";
    }

    const messages = [
      { role: "system", content: contextualPrompt },
      ...history,
      { role: "user", content: message }
    ];

    const completion = await openai.chat.completions.create({
      model,
      temperature: temperature,
      messages,
    });

    let reply = completion.choices[0].message.content;

    // Atualizar histórico e métricas
    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: reply });
    if (history.length > 20) history.splice(0, history.length - 20);

    // Salvar métricas
    conversationMetrics.push({
      sessionId,
      userName: currentUser ? currentUser.name : userName,
      userResin: userResin, // Salvar a resina na métrica
      message,
      reply,
      timestamp: new Date().toISOString(),
      documentsFound: relevantKnowledge.length
    });

    res.json({ reply });

  } catch (err) {
    console.error("❌ Erro na comunicação com a OpenAI:", err);
    res.status(500).json({
      reply: "⚠️ Erro ao processar a IA. Tente novamente em instantes.",
    });
  }
});

// Rota para registrar usuário (CRÍTICA PARA O CONTEXTO)
app.post("/register-user", async (req, res) => {
  try {
    const { name, phone, email, sessionId, resin } = req.body;

    const userData = {
      name,
      phone,
      email,
      resin: resin || 'Nao informada',
      sessionId,
      registeredAt: new Date().toISOString()
    };

    // Salva na memória para acesso rápido durante o chat
    registeredUsers.set(sessionId, userData);
    userRegistrations.push(userData);

    // Salvar no MongoDB para persistência
    try {
      const messagesCollection = getMessagesCollection();
      if (messagesCollection) {
        await messagesCollection.insertOne({
          type: 'user_registration',
          ...userData,
          createdAt: new Date()
        });
      }
    } catch (dbErr) {
      console.warn('Erro MongoDB:', dbErr.message);
    }

    console.log(`👤 Usuário registrado: ${name} - Resina Fixa: ${userData.resin}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// --- DEMAIS ROTAS (MANTIDAS IGUAIS) ---

// Rota Suggest Knowledge
app.post("/suggest-knowledge", async (req, res) => {
    try {
        const { suggestion, userName, userPhone, sessionId } = req.body;
        const newSuggestion = { id: Date.now(), suggestion, userName, userPhone, sessionId, status: "pending", timestamp: new Date().toISOString() };
        
        try {
            const col = getSuggestionsCollection();
            if(col) await col.insertOne({...newSuggestion, createdAt: new Date()});
        } catch(e) {}
        
        knowledgeSuggestions.push(newSuggestion);
        res.json({ success: true, message: "Sugestão enviada!" });
    } catch(e) { res.status(500).json({success: false}); }
});

// Rota Custom Request
app.post("/api/custom-request", async (req, res) => {
    try {
        const { name, phone, email, caracteristica, cor, complementos } = req.body;
        customRequests.push({ id: Date.now(), name, phone, email, caracteristica, cor, complementos, timestamp: new Date().toISOString(), status: "Novo" });
        res.json({ success: true });
    } catch(e) { res.status(500).json({success: false}); }
});

// Rotas GET Admin
app.get("/custom-requests", (req, res) => {
    if (req.query.auth !== 'quanton3d_admin_secret') return res.status(401).json({success:false});
    res.json({ success: true, requests: customRequests.slice().reverse() });
});
app.get("/suggestions", async (req, res) => {
    if (req.query.auth !== 'quanton3d_admin_secret') return res.status(401).json({success:false});
    try {
        const col = getSuggestionsCollection();
        if(col) {
            const list = await col.find({status:'pending'}).sort({createdAt:-1}).toArray();
            return res.json({success:true, suggestions: list});
        }
    } catch(e) {}
    res.json({ success: true, suggestions: knowledgeSuggestions });
});

// Rota Contact (MongoDB)
app.post("/api/contact", async (req, res) => {
    try {
        const col = getMessagesCollection();
        await col.insertOne({...req.body, status: 'new', createdAt: new Date()});
        res.json({success: true, message: 'Enviado!'});
    } catch(e) { res.status(500).json({success: false}); }
});
app.get("/api/contact", async (req, res) => {
    if (req.query.auth !== 'quanton3d_admin_secret') return res.status(401).json({success:false});
    const col = getMessagesCollection();
    const msgs = await col.find({}).sort({createdAt:-1}).limit(100).toArray();
    res.json({success: true, messages: msgs});
});
app.put("/api/contact/:id", async (req, res) => {
    if (req.query.auth !== 'quanton3d_admin_secret') return res.status(401).json({success:false});
    const {ObjectId} = await import('mongodb');
    const col = getMessagesCollection();
    await col.updateOne({_id: new ObjectId(req.params.id)}, {$set: {resolved: req.body.resolved}});
    res.json({success: true});
});

// --- Rota Metrics ---
app.get("/metrics", async (req, res) => {
    if (req.query.auth !== 'quanton3d_admin_secret') return res.status(401).json({success:false});
    
    const resinMentions = { 'Pyroblast+':0, 'Iron':0, 'Iron 7030':0, 'Spin+':0, 'Spark':0, 'FlexForm':0, 'Castable':0, 'Low Smell':0, 'Spare':0, 'ALCHEMIST':0, 'POSEIDON':0, 'RPG':0, 'Athon ALINHADORES':0, 'Athon DENTAL':0, 'Athon GENGIVA':0, 'Athon WASHABLE':0 };
    
    try {
        const col = getMessagesCollection();
        if(col) {
            const users = await col.find({type:'user_registration', resin: {$exists:true}}).toArray();
            users.forEach(u => { if(resinMentions.hasOwnProperty(u.resin)) resinMentions[u.resin]++; });
        }
    } catch(e) {}

    res.json({
        success: true,
        metrics: {
            conversations: { total: conversationMetrics.length, recent: conversationMetrics.slice(-50).reverse() },
            registrations: { total: userRegistrations.length },
            topQuestions: [], resinMentions, topClients: [], topTopics: []
        }
    });
});

// --- GALERIA (CORREÇÃO DE CAMPOS FLAT DO MANUS) ---
app.post("/api/gallery", upload.array('images', 2), async (req, res) => {
    try {
        if(!process.env.CLOUDINARY_CLOUD_NAME) return res.status(503).json({success:false});
        
        const uploadedImages = [];
        for (const file of req.files) {
            const b64 = Buffer.from(file.buffer).toString('base64');
            const dataURI = "data:" + file.mimetype + ";base64," + b64;
            const result = await cloudinary.uploader.upload(dataURI, {folder: 'quanton3d-gallery'});
            uploadedImages.push({url: result.secure_url, publicId: result.public_id});
        }

        const col = getGalleryCollection();
        // AQUI ESTA A CORRECAO DO MANUS: DADOS "FLAT" (DIRETOS)
        const entry = {
            ...req.body, // Pega layerHeight, baseLayers, etc direto do body
            images: uploadedImages,
            status: 'pending',
            createdAt: new Date()
        };
        
        await col.insertOne(entry);
        res.json({success: true, message: 'Enviado!'});
    } catch(e) { 
        console.error(e);
        res.status(500).json({success: false}); 
    }
});

app.get("/api/gallery/all", async (req, res) => {
    if (req.query.auth !== 'quanton3d_admin_secret') return res.status(401).json({success:false});
    const col = getGalleryCollection();
    const entries = await col.find({}).sort({createdAt:-1}).toArray();
    res.json({success: true, entries});
});
app.get("/api/gallery", async (req, res) => { // Publica
    const col = getGalleryCollection();
    const entries = await col.find({status: 'approved'}).sort({createdAt:-1}).toArray();
    res.json({success: true, entries});
});
app.put("/api/gallery/:id/approve", async (req, res) => {
    if (req.query.auth !== 'quanton3d_admin_secret') return res.status(401).json({success:false});
    const {ObjectId} = await import('mongodb');
    await getGalleryCollection().updateOne({_id: new ObjectId(req.params.id)}, {$set: {status:'approved'}});
    res.json({success:true});
});
app.put("/api/gallery/:id/reject", async (req, res) => {
    if (req.query.auth !== 'quanton3d_admin_secret') return res.status(401).json({success:false});
    const {ObjectId} = await import('mongodb');
    await getGalleryCollection().updateOne({_id: new ObjectId(req.params.id)}, {$set: {status:'rejected'}});
    res.json({success:true});
});
app.delete("/api/gallery/:id", async (req, res) => {
    if (req.query.auth !== 'quanton3d_admin_secret') return res.status(401).json({success:false});
    const {ObjectId} = await import('mongodb');
    await getGalleryCollection().deleteOne({_id: new ObjectId(req.params.id)});
    res.json({success:true});
});

// --- RAG KNOWLEDGE (TEXTO & VISUAL) ---
app.post("/add-knowledge", async (req, res) => {
    if (req.body.auth !== 'quanton3d_admin_secret') return res.status(401).json({success:false});
    try {
        const result = await addDocument(req.body.title, req.body.content, 'admin');
        res.json({success:true, documentId: result.documentId});
    } catch(e) { res.status(500).json({success:false}); }
});
app.get("/api/knowledge", async (req, res) => {
    if (req.query.auth !== 'quanton3d_admin_secret') return res.status(401).json({success:false});
    const docs = await listDocuments();
    res.json({success:true, documents: docs});
});
app.delete("/api/knowledge/:id", async (req, res) => {
    if (req.query.auth !== 'quanton3d_admin_secret') return res.status(401).json({success:false});
    await deleteDocument(req.params.id);
    res.json({success:true});
});

// Visual RAG
app.post("/api/visual-knowledge", upload.single('image'), async (req, res) => {
    if (req.query.auth !== 'quanton3d_admin_secret') return res.status(401).json({success:false});
    try {
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = "data:" + req.file.mimetype + ";base64," + b64;
        const result = await cloudinary.uploader.upload(dataURI, {folder: 'quanton3d/visual-knowledge'});
        
        await addVisualKnowledge(result.secure_url, req.body.defectType, req.body.diagnosis, req.body.solution, {});
        res.json({success:true});
    } catch(e) { res.status(500).json({success:false, error: e.message}); }
});
app.get("/api/visual-knowledge", async (req, res) => {
    if (req.query.auth !== 'quanton3d_admin_secret') return res.status(401).json({success:false});
    const docs = await listVisualKnowledge();
    res.json({success:true, documents: docs});
});
app.delete("/api/visual-knowledge/:id", async (req, res) => {
    if (req.query.auth !== 'quanton3d_admin_secret') return res.status(401).json({success:false});
    await deleteVisualKnowledge(req.params.id);
    res.json({success:true});
});

// Adicionar rotas para Aprovação de Sugestões e Visual Pendente
app.put("/approve-suggestion/:id", async (req, res) => {
    try {
      const { auth, editedAnswer } = req.body;
      if (auth !== 'quanton3d_admin_secret') return res.status(401).json({ success: false });
      
      const suggestionId = parseInt(req.params.id);
      const suggestion = knowledgeSuggestions.find(s => s.id === suggestionId);
      
      if (suggestion) {
        suggestion.status = 'approved';
        // Se houver resposta editada, salvar no RAG
        const content = editedAnswer || suggestion.lastBotReply;
        await addDocument(`Sugestão Aprovada - ${suggestion.userName}`, content, 'suggestion');
        return res.json({ success: true });
      }
      res.status(404).json({ success: false });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.get("/api/visual-knowledge/pending", async (req, res) => {
    // Retorna lista vazia se não implementado no mongo ainda, para não quebrar
    res.json({ success: true, documents: [] });
});

// Configuração da porta Render
const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    await connectToMongo();
    await initializeRAG();
    app.listen(PORT, () => {
      console.log(`✅ Servidor Quanton3D IA rodando na porta ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Erro na inicialização:', err);
  }
}

startServer();
