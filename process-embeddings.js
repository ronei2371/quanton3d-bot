// Script para processar embeddings dos arquivos de conhecimento
// Cria vetores semânticos para busca RAG

import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const KNOWLEDGE_DIR = '/home/ubuntu/rag-knowledge';
const OUTPUT_FILE = '/home/ubuntu/quanton3d-bot/embeddings-database.json';

async function processEmbeddings() {
  console.log('🚀 Iniciando processamento de embeddings...\n');
  
  // Ler todos os arquivos
  const files = fs.readdirSync(KNOWLEDGE_DIR)
    .filter(f => f.endsWith('.txt'))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)[0]);
      const numB = parseInt(b.match(/\d+/)[0]);
      return numA - numB;
    });
  
  console.log(`📂 Encontrados ${files.length} arquivos de conhecimento\n`);
  
  const database = [];
  let processedCount = 0;
  
  for (const file of files) {
    const filePath = path.join(KNOWLEDGE_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Limpar conteúdo
    const cleanContent = content
      .replace(/\uFEFF/g, '') // Remove BOM
      .replace(/\s+/g, ' ') // Normaliza espaços
      .trim();
    
    if (cleanContent.length < 50) {
      console.log(`⏭️  Pulando ${file} (muito curto)`);
      continue;
    }
    
    try {
      // ✅ MUDANÇA CRÍTICA: Usar text-embedding-3-large (igual ao rag-helper.js)
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-large', // ✅ MUDADO de 3-small para 3-large
        input: cleanContent,
      });
      
      const embedding = response.data[0].embedding;
      
      database.push({
        id: file.replace('.txt', ''),
        content: cleanContent,
        embedding: embedding,
        tokens: response.usage.total_tokens
      });
      
      processedCount++;
      console.log(`✅ [${processedCount}/${files.length}] ${file} - ${response.usage.total_tokens} tokens`);
      
      // Delay para não sobrecarregar API
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`❌ Erro ao processar ${file}:`, error.message);
    }
  }
  
  // Salvar database
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(database, null, 2));
  
  console.log(`\n🎉 Processamento concluído!`);
  console.log(`📊 Total processado: ${processedCount}/${files.length} arquivos`);
  console.log(`💾 Database salvo em: ${OUTPUT_FILE}`);
  console.log(`📦 Tamanho do database: ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2)} MB`);
}

// Executar
processEmbeddings().catch(console.error);
