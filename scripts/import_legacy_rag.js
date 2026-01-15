import fs from 'fs/promises';
import path from 'path';

const INPUT_PATH = path.resolve('rag-knowledge/resins_db.json');
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

async function run() {
  const raw = await fs.readFile(INPUT_PATH, 'utf8');
  const data = JSON.parse(raw);

  if (!Array.isArray(data)) {
    throw new Error('resins_db.json deve conter um array JSON.');
  }

  const blocks = data
    .map((entry) => {
      const text = entry?.text ?? '';
      if (!text) return null;
      const { resin, printer } = parseHeader(text);
      return `### ${resin} - ${printer}\n**Configurações Recomendadas:**\n${text}`;
    })
    .filter(Boolean);

  if (blocks.length === 0) {
    throw new Error('Nenhum item com campo "text" encontrado em resins_db.json.');
  }

  const content = `${blocks.join('\n\n')}\n`;
  await fs.writeFile(OUTPUT_PATH, content, 'utf8');

  console.log(`Arquivo gerado em ${OUTPUT_PATH} com ${blocks.length} entradas.`);
}

run().catch((error) => {
  console.error('Falha ao importar resins_db.json:', error);
  process.exit(1);
});
