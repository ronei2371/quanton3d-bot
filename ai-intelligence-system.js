// 🧠 SISTEMA DE INTELIGÊNCIA AVANÇADA PARA QUANTON3D BOT
// Implementa funcionalidades avançadas de IA para tornar o bot mais inteligente
// ✅ VERSÃO CORRIGIDA: Aprendizado salvo no MongoDB (não em arquivos locais)

import { searchKnowledge } from './rag-search.js';
import { getLearningCollection } from './db.js';

// ===== SISTEMA DE ANÁLISE DE CONTEXTO =====

// Detectar tipo de pergunta
export function analyzeQuestionType(message) {
  const lowerMessage = message.toLowerCase();
  
  const questionTypes = {
    // Problemas técnicos
    troubleshooting: [
      'problema', 'erro', 'não funciona', 'falha', 'defeito', 'rachando', 'quebrando',
      'não gruda', 'não adere', 'não cura', 'pegajoso', 'mole', 'frágil', 'bolhas',
      'camadas', 'suporte', 'warping', 'elephant foot', 'stringing'
    ],
    
    // Parâmetros de impressão
    parameters: [
      'tempo', 'exposição', 'layer', 'camada', 'velocidade', 'temperatura',
      'configuração', 'parâmetro', 'setting', 'calibração', 'perfil',
      'ms', 'segundos de base', 'exposure'
    ],
    
    // Produtos e resinas
    product: [
      'resina', 'pyroblast', 'iron', 'spin', 'spark', 'alchemist', 'flexform',
      'poseidon', 'lowsmell', 'castable', 'athom', 'vulcan', 'produto', 'qual resina',
      'abs like', 'abs-like', 'dental', 'bio', 'eco', 'lavavel', 'lavável'
    ],
    
    // Processo e técnicas
    process: [
      'como fazer', 'como imprimir', 'passo a passo', 'tutorial', 'processo',
      'técnica', 'método', 'procedimento', 'workflow'
    ],
    
    // Pós-processamento
    postProcessing: [
      'limpeza', 'cura', 'pós-cura', 'uv', 'álcool', 'ipa', 'acabamento',
      'lixar', 'polir', 'pintar', 'primer'
    ],
    
    // Comparações
    comparison: [
      'melhor', 'diferença', 'comparar', 'versus', 'vs', 'qual escolher',
      'recomenda', 'indicação'
    ],
    
    // Segurança
    safety: [
      'segurança', 'tóxico', 'fispq', 'epi', 'ventilação', 'luva', 'máscara',
      'proteção', 'descarte', 'meio ambiente'
    ]
  };
  
  const detectedTypes = [];
  
  for (const [type, keywords] of Object.entries(questionTypes)) {
    const matches = keywords.filter(keyword => lowerMessage.includes(keyword));
    if (matches.length > 0) {
      detectedTypes.push({
        type,
        confidence: matches.length / keywords.length,
        matchedKeywords: matches
      });
    }
  }
  
  // Ordenar por confiança
  detectedTypes.sort((a, b) => b.confidence - a.confidence);
  
  return detectedTypes.length > 0 ? detectedTypes[0] : { type: 'general', confidence: 0 };
}

// ===== SISTEMA DE DETECÇÃO DE ENTIDADES =====

export function extractEntities(message) {
  const entities = {
    resins: [],
    printers: [],
    problems: [],
    parameters: []
  };
  
  const lowerMessage = message.toLowerCase();
  
  // Detectar resinas mencionadas
  const resinPatterns = {
    'Pyroblast+': ['pyroblast', 'pyro blast', 'pyro'],
    'Iron 7030': ['iron', 'iron 7030', '7030'],
    'Spin+': ['spin', 'spin+'],
    'Spark': ['spark'],
    'Alchemist': ['alchemist', 'alquimista'],
    'FlexForm': ['flexform', 'flex form', 'flex'],
    'Poseidon': ['poseidon'],
    'LowSmell': ['lowsmell', 'low smell', 'baixo odor'],
    'Castable': ['castable', 'fundição'],
    'Athom': ['athom'],
    'Vulcan': ['vulcan'],
    'ABS-like': ['abs like', 'abs-like', 'abslike'],
    'Dental': ['dental', 'odontologica', 'odontológica'],
    'Bio': ['bio', 'biocompatível', 'biocompatível'],
    'Eco Washable': ['lavavel', 'lavável', 'washable', 'water washable']
  };
  
  for (const [resin, patterns] of Object.entries(resinPatterns)) {
    if (patterns.some(pattern => lowerMessage.includes(pattern))) {
      entities.resins.push(resin);
    }
  }
  
  // Detectar impressoras mencionadas
  const printerPatterns = [
    'elegoo', 'mars', 'saturn', 'jupiter',
    'anycubic', 'photon', 'mono',
    'creality', 'halot',
    'phrozen', 'sonic', 'mighty', 'mini 4k',
    'epax', 'nova3d', 'wanhao', 'longer'
  ];
  
  printerPatterns.forEach(printer => {
    if (lowerMessage.includes(printer)) {
      entities.printers.push(printer);
    }
  });
  
  // Detectar problemas específicos
  const problemPatterns = {
    'Não adere à base': ['não gruda', 'não adere', 'solta da base'],
    'Peças rachando': ['rachando', 'quebrando', 'frágil', 'delaminando', 'delaminação'],
    'Subcura': ['mole', 'pegajoso', 'não curou', 'meia cura', 'sub cura'],
    'Sobrecura': ['queimado', 'amarelado', 'ressecado'],
    'Bolhas': ['bolhas', 'bolha', 'ar'],
    'Camadas visíveis': ['camadas', 'linhas', 'layer'],
    'Suportes': ['suporte', 'support', 'sustentação'],
    'Descolamento em camadas': ['delaminando', 'separando camadas', 'descolando camada'],
    'Artefatos de luz': ['listras', 'banding', 'faixas de luz', 'luz vazando']
  };
  
  for (const [problem, patterns] of Object.entries(problemPatterns)) {
    if (patterns.some(pattern => lowerMessage.includes(pattern))) {
      entities.problems.push(problem);
    }
  }
  
  return entities;
}

