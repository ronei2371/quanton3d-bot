Diretrizes Técnicas Atualizadas: Projeto Quanton3D (Jan 2026)

1. Visão Geral da Arquitetura

Frontend (quanton3dia): Site estático em React/Vite. NUNCA deve conter chaves secretas (MONGODB_URI ou OPENAI_API_KEY).

Backend (quanton3d-bot-v2): Servidor Node.js que hospeda a API, conecta no MongoDB e processa a IA.

2. Regras de Banco de Dados (CRÍTICO - NOVO)

Coleção de Resinas: Os dados das 459 resinas estão armazenados na coleção do MongoDB chamada parametros (e NÃO print_parameters).

Leitura de Dados: O endpoint /resins deve ler diretamente do MongoDB usando db.collection('parametros'). Não use fallback para arquivos JSON locais para evitar dados desatualizados.

Pasta de dados local: qualquer JSON em /data (ex: resins_extracted.json) serve apenas para migração/backup. Não é a fonte de verdade das resinas.

3. Configurações de Build e Deploy

Variável CI: Sempre definir CI=true no Render.

Dependências: Usar pnpm install --no-frozen-lockfile.

Instalação no Render: Garantir que a variável SKIP_INSTALL esteja como false quando houver atualizações de código.

4. Integração de API e Rotas

Base URL: O frontend usa VITE_API_URL apontando para https://quanton3d-bot-v2.onrender.com/api.

Compatibilidade: O Backend deve servir rotas tanto em /api/chat quanto na raiz /chat para evitar erros de CORS ou 404.

Rota de Resinas: O Frontend remove o sufixo /api ao chamar rotas públicas de dados (ex: busca em ...onrender.com/resins).

5. Gestão de Estado (ChatBot.jsx)

Manter sistema de debounce para proteger o localStorage.

Estados obrigatórios: selectedImage, error, suggestionText.

6. Segurança

Backend (v2): Deve conter MONGODB_URI (com a flag retryWrites=true) e OPENAI_API_KEY.

Frontend: Apenas VITE_API_URL e VITE_ADMIN_API_TOKEN.
