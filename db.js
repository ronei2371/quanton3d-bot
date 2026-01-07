import { MongoClient } from 'mongodb';

// Definição da constante para evitar erros de digitação
const PRIMARY_PARAMETERS_COLLECTION = 'parametros';
const DEFAULT_DB_NAME = process.env.MONGODB_DB || process.env.DB_NAME || 'quanton3d';

let db = null;

export async function connectToMongo(mongoUri = process.env.MONGODB_URI, dbName = DEFAULT_DB_NAME) {
  if (db) return db;

  try {
    if (!mongoUri) {
      throw new Error('MONGODB_URI não configurado');
    }

    const client = new MongoClient(mongoUri);

    await client.connect();
    db = client.db(dbName);
    console.log(`[MongoDB] Conectado ao banco: ${dbName}`);

    // Lista coleções existentes
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    // CRIAÇÃO SEGURA DA COLEÇÃO 'parametros'
    if (!collectionNames.includes(PRIMARY_PARAMETERS_COLLECTION)) {
      await db.createCollection(PRIMARY_PARAMETERS_COLLECTION);
      console.log(`[MongoDB] Colecao "${PRIMARY_PARAMETERS_COLLECTION}" criada com sucesso.`);
    }

    return db;
  } catch (error) {
    console.error('[MongoDB] Erro fatal na conexão:', error);
    throw error;
  }
}

export function getDb() {
  if (!db) {
    throw new Error('Banco de dados não inicializado. Chame connectToMongo primeiro.');
  }
  return db;
}

// --- FUNÇÕES DE ACESSO ÀS COLEÇÕES ---

export function getPrintParametersCollection() {
  return getDb().collection(PRIMARY_PARAMETERS_COLLECTION);
}

export function getDocumentsCollection() {
  return getDb().collection('documents');
}

export function getVisualKnowledgeCollection() {
  return getDb().collection('visual_knowledge');
}

export function getConversasCollection() {
  return getDb().collection('conversas');
}

export function getSugestoesCollection() {
  return getDb().collection('sugestoes');
}

export function isConnected() {
  return !!db;
}

export function getCollection(name) {
  return getDb().collection(name);
}

// Essa é a parte que estava dando erro, agora está arrumada:
export function getLearningCollection() {
  return getDb().collection('ai_learning');
}
