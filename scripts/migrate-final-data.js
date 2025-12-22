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
const SUGGESTIONS_FILE = path.join(process.cwd(), 'knowledge', 'suggestions.json');
const PRINT_PARAMETERS_RAG_FILE = path.join(process.cwd(), 'data', 'print-parameters-rag.json');

function ensureFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo nao encontrado: ${filePath}`);
  }
}

function buildPrintParametersRAG(profiles) {
  return profiles.map(profile => {
    let text;
    if (profile.status === 'coming_soon') {
      text = `Resina ${profile.resinName} | Impressora ${profile.brand} ${profile.model}: Parâmetros em breve.`;
    } else {
      const params = profile.params || {};
      const parts = [];
      if (params.layerHeightMm != null) parts.push(`altura de camada=${params.layerHeightMm}mm`);
      if (params.baseLayers != null) parts.push(`camadas de base=${Math.round(params.baseLayers)}`);
      if (params.exposureTimeS != null) parts.push(`tempo de exposição=${params.exposureTimeS}s`);
      if (params.baseExposureTimeS != null) parts.push(`exposição base=${params.baseExposureTimeS}s`);
      if (params.uvOffDelayS != null) parts.push(`retardo UV=${params.uvOffDelayS}s`);
      if (params.restBeforeLiftS != null) parts.push(`descanso antes elevação=${params.restBeforeLiftS}s`);
      if (params.restAfterLiftS != null) parts.push(`descanso após elevação=${params.restAfterLiftS}s`);
      if (params.restAfterRetractS != null) parts.push(`descanso após retração=${params.restAfterRetractS}s`);
      if (params.uvPower != null) parts.push(`potência UV=${params.uvPower}`);
      text = `Resina ${profile.resinName} | Impressora ${profile.brand} ${profile.model}: ${parts.join(', ')}`;
    }

    return {
      id: profile.id,
      resin: profile.resinName,
      printer: `${profile.brand} ${profile.model}`,
      text,
      status: profile.status
    };
  });
}

function loadPrintParameters() {
  ensureFileExists(PRINT_PARAMETERS_FILE);
  const data = JSON.parse(fs.readFileSync(PRINT_PARAMETERS_FILE, 'utf-8'));

  if (!Array.isArray(data.profiles)) {
    throw new Error('Estrutura invalida em data/resins_extracted.json: campo profiles ausente.');
  }

  return data;
}

function loadPrintParametersRAG(profiles) {
  if (fs.existsSync(PRINT_PARAMETERS_RAG_FILE)) {
    const rag = JSON.parse(fs.readFileSync(PRINT_PARAMETERS_RAG_FILE, 'utf-8'));
    if (Array.isArray(rag) && rag.length > 0) {
      return rag;
    }
  }

  return buildPrintParametersRAG(profiles);
}

function normalizeSuggestions(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.suggestions)) return raw.suggestions;
  if (Array.isArray(raw?.data)) return raw.data;
  return [];
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
  const ragChunks = loadPrintParametersRAG(printParameters.profiles);

  printParameters.generatedAt = new Date().toISOString();
  printParameters.stats = {
    totalProfiles: profilesCount,
    totalResins: printParameters.resins?.length || 0,
    totalPrinters: printParameters.printers?.length || 0,
    okProfiles: printParameters.profiles.filter(p => p.status === 'ok').length,
    comingSoonProfiles: printParameters.profiles.filter(p => p.status === 'coming_soon').length
  };

  await db.collection(PRINT_PARAMETERS_COLLECTION).updateOne(
    { _id: 'print_parameters' },
    {
      $set: {
        data: printParameters,
        rag: ragChunks,
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );

  console.log(`✅ Perfis importados: ${profilesCount}`);
}

async function migrateSuggestions(db) {
  console.log('[2/3] Importando sugestoes...');

  ensureFileExists(SUGGESTIONS_FILE);
  const raw = JSON.parse(fs.readFileSync(SUGGESTIONS_FILE, 'utf-8'));
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