// ===== SISTEMA DE GERAÇÃO DE CONTEXTO INTELIGENTE =====

export async function generateIntelligentContext(message, questionType, entities, conversationHistory) {
  let contextPrompt = '';
  
  // Contexto baseado no tipo de pergunta
  switch (questionType.type) {
    case 'troubleshooting':
      contextPrompt += `
MODO DIAGNÓSTICO ATIVADO:
- Analise o problema descrito
- Identifique possíveis causas
- Forneça soluções práticas e testadas
- Sugira parâmetros específicos se necessário
- Mencione se é problema comum e como prevenir`;
      break;
      
    case 'parameters':
      contextPrompt += `
MODO CONFIGURAÇÃO ATIVADA:
- Forneça parâmetros específicos para a resina mencionada
- Inclua tempo de exposição, altura de camada, velocidade
- Mencione diferenças entre impressoras se relevante
- Sugira arquivo de calibração se necessário`;
      break;
      
    case 'product':
      contextPrompt += `
MODO CONSULTORIA DE PRODUTO:
- Compare características das resinas
- Explique aplicações ideais
- Mencione vantagens e limitações
- Sugira a melhor opção para o uso específico`;
      break;
      
    case 'safety':
      contextPrompt += `
MODO SEGURANÇA PRIORITÁRIA:
- Enfatize uso de EPIs obrigatórios
- Mencione FISPQ quando relevante
- Explique descarte correto
- Alerte sobre riscos específicos`;
      break;
  }
  
  // Contexto baseado em entidades detectadas
  if (entities.resins.length > 0) {
    contextPrompt += `\n\nRESINAS MENCIONADAS: ${entities.resins.join(', ')}`;
    contextPrompt += `\nForneça informações específicas sobre estas resinas.`;
  }
  
  if (entities.printers.length > 0) {
    contextPrompt += `\n\nIMPRESSOTRAS MENCIONADAS: ${entities.printers.join(', ')}`;
    contextPrompt += `\nConsidere as características específicas destas impressoras.`;
  }
  
  if (entities.problems.length > 0) {
    contextPrompt += `\n\nPROBLEMAS IDENTIFICADOS: ${entities.problems.join(', ')}`;
    contextPrompt += `\nFoque em soluções para estes problemas específicos.`;
  }
  
  return contextPrompt;
}

// ===== SISTEMA DE APRENDIZADO CONTÍNUO (MONGODB) =====

export async function learnFromConversation(message, reply, entities, questionType) {
  const learningData = {
    timestamp: new Date(),
    message,
    reply,
    entities,
    questionType,
    messageLength: message.length,
    replyLength: reply.length,
    entitiesCount: Object.values(entities).flat().length
  };
  
  // ✅ CORRIGIDO: Salvar no MongoDB ao invés de arquivo local
  try {
    const learningCollection = getLearningCollection();
    await learningCollection.insertOne(learningData);
    
    // Manter apenas os últimos 1000 registros
    const count = await learningCollection.countDocuments();
    if (count > 1000) {
      const oldest = await learningCollection
        .find()
        .sort({ timestamp: 1 })
        .limit(count - 1000)
        .toArray();
      
      const oldestIds = oldest.map(doc => doc._id);
      await learningCollection.deleteMany({ _id: { $in: oldestIds } });
      
      console.log(`🧹 Aprendizado: ${count - 1000} registros antigos removidos`);
    }
    
    console.log('✅ Dados de aprendizado salvos no MongoDB');
  } catch (err) {
    console.error('❌ Erro ao salvar dados de aprendizado no MongoDB:', err);
    // Não bloquear o fluxo se der erro no aprendizado
  }
}

