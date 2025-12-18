import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

// Importa todo o kb_index.json para MongoDB, adicionando tags automáticas.
// Uso:
//   node scripts/import-kb-with-tags.js [--dry-run] [--limit=200]
// Variáveis de ambiente relevantes:
//   - MONGODB_URI (opcional, possui fallback para cluster padrão)
//   - KB_INDEX_PATH (opcional, caminho customizado do kb_index.json)
//   - KB_IMPORT_COLLECTION (opcional, nome da coleção de destino, padrão "documents")

dotenv.config();

const DEFAULT_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://ronei3271_db_user:OAlRnyGskVYCCzpC@quanton3d.e7xb5h2.mongodb.net/?appName=Quanton3D';
const DB_NAME = 'quanton3d';
const COLLECTION_NAME = process.env.KB_IMPORT_COLLECTION || 'documents';
const KB_INDEX_PATH = process.env.KB_INDEX_PATH || path.join(process.cwd(), 'kb_index.json');

// Regras básicas para geração de tags contextuais.
const TAG_RULES = [
  { tag: 'resina', keywords: ['resina', 'resin', 'spin', 'alchemist', 'spark', 'iron', 'vulcancast', 'flexform', 'pyroblast'] },
  { tag: 'impressora', keywords: ['impressora', 'printer', 'lcd', 'sla', 'dlp', 'photon', 'mars', 'saturn', 'kobra', 'ender'] },
  { tag: 'parametros', keywords: ['exposi', 'layer', 'camada', 'uv', 'cura', 'lift', 'speed', 'velocidade', 'base'] },
  { tag: 'manutencao', keywords: ['limpar', 'limpeza', 'trocar', 'fep', 'lcd', 'display', 'tela', 'nivel'] },
  { tag: 'problemas', keywords: ['erro', 'falha', 'defeito', 'bolha', 'mancha', 'vaza', 'quebrar', 'suc', 'ghost', 'bleed'] },
  { tag: 'seguranca', keywords: ['mascara', 'luva', 'cheiro', 'odor', 'seguranca', 'toxico'] },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;
  return { dryRun, limit };
}

function loadKbIndex() {
  if (!fs.existsSync(KB_INDEX_PATH)) {
    throw new Error(`Arquivo kb_index.json não encontrado em ${KB_INDEX_PATH}`);
  }
  const raw = fs.readFileSync(KB_INDEX_PATH, 'utf-8');
  const parsed = JSON.parse(raw.replace(/\s+$/u, ''));
  const documents = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.documents)
      ? parsed.documents
      : Array.isArray(parsed?.data)
        ? parsed.data
        : Object.values(parsed || {}).find(Array.isArray) || null;

  if (!Array.isArray(documents)) {
    throw new Error('Formato do kb_index.json inválido: arquivo não contém um array de documentos.');
  }

  return documents;
}

function buildTags(doc) {
  const haystack = `${doc.title}\n${doc.content}`.toLowerCase();
  const tags = new Set();

  TAG_RULES.forEach(rule => {
    const matched = rule.keywords.some(keyword => haystack.includes(keyword));
    if (matched) tags.add(rule.tag);
  });

  if (doc.source) {
    const baseSource = path.dirname(doc.source).split(path.sep).pop();
    if (baseSource) {
      tags.add(baseSource);
    }
  }

  // Sempre ter pelo menos uma tag para organização.
  if (tags.size === 0) {
    tags.add('geral');
  }

  tags.add('kb-index');
  return Array.from(tags).sort();
}

function toMongoDocument(doc) {
  const now = new Date();
  return {
    legacyId: doc.id,
    title: doc.title || doc.id,
    content: doc.content,
    source: doc.source || 'kb-index',
    tags: buildTags(doc),
    embedding: doc.embedding || [],
    embeddingModel: doc.embedding_model || doc.embeddingModel || 'text-embedding-3-large',
    createdAt: now,
    updatedAt: now,
  };
}

async function importDocuments({ dryRun, limit }) {
  const kbDocs = loadKbIndex();
  const slice = typeof limit === 'number' ? kbDocs.slice(0, limit) : kbDocs;
  console.log(`Encontrados ${kbDocs.length} documentos no kb_index.json (${slice.length} serão processados).`);

  const mongoDocs = slice.map(toMongoDocument);

  if (dryRun) {
    console.log('Modo dry-run: nenhuma escrita no MongoDB. Exemplo de documento:');
    console.dir(mongoDocs[0], { depth: null });
    return { processed: mongoDocs.length, inserted: 0, updated: 0, dryRun: true };
  }

  console.log('Conectando ao MongoDB...');
  const client = new MongoClient(DEFAULT_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const collection = db.collection(COLLECTION_NAME);

  const operations = mongoDocs.map(doc => ({
    updateOne: {
      filter: { legacyId: doc.legacyId },
      update: {
        $set: { ...doc, updatedAt: new Date() },
        $setOnInsert: { createdAt: doc.createdAt },
      },
      upsert: true,
    },
  }));

  console.log(`Enviando ${operations.length} operações de upsert para a coleção ${COLLECTION_NAME}...`);
  const result = await collection.bulkWrite(operations, { ordered: false });
  await client.close();

  const inserted = result.upsertedCount || 0;
  const updated = (result.modifiedCount || 0) + (result.matchedCount || 0) - inserted;

  return { processed: mongoDocs.length, inserted, updated, dryRun: false };
}

(async () => {
  try {
    const { dryRun, limit } = parseArgs();
    const summary = await importDocuments({ dryRun, limit });
    console.log('\nResumo da importação:');
    console.log(`- Processados: ${summary.processed}`);
    console.log(`- Inseridos:  ${summary.inserted}`);
    console.log(`- Atualizados:${summary.updated}`);
    console.log(`- Dry-run:    ${summary.dryRun ? 'sim' : 'não'}`);
  } catch (error) {
    console.error('❌ Erro durante importação:', error.message);
    process.exit(1);
  }
})();
