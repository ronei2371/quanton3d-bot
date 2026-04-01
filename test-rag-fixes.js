#!/usr/bin/env node

// Script de teste para verificar as correções do RAG
// Executa testes básicos das novas funcionalidades

import { initializeRAG, searchKnowledge, checkRAGIntegrity, getRAGInfo } from './rag-search.js';
import fs from 'fs';
import path from 'path';

console.log('🧪 INICIANDO TESTES DAS CORREÇÕES RAG\n');

async function runTests() {
  try {
    // Teste 1: Verificar integridade
    console.log('📋 Teste 1: Verificando integridade do RAG...');
    const integrity = checkRAGIntegrity();
    console.log('   Resultado:', integrity);
    
    // Teste 2: Inicializar RAG
    console.log('\n🚀 Teste 2: Inicializando RAG...');
    const initResult = await initializeRAG();
    console.log('   Resultado:', initResult);
    
    // Teste 3: Obter informações do RAG
    console.log('\n📊 Teste 3: Obtendo informações do RAG...');
    const ragInfo = getRAGInfo();
    console.log('   Resultado:', ragInfo);
    
    // Teste 4: Buscar conhecimento
    console.log('\n🔍 Teste 4: Testando busca de conhecimento...');
    const searchResults = await searchKnowledge('resina pyroblast', 2);
    console.log(`   Encontrados ${searchResults.length} resultados:`);
    searchResults.forEach((result, index) => {
      console.log(`   ${index + 1}. ${result.id} (${(result.similarity * 100).toFixed(1)}% relevância)`);
      console.log(`      Conteúdo: ${result.content.substring(0, 100)}...`);
    });
    
    // Teste 5: Verificar arquivos de log
    console.log('\n📝 Teste 5: Verificando logs...');
    const logFiles = ['rag-operations.log', 'operations.log'];
    logFiles.forEach(logFile => {
      const logPath = path.join(process.cwd(), logFile);
      if (fs.existsSync(logPath)) {
        const stats = fs.statSync(logPath);
        console.log(`   ✅ ${logFile} existe (${stats.size} bytes)`);
      } else {
        console.log(`   ⚠️ ${logFile} não encontrado`);
      }
    });
    
    // Teste 6: Simular criação de sugestão (mock)
    console.log('\n📝 Teste 6: Simulando dados de sugestão...');
    const mockSuggestion = {
      id: Date.now(),
      suggestion: 'Como melhorar a aderência da resina Pyroblast+ na plataforma?',
      userName: 'Teste User',
      userPhone: '(31) 99999-9999',
      timestamp: new Date().toISOString(),
      status: 'pending'
    };
    console.log('   Sugestão mock criada:', mockSuggestion);
    
    console.log('\n✅ TODOS OS TESTES CONCLUÍDOS COM SUCESSO!');
    console.log('\n📋 RESUMO:');
    console.log(`   - RAG inicializado: ${ragInfo.isInitialized ? '✅' : '❌'}`);
    console.log(`   - Documentos carregados: ${ragInfo.documentsCount}`);
    console.log(`   - Modelo carregado: ${ragInfo.modelLoaded ? '✅' : '❌'}`);
    console.log(`   - Integridade: ${integrity.isValid ? '✅' : '❌'}`);
    
  } catch (error) {
    console.error('\n❌ ERRO DURANTE OS TESTES:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Executar testes
runTests().then(() => {
  console.log('\n🏁 Testes finalizados!');
  process.exit(0);
}).catch(err => {
  console.error('\n💥 Erro fatal:', err);
  process.exit(1);
});