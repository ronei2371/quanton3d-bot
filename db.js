import { MongoClient } from 'mongodb';

// Definição da constante para evitar erros de digitação
const PRIMARY_PARAMETERS_COLLECTION = 'parametros';

let db = null;

export async function connectToMongo(mongoUri, dbName) {
  if (db) return db;

  try {
    const client = new MongoClient(mongoUri); // Opções modernas dispensam useNewUrlParser em drivers novos, mas mal não faz

    await client.connect();
    db = client.db(dbName);
    console.log(`[MongoDB] Conectado ao banco: ${dbName}`);

    // Lista coleções para garantir que a 'parametros' existe
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    // CRIAÇÃO SEGURA DA COLEÇÃO
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

// Helper para pegar a coleção correta em outros arquivos
export function getPrintParametersCollection() {
  return getDb().collection(PRIMARY_PARAMETERS_COLLECTION);
}
