require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors({
  origin: ['https://quanton3dia.onrender.com', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Quanton3D ChatBot'
  });
});

// Rota principal de chat
app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Mensagem é obrigatória' });
    }

    // Verifica se a API key está configurada
    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ 
        error: 'Chave de API não configurada',
        details: 'Configure OPENAI_API_KEY ou ANTHROPIC_API_KEY nas variáveis de ambiente'
      });
    }

    console.log('📨 Mensagem recebida:', message);

    // Contexto sobre a Quanton3D
    const systemPrompt = `Você é um assistente virtual especializado da Quanton3D, empresa brasileira de resinas UV de alta performance para impressão 3D.

INFORMAÇÕES DA EMPRESA:
- Nome: Quanton3D
- Localização: Av. Dom Pedro II, 5056 - Jardim Montanhês, Belo Horizonte - MG
- Telefone: (31) 3271-6935
- WhatsApp: (31) 3271-6935
- Site: https://quanton3d.com.br

LINHAS DE PRODUTOS:

1. ACTION FIGURES:
   - Alchemist: Efeitos especiais translúcidos
   - FlexForm: Flexível, resistente à abrasão
   - Iron: Ultra resistente, alta dureza
   - 70/30: Miniaturas detalhadas
   - RPG: Miniaturas de RPG
   - Poseidon: Grandes formatos
   - PyroBlast: Alta velocidade de cura
   - Spark: Lavável em água
   - Spin: Versatilidade geral

2. ODONTOLOGIA:
   - Alinhadores: Para alinhadores dentários
   - Dental: Modelos dentais precisos
   - Gengiva: Simulação de gengiva
   - Washable: Lavável em água

3. ENGENHARIA:
   - FlexForm: Protótipos flexíveis
   - Iron: Peças resistentes
   - 70/30: Precisão dimensional
   - RPG: Detalhamento fino
   - Vulcan Cast: Fundição (até 250°C)

4. JOALHERIA:
   - Vulcan Cast: Fundição de joias (até 250°C)

5. USO GERAL:
   - Alchemist: Translúcida versátil
   - Low Smell: Baixo odor
   - Poseidon: Grandes formatos
   - PyroBlast: Cura rápida
   - Spare: Econômica
   - Spare Washable: Econômica lavável
   - Spark: Versátil lavável
   - Spin: Uso geral

COMPATIBILIDADE:
- Todas as resinas são compatíveis com impressoras DLP e LCD
- Comprimento de onda: 395-405nm

INSTRUÇÕES:
- Seja cordial e prestativo
- Responda em português brasileiro
- Seja específico e técnico quando necessário
- Ofereça sugestões de produtos adequados
- Se não souber, seja honesto e sugira contato direto
- Sempre forneça os contatos da empresa quando relevante`;

    // Prepara mensagens para a API
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: message }
    ];

    let responseText = '';

    // Tenta usar a API da Anthropic (Claude)
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const response = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1024,
            messages: messages.filter(m => m.role !== 'system'),
            system: systemPrompt
          },
          {
            headers: {
              'x-api-key': process.env.ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json'
            }
          }
        );

        responseText = response.data.content[0].text;
        console.log('✅ Resposta gerada com Claude');
      } catch (claudeError) {
        console.error('❌ Erro ao usar Claude:', claudeError.message);
        throw claudeError;
      }
    } 
    // Fallback para OpenAI
    else if (process.env.OPENAI_API_KEY) {
      try {
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-4',
            messages: messages,
            max_tokens: 1000,
            temperature: 0.7
          },
          {
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        responseText = response.data.choices[0].message.content;
        console.log('✅ Resposta gerada com GPT-4');
      } catch (openaiError) {
        console.error('❌ Erro ao usar OpenAI:', openaiError.message);
        throw openaiError;
      }
    }

    res.json({ 
      response: responseText,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erro no chat:', error.message);
    
    // Resposta de erro mais amigável
    res.status(500).json({ 
      error: 'Erro ao processar mensagem',
      details: error.message,
      fallback: 'Desculpe, tive um problema ao processar sua mensagem. Por favor, entre em contato diretamente: (31) 3271-6935'
    });
  }
});

// Rota para informações de produtos
app.get('/api/products', (req, res) => {
  res.json({
    categories: [
      {
        name: 'Action Figures',
        products: ['Alchemist', 'FlexForm', 'Iron', '70/30', 'RPG', 'Poseidon', 'PyroBlast', 'Spark', 'Spin']
      },
      {
        name: 'Odontologia',
        products: ['Alinhadores', 'Dental', 'Gengiva', 'Washable']
      },
      {
        name: 'Engenharia',
        products: ['FlexForm', 'Iron', '70/30', 'RPG', 'Vulcan Cast']
      },
      {
        name: 'Joalheria',
        products: ['Vulcan Cast']
      },
      {
        name: 'Uso Geral',
        products: ['Alchemist', 'Low Smell', 'Poseidon', 'PyroBlast', 'Spare', 'Spare Washable', 'Spark', 'Spin']
      }
    ]
  });
});

// Tratamento de erros
app.use((err, req, res, next) => {
  console.error('❌ Erro não tratado:', err);
  res.status(500).json({ 
    error: 'Erro interno do servidor',
    message: err.message 
  });
});

// Inicia o servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`💬 API Chat: http://localhost:${PORT}/api/chat`);
  console.log(`📦 Produtos: http://localhost:${PORT}/api/products`);
  console.log(`
  ╔════════════════════════════════════╗
  ║   Quanton3D ChatBot IA Online   ║
  ╚════════════════════════════════════╝
  `);
});
