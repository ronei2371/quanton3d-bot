// Modulo de conexao com MongoDB
// Gerencia conexao unica com o banco de dados usando apenas Mongoose

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
const connectionOptions = {
  dbName: DB_NAME,
  serverSelectionTimeoutMS: 5000,
  maxPoolSize: 10
};

if (!MONGODB_URI) {
  console.error('[MongoDB] ERRO CRITICO: Variavel de ambiente MONGODB_URI nao definida!');
  console.error('[MongoDB] Configure MONGODB_URI no Render ou no arquivo .env');
}

let db = null;
let connectingPromise = null;
let eventsBound = false;
let migrationExecuted = false;

async function ensureMongoIndexes() {
  try {
    await Promise.all([
      Parametros.createIndexes(),
      Sugestoes.createIndexes(),
      Conversas.createIndexes(),
      Metricas.createIndexes()
    ]);
    console.log('[MongoDB] Indices garantidos para Parametros, Sugestoes, Conversas e Metricas');
  } catch (err) {
    console.warn('[MongoDB] Falha ao criar indices:', err.message);
  }
}

async function createCollectionIfMissing(name, existingNames) {
  const normalizedExisting = existingNames || await listCollectionNames();
  if (normalizedExisting.includes(name)) {
    return false;
  }
  await mongoose.connection.db.createCollection(name);
  console.log(`[MongoDB] Colecao "${name}" criada`);
  return true;
}

async function listCollectionNames() {
  const collections = await mongoose.connection.db.listCollections().toArray();
  return collections.map((c) => c.name);
}

async function migrateLegacyPrintParameters(collectionNames) {
  if (migrationExecuted) return;

  const names = collectionNames || await listCollectionNames();
  const hasLegacy = names.includes(LEGACY_PARAMETERS_COLLECTION);

  if (!hasLegacy) {
    migrationExecuted = true;
    return;
  }

  const primaryCollection = mongoose.connection.collection(PRIMARY_PARAMETERS_COLLECTION);
  const legacyCollection = mongoose.connection.collection(LEGACY_PARAMETERS_COLLECTION);

  const legacyCount = await legacyCollection.countDocuments();
  if (legacyCount === 0) {
    await legacyCollection.drop();
    console.log(`[MongoDB] Colecao legacy "${LEGACY_PARAMETERS_COLLECTION}" vazia removida`);
    migrationExecuted = true;
    return;
  }

  console.warn(`[MongoDB] Migrando ${legacyCount} documentos da colecao legacy "${LEGACY_PARAMETERS_COLLECTION}" para "${PRIMARY_PARAMETERS_COLLECTION}"...`);

  const cursor = legacyCollection.find();
  let migrated = 0;

  // Usar upsert idempotente para evitar duplicacoes em ambientes distribuidos
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const { _id, ...rest } = doc;
    await primaryCollection.updateOne(
      {
        resinId: doc.resinId,
        profileId: doc.profileId || _id,
        resinName: doc.resinName
      },
      {
        $setOnInsert: rest
      },
      { upsert: true }
    );
    migrated++;
  }

  await legacyCollection.drop();
  console.log(`[MongoDB] Migracao concluida. ${migrated} documentos movidos e colecao legacy removida.`);
  migrationExecuted = true;
}

async function ensureCollections() {
  const collectionNames = await listCollectionNames();
  const requiredCollections = [
    'documents',
    'messages',
    'gallery',
    'visual_knowledge',
    'suggestions',
    'partners',
    'metricas',
    'conversas',
    PRIMARY_PARAMETERS_COLLECTION
  ];

  for (const collection of requiredCollections) {
    await createCollectionIfMissing(collection, collectionNames);
  }

  await migrateLegacyPrintParameters(collectionNames);
}

function bindConnectionEvents() {
  if (eventsBound) return;

  eventsBound = true;

  mongoose.connection.on('disconnected', async () => {
    console.warn('[MongoDB] Conexao perdida. Tentando reconectar...');
    try {
      await connectToMongo(true);
    } catch (err) {
      console.error('[MongoDB] Falha ao reconectar:', err.message);
    }
  });

  mongoose.connection.on('reconnected', () => {
    console.log('[MongoDB] Reconectado ao MongoDB');
  });

  mongoose.connection.on('error', (err) => {
    console.error('[MongoDB] Erro de conexao:', err.message);
  });
}

// Conectar ao MongoDB usando somente Mongoose
export async function connectToMongo(forceReconnect = false) {
  if (db && !forceReconnect) {
    return db;
  }

  if (!MONGODB_URI) {
    throw new Error('[MongoDB] MONGODB_URI nao definido');
  }

  bindConnectionEvents();

  if (!connectingPromise || forceReconnect) {
    connectingPromise = mongoose.connect(MONGODB_URI, connectionOptions);
  }

  await connectingPromise;
  db = mongoose.connection.db;

  await ensureCollections();
  await ensureMongoIndexes();

  const collectionNames = await listCollectionNames();
  console.log(`[MongoDB] Conectado! Colecoes existentes: ${collectionNames.join(', ') || 'nenhuma'}`);

  return db;
}

// Coleção para dados de aprendizado
export function getLearningCollection() {
  if (!db) {
    throw new Error('Banco de dados nao conectado');
  }
  return mongoose.connection.collection('learning');
}

// Obter instancia do banco de dados
export function getDb() {
  if (!db) {
    throw new Error('[MongoDB] Banco de dados nao conectado. Chame connectToMongo() primeiro.');
  }
  return db;
}

function getCollection(name) {
  if (!db) {
    throw new Error('[MongoDB] Banco de dados nao conectado. Chame connectToMongo() primeiro.');
  }
  return mongoose.connection.collection(name);
}

// Obter colecao de documentos (RAG)
export function getDocumentsCollection() {
  return getCollection('documents');
}

// Obter colecao de mensagens (Fale Conosco)
export function getMessagesCollection() {
  return getCollection('messages');
}

// Obter colecao de galeria (Fotos de impressoes)
export function getGalleryCollection() {
  return getCollection('gallery');
}

// Obter colecao de conhecimento visual (Visual RAG)
export function getVisualKnowledgeCollection() {
  return getCollection('visual_knowledge');
}

// Obter colecao de sugestoes de conhecimento
export function getSuggestionsCollection() {
  return getCollection('suggestions');
}

// Obter colecao de parceiros
export function getPartnersCollection() {
  return getCollection('partners');
}

// Obter colecao de parametros de impressao
export function getPrintParametersCollection() {
  return getCollection(activeParametersCollectionName);
}

// Obter colecao de metricas de conversas
export function getMetricasCollection() {
  return getCollection('metricas');
}

// Obter colecao de conversas
export function getConversasCollection() {
  return getCollection('conversas');
}

// Fechar conexao (para cleanup)
export async function closeMongo() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    db = null;
    connectingPromise = null;
    migrationExecuted = false;
    console.log('[MongoDB] Conexao Mongoose fechada');
  }
}

// Verificar status da conexao
export function isConnected() {
  return mongoose.connection.readyState === 1;
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
