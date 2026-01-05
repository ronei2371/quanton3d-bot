// Modulo de conexao com MongoDB
// Gerencia conexao unica com o banco de dados

import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';
import {
  Parametros,
  Sugestoes,
  Conversas,
  Metricas
} from './models/schemas.js';

// URI do MongoDB (OBRIGATORIO via variavel de ambiente)
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'quanton3d';
const PRIMARY_PARAMETERS_COLLECTION = 'parametros';
const LEGACY_PARAMETERS_COLLECTION = 'print_parameters';
const activeParametersCollectionName = PRIMARY_PARAMETERS_COLLECTION;

if (!MONGODB_URI) {
  console.error('[MongoDB] ERRO CRITICO: Variavel de ambiente MONGODB_URI nao definida!');
  console.error('[MongoDB] Configure MONGODB_URI no Render ou no arquivo .env');
}

let client = null;
let db = null;
let mongooseConnected = false;

async function ensureMongoIndexes() {
  try {
    await Parametros.createIndexes();
    await Sugestoes.createIndexes();
    await Conversas.createIndexes();
    await Metricas.createIndexes();
    console.log('[MongoDB] Indices garantidos para Parametros, Sugestoes, Conversas e Metricas');
  } catch (err) {
    console.warn('[MongoDB] Falha ao criar indices:', err.message);
  }
}

// Conectar ao MongoDB
export async function connectToMongo() {
  if (db) {
    console.log('[MongoDB] Conexao ja estabelecida');
    return db;
  }

  try {
    console.log('[MongoDB] Conectando ao banco de dados...');
    if (!mongooseConnected) {
      await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
      mongooseConnected = true;
      console.log('[MongoDB] Conexao Mongoose estabelecida');
    }
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    
    // Verificar colecoes existentes
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    console.log(`[MongoDB] Conectado! Colecoes existentes: ${collectionNames.join(', ') || 'nenhuma'}`);
    
    // Criar colecoes se nao existirem
    if (!collectionNames.includes('documents')) {
      await db.createCollection('documents');
      console.log('[MongoDB] Colecao "documents" criada');
    }
    if (!collectionNames.includes('messages')) {
      await db.createCollection('messages');
      console.log('[MongoDB] Colecao "messages" criada');
    }
    const hasPrimaryParameters = collectionNames.includes(PRIMARY_PARAMETERS_COLLECTION);
    const hasLegacyParameters = collectionNames.includes(LEGACY_PARAMETERS_COLLECTION);

    if (!hasPrimaryParameters) {
      await db.createCollection(PRIMARY_PARAMETERS_COLLECTION);
      console.log(`[MongoDB] Colecao \"${PRIMARY_PARAMETERS_COLLECTION}\" criada`);
    }

    if (hasLegacyParameters && !hasPrimaryParameters) {
      console.warn(`[MongoDB] Colecao legacy \"${LEGACY_PARAMETERS_COLLECTION}\" detectada. Migre os dados para \"${PRIMARY_PARAMETERS_COLLECTION}\" imediatamente.`);
    }

    await ensureMongoIndexes();
    
    return db;
  } catch (err) {
    console.error('[MongoDB] Erro ao conectar:', err.message);
    throw err;
  }
}

// Coleção para dados de aprendizado
export function getLearningCollection() {
  if (!db) {
    throw new Error('Banco de dados nao conectado');
  }
  return db.collection('learning');
}

// Obter instancia do banco de dados
export function getDb() {
  if (!db) {
    throw new Error('[MongoDB] Banco de dados nao conectado. Chame connectToMongo() primeiro.');
  }
  return db;
}

// Obter colecao de documentos (RAG)
export function getDocumentsCollection() {
  return getDb().collection('documents');
}

// Obter colecao de mensagens (Fale Conosco)
export function getMessagesCollection() {
  return getDb().collection('messages');
}

// Obter colecao de galeria (Fotos de impressoes)
export function getGalleryCollection() {
  return getDb().collection('gallery');
}

// Obter colecao de conhecimento visual (Visual RAG)
export function getVisualKnowledgeCollection() {
  return getDb().collection('visual_knowledge');
}

// Obter colecao de sugestoes de conhecimento
export function getSuggestionsCollection() {
  return getDb().collection('suggestions');
}

// Obter colecao de parceiros
export function getPartnersCollection() {
  return getDb().collection('partners');
}

// Obter colecao de parametros de impressao
export function getPrintParametersCollection() {
  return getDb().collection(activeParametersCollectionName);
}

// Obter colecao de metricas de conversas
export function getMetricasCollection() {
  return getDb().collection('metricas');
}

// Obter colecao de conversas
export function getConversasCollection() {
  return getDb().collection('conversas');
}

// Fechar conexao (para cleanup)
export async function closeMongo() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('[MongoDB] Conexao fechada');
  }
  if (mongooseConnected) {
    await mongoose.disconnect();
    mongooseConnected = false;
    console.log('[MongoDB] Conexao Mongoose fechada');
  }
}

// Verificar status da conexao
export function isConnected() {
  return db !== null;
}

export default {
  connectToMongo,
  getDb,
  getDocumentsCollection,
  getMessagesCollection,
  getGalleryCollection,
  getVisualKnowledgeCollection,
  getSuggestionsCollection,
  getPartnersCollection,
  getPrintParametersCollection,
  getMetricasCollection,
  getConversasCollection,
  Parametros,
  Sugestoes,
  Conversas,
  Metricas,
  closeMongo,
  isConnected
};

export {
  Parametros,
  Sugestoes,
  Conversas,
  Metricas
};
