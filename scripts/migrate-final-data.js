// Migracao final de dados para MongoDB
// - Importa perfis de impressao (data/resins_extracted.json) para print_parameters
// - Importa sugestoes (knowledge/suggestions.json) para suggestions

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'quanton3d';
const PRINT_PARAMETERS_COLLECTION = 'print_parameters';
const SUGGESTIONS_COLLECTION = 'suggestions';

const PRINT_PARAMETERS_FILE = path.join(process.cwd(), 'data', 'resins_extracted.json');

function ensureFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo nao encontrado: ${filePath}`);
  }
}

function loadPrintParameters() {
  ensureFileExists(PRINT_PARAMETERS_FILE);
  const data = JSON.parse(fs.readFileSync(PRINT_PARAMETERS_FILE, 'utf-8'));

  if (!Array.isArray(data.profiles)) {
    throw new Error('Estrutura invalida em data/resins_extracted.json: campo profiles ausente.');
  }

  return data;
}

function normalizeSuggestions(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.suggestions)) return raw.suggestions;
  if (Array.isArray(raw?.data)) return raw.data;
  return [];
}

function getSuggestionsFile() {
  const candidates = [
    path.join(process.cwd(), 'knowledge', 'suggestions.json'),
    path.join(process.cwd(), 'data', 'suggestions.json'),
    path.join(process.cwd(), 'suggestions.json')
  ];

  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

function resolveSuggestionFilter(suggestion) {
  if (suggestion._id) {
    try {
      return { _id: new ObjectId(suggestion._id) };
    } catch (error) {
      return { _id: suggestion._id };
    }
  }

  if (suggestion.id != null) {
    return { id: suggestion.id };
  }

  return {
    suggestion: suggestion.suggestion,
    createdAt: suggestion.createdAt || suggestion.timestamp || null
  };
}

async function migratePrintParameters(db) {
  console.log('[1/3] Importando perfis de parametros de impressao...');

  const printParameters = loadPrintParameters();
  const profilesCount = printParameters.profiles.length;
  const profileOperations = printParameters.profiles.map(profile => ({
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

  if (profileOperations.length > 0) {
    const result = await db
      .collection(PRINT_PARAMETERS_COLLECTION)
      .bulkWrite(profileOperations, { ordered: false });
    console.log(`✅ Perfis importados/atualizados: ${result.upsertedCount}/${profilesCount}`);
  }

}

async function clearCollections(db) {
  const printResult = await db.collection(PRINT_PARAMETERS_COLLECTION).deleteMany({});
  const suggestionsResult = await db.collection(SUGGESTIONS_COLLECTION).deleteMany({});
  console.log(`[0/3] Limpeza completa: print_parameters=${printResult.deletedCount}, suggestions=${suggestionsResult.deletedCount}`);
}

async function migrateSuggestions(db) {
  console.log('[2/3] Importando sugestoes...');

  const suggestionsFile = getSuggestionsFile();
  if (!suggestionsFile) {
    console.log('⚠️ Nenhum arquivo de sugestoes encontrado para importar.');
    return;
  }

  const raw = JSON.parse(fs.readFileSync(suggestionsFile, 'utf-8'));
  const suggestions = normalizeSuggestions(raw);

  if (suggestions.length === 0) {
    console.log('⚠️ Nenhuma sugestao encontrada para importar.');
    return;
  }

  const operations = suggestions.map(suggestion => {
    const filter = resolveSuggestionFilter(suggestion);
    const createdAt = suggestion.createdAt || suggestion.timestamp || new Date();

    return {
      updateOne: {
        filter,
        update: {
          $setOnInsert: {
            ...suggestion,
            createdAt
          }
        },
        upsert: true
      }
    };
  });

  if (operations.length > 0) {
    const result = await db.collection(SUGGESTIONS_COLLECTION).bulkWrite(operations, { ordered: false });
    console.log(`✅ Sugestoes importadas: ${result.upsertedCount}`);
  }
}

async function migrateFinalData() {
  if (!MONGODB_URI) {
    throw new Error('Defina a variavel MONGODB_URI antes de rodar a migracao.');
  }

  console.log('='.repeat(60));
  console.log('MIGRACAO FINAL DE DADOS - QUANTON3D');
  console.log('='.repeat(60));

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  try {
    await clearCollections(db);
    await migratePrintParameters(db);
    await migrateSuggestions(db);
    console.log('[3/3] Migracao concluida com sucesso.');
  } finally {
    await client.close();
  }
}

migrateFinalData().catch(error => {
  console.error('Erro na migracao final:', error.message);
  process.exit(1);
});
