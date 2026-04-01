// ====================================================================
// SCRIPT DE CORREÇÃO #2: GERAR EMBEDDINGS PARA KB_INDEX.JSON
// ====================================================================

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../');

const EMBEDDING_MODEL = 'text-embedding-3-large';
const KB_PATH = path.join(rootDir, 'kb_index.json');
const KB_BACKUP_PATH = path.join(rootDir, 'kb_index.backup.json');

async function generateEmbedding(text, client) {
  try {
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });
    return response.data[0].embedding;
  } catch (err) {
    console.error(`Erro ao gerar embedding: ${err.message}`);
    throw err;
  }
}

async function main() {
  console.log('Iniciando geracao de embeddings para kb_index.json...\n');

  // Verificar API Key
  if (!process.env.OPENAI_API_KEY) {
    console.error('ERRO: OPENAI_API_KEY nao configurada!');
    console.error('Configure no arquivo .env: OPENAI_API_KEY=sk-...');
    process.exit(1);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Carregar kb_index.json
  console.log(`Carregando ${KB_PATH}...`);
  let kbContent;
  try {
    kbContent = await fs.readFile(KB_PATH, 'utf-8');
  } catch (err) {
    console.error(`ERRO: Nao foi possivel ler ${KB_PATH}: ${err.message}`);
    process.exit(1);
  }
  
  const kb = JSON.parse(kbContent);

  if (!kb.documents || !Array.isArray(kb.documents)) {
    console.error('ERRO: kb_index.json nao contem array "documents"');
    process.exit(1);
  }

  console.log(`Encontrados ${kb.documents.length} documentos\n`);

  // Backup
  console.log(`Criando backup em ${KB_BACKUP_PATH}...`);
  await fs.writeFile(KB_BACKUP_PATH, kbContent);
  console.log('Backup criado!\n');

  // Processar cada documento
  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < kb.documents.length; i++) {
    const doc = kb.documents[i];
    const docNum = `[${i + 1}/${kb.documents.length}]`;

    // Verificar se ja tem embedding valido
    if (Array.isArray(doc.embedding) && doc.embedding.length > 0) {
      console.log(`${docNum} SKIP: "${doc.title?.substring(0, 50)}..." (ja tem embedding)`);
      skipped++;
      continue;
    }

    // Gerar embedding
    try {
      console.log(`${docNum} Gerando embedding para: "${doc.title?.substring(0, 50)}..."...`);
      
      const textToEmbed = doc.content || doc.title || '';
      if (!textToEmbed.trim()) {
        console.log(`${docNum} WARN: Documento vazio, pulando...`);
        skipped++;
        continue;
      }

      const embedding = await generateEmbedding(textToEmbed, client);
      
      doc.embedding = embedding;
      doc.embedding_model = EMBEDDING_MODEL;
      
      console.log(`${docNum} Embedding gerado! (${embedding.length} dimensoes)\n`);
      processed++;

      // Rate limit: aguardar 200ms entre requisicoes
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (err) {
      console.error(`${docNum} ERRO ao processar "${doc.title?.substring(0, 50)}...": ${err.message}\n`);
      errors++;
    }
  }

  // Salvar arquivo atualizado
  console.log('\nSalvando kb_index.json atualizado...');
  await fs.writeFile(
    KB_PATH,
    JSON.stringify(kb, null, 2),
    'utf-8'
  );

  // Relatorio final
  console.log('\n' + '='.repeat(60));
  console.log('RELATORIO FINAL');
  console.log('='.repeat(60));
  console.log(`Embeddings gerados: ${processed}`);
  console.log(`Documentos pulados: ${skipped}`);
  console.log(`Erros: ${errors}`);
  console.log(`Arquivo salvo: ${KB_PATH}`);
  console.log(`Backup em: ${KB_BACKUP_PATH}`);
  console.log('='.repeat(60));

  if (errors > 0) {
    console.log('\nAlguns documentos falharam. Verifique os erros acima.');
    process.exit(1);
  } else {
    console.log('\nTodos os embeddings foram gerados com sucesso!');
    console.log('Proximo passo: Importar para MongoDB com POST /admin/knowledge/import');
  }
}

main().catch(err => {
  console.error('\nERRO FATAL:', err);
  process.exit(1);
});
