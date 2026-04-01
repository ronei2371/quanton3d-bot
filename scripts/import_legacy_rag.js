import fs from 'fs/promises';
import path from 'path';

const INPUT_PATH = path.resolve('rag-knowledge/resins_db.json');
const PARTS_DIR = path.resolve('rag-knowledge/resins_db_parts');
const OUTPUT_PATH = path.resolve('rag-knowledge/TABELA_COMPLETA.md');

function parseHeader(text) {
  if (typeof text !== 'string') {
    return { resin: 'Desconhecida', printer: 'Desconhecida' };
  }

  const match = text.match(/Resina\s*([^|:]+)\s*\|\s*Impressora\s*([^:]+)\s*:/i);
  if (match) {
    return { resin: match[1].trim(), printer: match[2].trim() };
  }

  const [left] = text.split(':');
  if (left) {
    const parts = left.split('|').map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { resin: parts[0], printer: parts[1] };
    }
    if (parts.length === 1) {
      return { resin: parts[0], printer: 'Desconhecida' };
    }
  }

  return { resin: 'Desconhecida', printer: 'Desconhecida' };
}

function normalizeEntries(payload, sourceLabel) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && Array.isArray(payload.items)) {
    return payload.items;
  }
  if (payload && Array.isArray(payload.data)) {
    return payload.data;
  }
  throw new Error(`Arquivo ${sourceLabel} deve conter um array JSON ou { items: [] }.`);
}

async function loadEntries() {
  const entries = [];

  try {
    const raw = await fs.readFile(INPUT_PATH, 'utf8');
    const payload = JSON.parse(raw);
    entries.push(...normalizeEntries(payload, 'resins_db.json'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  try {
    const files = await fs.readdir(PARTS_DIR);
    const jsonFiles = files.filter((name) => name.endsWith('.json')).sort();
    for (const filename of jsonFiles) {
      const raw = await fs.readFile(path.join(PARTS_DIR, filename), 'utf8');
      const payload = JSON.parse(raw);
      entries.push(...normalizeEntries(payload, filename));
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  if (entries.length === 0) {
    throw new Error('Nenhuma entrada encontrada em resins_db.json ou resins_db_parts/*.json.');
  }

  return entries;
}

async function run() {
  const data = await loadEntries();

  const seenTexts = new Set();
  const blocks = data
    .map((entry) => {
      const text = entry?.text ?? '';
      if (!text) return null;
      if (seenTexts.has(text)) {
        return null;
      }
      seenTexts.add(text);
      const { resin, printer } = parseHeader(text);
      return `### ${resin} - ${printer}\n**Configurações Recomendadas:**\n${text}`;
    })
    .filter(Boolean);

  if (blocks.length === 0) {
    throw new Error('Nenhum item com campo "text" encontrado nos arquivos de entrada.');
  }

  const content = `${blocks.join('\n\n')}\n`;
  await fs.writeFile(OUTPUT_PATH, content, 'utf8');

  const skippedDuplicates = data.length - seenTexts.size;
  const duplicateInfo = skippedDuplicates > 0 ? ` (${skippedDuplicates} duplicadas ignoradas)` : '';
  console.log(`Arquivo gerado em ${OUTPUT_PATH} com ${blocks.length} entradas.${duplicateInfo}`);
}

run().catch((error) => {
  console.error('Falha ao importar resins_db.json:', error);
  process.exit(1);
});
