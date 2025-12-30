// Cole este código no lugar do seu server.js atual
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Bot online!' });
});

// Respostas automáticas (SEM precisar de API paga!)
const respostasAutomaticas = {
  'ola': 'Olá! Bem-vindo à Quanton3D! Como posso ajudar?',
  'produtos': 'Temos resinas para: Action Figures, Odontologia, Engenharia, Joalheria e Uso Geral. Qual te interessa?',
  'preço': 'Nossos preços variam de R$ 150 a R$ 900. Qual produto você gostaria de saber?',
  'contato': 'Entre em contato: (31) 3271-6935 ou WhatsApp (31) 3271-6935',
  'endereço': 'Av. Dom Pedro II, 5056 - Jardim Montanhês, Belo Horizonte - MG',
  'horario': 'Atendemos de segunda a sexta, das 9h às 18h.',
  'entrega': 'Fazemos entregas para todo o Brasil via Correios!',
  'resina': 'Trabalhamos com resinas UV de alta performance. Qual aplicação você precisa? Action figures, odontologia, engenharia ou joalheria?',
  'action': 'Para action figures temos: Alchemist, FlexForm, Iron, PyroBlast, Spark e Spin. Todas com ótimo acabamento!',
  'odonto': 'Para odontologia: Athom Dental, Alinhadores, Gengiva e Washable. Todas biocompatíveis!',
  'engenharia': 'Para engenharia: Iron (ultra resistente), FlexForm (flexível) e Vulcan Cast (fundição).',
  'default': 'Desculpe, não entendi. Posso ajudar com: produtos, preços, contato, endereço ou horário. Ou ligue: (31) 3271-6935'
};

app.post('/api/chat', (req, res) => {
  try {
    const { message } = req.body;
    const msgLower = message.toLowerCase();
    
    // Procura palavra-chave na mensagem
    let resposta = respostasAutomaticas.default;
    
    for (let palavra in respostasAutomaticas) {
      if (msgLower.includes(palavra)) {
        resposta = respostasAutomaticas[palavra];
        break;
      }
    }
    
    res.json({ response: resposta });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao processar mensagem' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Bot Quanton3D rodando na porta ${PORT}`);
});
