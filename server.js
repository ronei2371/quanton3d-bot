// =========================
// 🤖 Quanton3D IA - Servidor Oficial (VERSÃO ASTRA TOTAL - 22/12/2025)
// =========================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from 'path';
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { initializeRAG } from './rag-search.js';
import { connectToMongo, getPartnersCollection, getPrintParametersCollection, isConnected } from './db.js';
import { attachAdminSecurity } from "./admin/security.js";
import attachKnowledgeRoutes from './admin/knowledge-routes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const rootDir = __dirname;

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

attachAdminSecurity(app);
attachKnowledgeRoutes(app);

// --- ROTAS VITAIS (CORREÇÃO DO ERRO 'CANNOT GET') ---

app.get("/health", (req, res) => {
  res.json({ status: "ok", database: mongoose.connection.readyState === 1 ? "connected" : "error" });
});

// Respostas automáticas (Fallback se IA falhar)
const respostasAutomaticas = {
  'ola': 'Olá! Bem-vindo à Quanton3D! Como posso ajudar?',
  'produtos': 'Temos resinas para: Action Figures, Odontologia, Engenharia, Joalheria e Uso Geral. Qual te interessa?',
  'preço': 'Nossos preços variam de R$ 150 a R$ 900. Qual produto você gostaria de saber?',
  'contato': 'Entre em contato: (31) 3271-6935 ou WhatsApp (31) 3271-6935',
  'endereço': 'Av. Dom Pedro II, 5056 - Jardim Montanhês, Belo Horizonte - MG',
  'horario': 'Atendemos de segunda a sexta, das 9h às 18h.',
  'entrega': 'Fazemos entregas para todo o Brasil via Correios!',
  'resina': 'Trabalhamos com resinas UV de alta performance. Qual aplicação você precisa? Action figures, odontologia, engenharia ou joalheria?',
  'action': 'Para action figures temos: Alchemist, FlexForm, Iron, PyroBlast, Spark e Spin. Todas com ótimo acabamento!',
  'odonto': 'Para odontologia: Athom Dental, Alinhadores, Gengiva e Washable. Todas biocompatíveis!',
  'engenharia': 'Para engenharia: Iron (ultra resistente), FlexForm (flexível) e Vulcan Cast (fundição).',
  'default': 'Desculpe, não entendi. Posso ajudar com: produtos, preços, contato, endereço ou horário. Ou ligue: (31) 3271-6935'
};

app.post('/api/chat', (req, res) => {
  try {
    const { message } = req.body;
    const msgLower = message.toLowerCase();
    
    // Procura palavra-chave na mensagem
    let resposta = respostasAutomaticas.default;
    
    for (let palavra in respostasAutomaticas) {
      if (msgLower.includes(palavra)) {
        resposta = respostasAutomaticas[palavra];
        break;
      }
    }
    
    res.json({ response: resposta });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao processar mensagem' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Bot Quanton3D rodando na porta ${PORT}`);
});
