// Modulo de conexao com MongoDB
// Gerencia conexao unica com o banco de dados

import { MongoClient } from 'mongodb';

// URI do MongoDB (usar variavel de ambiente ou fallback)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ronei3271_db_user:OAlRnyGskVYCCzpC@quanton3d.e7xb5h2.mongodb.net/?appName=Quanton3D';
const DB_NAME = 'quanton3d';

let client = null;
let db = null;

// Conectar ao MongoDB
export async function connectToMongo() {
  if (db) {
    console.log('[MongoDB] Conexao ja estabelecida');
    return db;
  }

  try {
    console.log('[MongoDB] Conectando ao banco de dados...');
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
    
    return db;
  } catch (err) {
    console.error('[MongoDB] Erro ao conectar:', err.message);
    throw err;
  }
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

// Fechar conexao (para cleanup)
export async function closeMongo() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('[MongoDB] Conexao fechada');
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
  closeMongo,
  isConnected
};
