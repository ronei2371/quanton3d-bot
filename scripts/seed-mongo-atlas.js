// Seed de dados para MongoDB Atlas
// - Importa data/resins_extracted.json -> parametros
// - Importa knowledge/suggestions.json -> suggestions (quando existir)

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'quanton3d';
const PRINT_PARAMETERS_COLLECTION = 'parametros';
const SUGGESTIONS_COLLECTION = 'suggestions';

const PRINT_PARAMETERS_FILE = path.join(process.cwd(), 'data', 'resins_extracted.json');
const SUGGESTIONS_FILE_CANDIDATES = [
  path.join(process.cwd(), 'knowledge', 'suggestions.json'),
  path.join(process.cwd(), 'data', 'suggestions.json'),
  path.join(process.cwd(), 'suggestions.json')
];

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo nao encontrado: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function normalizeSuggestions(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.suggestions)) return raw.suggestions;
  if (Array.isArray(raw?.data)) return raw.data;
  return [];
}

async function seedPrintParameters(db) {
  console.log('[1/3] Importando parametros de impressao...');
  const data = loadJson(PRINT_PARAMETERS_FILE);

  if (!Array.isArray(data?.profiles)) {
    throw new Error('Estrutura invalida em data/resins_extracted.json: campo profiles ausente.');
  }

  const operations = data.profiles.map(profile => ({
    updateOne: {
      filter: { id: profile.id },
      update: {
        $set: {
          ...profile,
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      upsert: true
    }
  }));

  if (operations.length === 0) {
    console.log('⚠️ Nenhum perfil encontrado para importar.');
    return;
  }

  const result = await db.collection(PRINT_PARAMETERS_COLLECTION).bulkWrite(operations, { ordered: false });
  const total = await db.collection(PRINT_PARAMETERS_COLLECTION).countDocuments();
  console.log(`✅ Perfis importados/atualizados: ${result.upsertedCount}/${operations.length}`);
  console.log(`ℹ️ Total atual em parametros: ${total}`);
}

async function seedSuggestions(db) {
  console.log('[2/3] Importando sugestoes...');
  const suggestionsFile = SUGGESTIONS_FILE_CANDIDATES.find(filePath => fs.existsSync(filePath));

  if (!suggestionsFile) {
    console.log('⚠️ Nenhum arquivo de sugestoes encontrado. Pulando etapa de sugestoes.');
    return;
  }

  const raw = loadJson(suggestionsFile);
  const suggestions = normalizeSuggestions(raw);

  if (suggestions.length === 0) {
    console.log('⚠️ Nenhuma sugestao encontrada para importar.');
    return;
  }

  const operations = suggestions.map(suggestion => ({
    updateOne: {
      filter: suggestion.id != null ? { id: suggestion.id } : { suggestion: suggestion.suggestion },
      update: {
        $setOnInsert: {
          ...suggestion,
          createdAt: suggestion.createdAt || suggestion.timestamp || new Date()
        }
      },
      upsert: true
    }
  }));

  const result = await db.collection(SUGGESTIONS_COLLECTION).bulkWrite(operations, { ordered: false });
  const total = await db.collection(SUGGESTIONS_COLLECTION).countDocuments();
  console.log(`✅ Sugestoes importadas: ${result.upsertedCount}`);
  console.log(`ℹ️ Total atual em suggestions: ${total}`);
}

async function clearCollections(db) {
  const printResult = await db.collection(PRINT_PARAMETERS_COLLECTION).deleteMany({});
  const suggestionsResult = await db.collection(SUGGESTIONS_COLLECTION).deleteMany({});
  console.log(`[0/3] Limpeza completa: parametros=${printResult.deletedCount}, suggestions=${suggestionsResult.deletedCount}`);
}

async function runSeed() {
  if (!MONGODB_URI) {
    throw new Error('Defina a variavel MONGODB_URI antes de rodar o seed.');
  }

  console.log('='.repeat(60));
  console.log('SEED IMEDIATO - QUANTON3D');
  console.log('='.repeat(60));

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  try {
    await clearCollections(db);
    await seedPrintParameters(db);
    await seedSuggestions(db);
    console.log('[3/3] Seed concluido com sucesso.');
  } finally {
    await client.close();
  }
}

runSeed().catch(error => {
  console.error('Erro no seed:', error.message);
  process.exit(1);
});