// ===== SISTEMA DE SUGESTÕES INTELIGENTES =====

export function generateSmartSuggestions(message, entities, questionType) {
  const suggestions = [];
  
  // Sugestões baseadas no tipo de pergunta
  if (questionType.type === 'troubleshooting' && entities.problems.length === 0) {
    suggestions.push("Para um diagnóstico mais preciso, você poderia descrever exatamente o que está acontecendo com suas impressões?");
  }
  
  if (questionType.type === 'parameters' && entities.resins.length === 0) {
    suggestions.push("Qual resina Quanton3D você está usando? Isso me ajudará a fornecer parâmetros mais precisos.");
  }
  
  if (questionType.type === 'parameters' && entities.printers.length === 0) {
    suggestions.push("Qual modelo de impressora você está usando? Os parâmetros podem variar entre diferentes impressoras.");
  }
  
  // Sugestões proativas
  if (entities.resins.includes('Pyroblast+')) {
    suggestions.push("Lembre-se: Pyroblast+ requer pós-cura obrigatória a 60°C para atingir suas propriedades máximas.");
  }
  
  if (entities.problems.includes('Não adere à base')) {
    suggestions.push("Você já tentou aumentar o tempo de exposição das primeiras camadas? Geralmente 40-60s resolve problemas de aderência.");
  }
  
  return suggestions;
}

// ===== SISTEMA DE ANÁLISE DE SENTIMENTO =====

export function analyzeSentiment(message) {
  const positiveWords = ['obrigado', 'excelente', 'perfeito', 'ótimo', 'bom', 'funcionou', 'resolveu'];
  const negativeWords = ['problema', 'erro', 'ruim', 'péssimo', 'não funciona', 'frustrado', 'difícil'];
  const urgentWords = ['urgente', 'rápido', 'emergência', 'prazo', 'hoje', 'agora'];
  
  const lowerMessage = message.toLowerCase();
  
  let sentiment = 'neutral';
  let urgency = 'normal';
  
  const positiveCount = positiveWords.filter(word => lowerMessage.includes(word)).length;
  const negativeCount = negativeWords.filter(word => lowerMessage.includes(word)).length;
  const urgentCount = urgentWords.filter(word => lowerMessage.includes(word)).length;
  
  if (positiveCount > negativeCount) {
    sentiment = 'positive';
  } else if (negativeCount > positiveCount) {
    sentiment = 'negative';
  }
  
  if (urgentCount > 0) {
    urgency = 'high';
  }
  
  return { sentiment, urgency, positiveCount, negativeCount, urgentCount };
}

// ===== SISTEMA DE PERSONALIZAÇÃO =====

export function personalizeResponse(userName, conversationHistory, sentiment) {
  let personalization = '';
  
  // Personalização baseada no histórico
  if (conversationHistory && conversationHistory.length > 0) {
    const previousMessages = conversationHistory.filter(msg => msg.role === 'user');
    if (previousMessages.length > 3) {
      personalization += "Vejo que você tem usado bastante nosso suporte técnico. ";
    }
  }
  
  // Personalização baseada no sentimento
  if (sentiment.sentiment === 'negative') {
    personalization += "Entendo sua frustração, vou fazer o possível para resolver rapidamente. ";
  } else if (sentiment.sentiment === 'positive') {
    personalization += "Fico feliz em saber que está tendo uma boa experiência! ";
  }
  
  // Personalização para usuários específicos
  if (userName && userName.toLowerCase().includes('ronei')) {
    personalization += "Ronei, como sempre, vou dar o meu melhor para te ajudar! ";
  }
  
  return personalization;
}

// ===== SISTEMA DE MÉTRICAS DE INTELIGÊNCIA =====

export function calculateIntelligenceMetrics(message, reply, entities, questionType, relevantKnowledge) {
  return {
    contextRelevance: relevantKnowledge.length > 0 ? relevantKnowledge[0].similarity : 0,
    entityDetection: Object.values(entities).flat().length,
    questionClassification: questionType.confidence,
    responseLength: reply.length,
    knowledgeUsage: relevantKnowledge.length,
    timestamp: new Date().toISOString()
  };
}

// ===== EXPORTAÇÕES =====

export default {
  analyzeQuestionType,
  extractEntities,
  generateIntelligentContext,
  learnFromConversation,
  generateSmartSuggestions,
  analyzeSentiment,
  personalizeResponse,
  calculateIntelligenceMetrics
};
