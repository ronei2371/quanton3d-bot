// Script para migrar arquivos de conhecimento para MongoDB
// Processa todos os .txt em rag-knowledge e insere na colecao documents
// Usa text-embedding-3-large da OpenAI para gerar embeddings

import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

// Configuracoes
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ronei3271_db_user:OAlRnyGskVYCCzpC@quanton3d.e7xb5h2.mongodb.net/?appName=Quanton3D';
const DB_NAME = 'quanton3d';
const COLLECTION_NAME = 'documents';
const KNOWLEDGE_DIR = path.join(process.cwd(), 'rag-knowledge');
const EMBEDDING_MODEL = 'text-embedding-3-large';

// Cliente OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function migrateToMongoDB() {
  console.log('='.repeat(60));
  console.log('MIGRACAO DE CONHECIMENTO PARA MONGODB');
  console.log('='.repeat(60));
  console.log(`Modelo de embeddings: ${EMBEDDING_MODEL}`);
  console.log(`Diretorio de conhecimento: ${KNOWLEDGE_DIR}`);
  console.log('');

  // Conectar ao MongoDB
  console.log('[1/5] Conectando ao MongoDB...');
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const collection = db.collection(COLLECTION_NAME);
  console.log('Conectado com sucesso!');

  // Verificar documentos existentes
  const existingCount = await collection.countDocuments();
  console.log(`Documentos existentes na colecao: ${existingCount}`);

  // Listar arquivos .txt
  console.log('\n[2/5] Listando arquivos de conhecimento...');
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    console.error(`ERRO: Diretorio nao encontrado: ${KNOWLEDGE_DIR}`);
    await client.close();
    process.exit(1);
  }

  const files = fs.readdirSync(KNOWLEDGE_DIR)
    .filter(f => f.endsWith('.txt'))
    .sort();

  console.log(`Encontrados ${files.length} arquivos .txt`);

  if (files.length === 0) {
    console.log('Nenhum arquivo para processar.');
    await client.close();
    return;
  }

  // Verificar quais arquivos ja foram migrados
  console.log('\n[3/5] Verificando arquivos ja migrados...');
  const existingDocs = await collection.find({}, { projection: { title: 1 } }).toArray();
  const existingTitles = new Set(existingDocs.map(d => d.title));

  const filesToProcess = files.filter(f => !existingTitles.has(f));
  console.log(`Arquivos ja migrados: ${files.length - filesToProcess.length}`);
  console.log(`Arquivos para processar: ${filesToProcess.length}`);

  if (filesToProcess.length === 0) {
    console.log('\nTodos os arquivos ja foram migrados!');
    await client.close();
    return;
  }

  // Processar arquivos
  console.log('\n[4/5] Processando arquivos e gerando embeddings...');
  let successCount = 0;
  let errorCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < filesToProcess.length; i++) {
    const file = filesToProcess[i];
    const filePath = path.join(KNOWLEDGE_DIR, file);

    try {
      // Ler conteudo
      const content = fs.readFileSync(filePath, 'utf-8')
        .replace(/\uFEFF/g, '') // Remove BOM
        .replace(/\s+/g, ' ')   // Normaliza espacos
        .trim();

      if (content.length < 50) {
        console.log(`[${i + 1}/${filesToProcess.length}] PULANDO ${file} (muito curto: ${content.length} chars)`);
        continue;
      }

      // Gerar embedding
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: content,
      });

      const embedding = response.data[0].embedding;

      // Inserir no MongoDB
      await collection.insertOne({
        title: file,
        content: content,
        source: 'rag-knowledge',
        embedding: embedding,
        embeddingModel: EMBEDDING_MODEL,
        tokens: response.usage.total_tokens,
        contentLength: content.length,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      successCount++;
      console.log(`[${i + 1}/${filesToProcess.length}] OK: ${file} (${response.usage.total_tokens} tokens)`);

      // Delay para nao sobrecarregar API
      if (i < filesToProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

    } catch (err) {
      errorCount++;
      console.error(`[${i + 1}/${filesToProcess.length}] ERRO: ${file} - ${err.message}`);
    }
  }

  // Resumo
  const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n[5/5] Migracao concluida!');
  console.log('='.repeat(60));
  console.log(`Tempo de processamento: ${processingTime}s`);
  console.log(`Arquivos processados com sucesso: ${successCount}`);
  console.log(`Arquivos com erro: ${errorCount}`);

  // Contar total final
  const finalCount = await collection.countDocuments();
  console.log(`Total de documentos na colecao: ${finalCount}`);
  console.log('='.repeat(60));

  await client.close();
  console.log('\nConexao fechada. Migracao finalizada!');
}

// Executar
migrateToMongoDB().catch(err => {
  console.error('Erro fatal na migracao:', err);
  process.exit(1);
});
