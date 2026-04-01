// Script para adicionar conhecimento sobre LCD no MongoDB
import { connectToMongo } from './db.js';
import { addDocument } from './rag-search.js';
import fs from 'fs';

async function main() {
  try {
    console.log('🔌 Conectando ao MongoDB...');
    await connectToMongo();
    console.log('✅ Conectado!');

    // Ler o conhecimento sobre LCD
    const lcdContent = fs.readFileSync('/home/ubuntu/conhecimentos_bot/conhecimentos_texto/01_LCD_Problemas_Diagnostico_Solucao.txt', 'utf-8');
    
    console.log('\n📝 Adicionando conhecimento sobre LCD...');
    console.log(`Tamanho: ${lcdContent.length} caracteres\n`);

    const result = await addDocument(
      'LCD com manchas, pontos escuros ou defeitos visuais - Diagnóstico e solução',
      lcdContent,
      'manual'
    );

    console.log('\n✅ SUCESSO!');
    console.log(`ID do documento: ${result.documentId}`);
    console.log(`Título: ${result.title}`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERRO:', error);
    process.exit(1);
  }
}

main();
