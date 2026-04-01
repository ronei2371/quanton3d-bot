// Script para processar embeddings LOCAIS dos arquivos de conhecimento
// Usa Xenova Transformers (modelo local, sem API)

import fs from 'fs';
import path from 'path';
import { pipeline } from '@xenova/transformers';

const KNOWLEDGE_DIR = '/home/ubuntu/rag-knowledge';
const OUTPUT_FILE = '/home/ubuntu/quanton3d-bot/embeddings-database.json';

async function processEmbeddings() {
  console.log('🚀 Iniciando processamento de embeddings LOCAIS...\n');
  console.log('📥 Carregando modelo de embeddings...');
  
  // Carregar modelo local (primeira vez baixa ~50MB, depois usa cache)
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  
  console.log('✅ Modelo carregado!\n');
  
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
      // Criar embedding LOCAL
      const output = await extractor(cleanContent, { pooling: 'mean', normalize: true });
      const embedding = Array.from(output.data);
      
      database.push({
        id: file.replace('.txt', ''),
        content: cleanContent,
        embedding: embedding
      });
      
      processedCount++;
      console.log(`✅ [${processedCount}/${files.length}] ${file} - ${embedding.length} dimensões`);
      
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
