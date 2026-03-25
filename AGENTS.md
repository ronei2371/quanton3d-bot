## Diretrizes Técnicas Atualizadas: Projeto Quanton3D (Jan 2026)

### 1. Visão Geral da Arquitetura

- **Frontend (`quanton3dia`)**: site estático em React/Vite. **Nunca** deve conter chaves secretas como `MONGODB_URI` ou `OPENAI_API_KEY`.
- **Backend (`quanton3d-bot-v2`)**: servidor Node.js que hospeda a API, conecta ao MongoDB e processa a IA.

### 2. Regras de Banco de Dados

- **Coleção de resinas**: os dados das resinas ficam na coleção MongoDB **`parametros`**.
- **Nomenclatura proibida**: não reintroduzir `print_parameters` como fonte de verdade.
- **Leitura de dados**: o endpoint `/resins` deve ler diretamente do MongoDB usando a coleção `parametros`.
- **Sem fallback local**: não usar fallback para arquivos JSON, seeds locais, ou outras fontes estáticas para atender `/resins`.

### 3. Configurações de Build e Deploy

- No Render, manter **`CI=true`**.
- Instalar dependências com **`pnpm install --no-frozen-lockfile`**.
- Quando houver atualização de código, garantir **`SKIP_INSTALL=false`**.

### 4. Integração de API e Rotas

- O frontend usa `VITE_API_URL` apontando para `https://quanton3d-bot-v2.onrender.com/api`.
- O backend deve manter compatibilidade de chat em **`/api/chat`** e **`/chat`**.
- Para rotas públicas de dados, o frontend pode remover o sufixo `/api` ao chamar endpoints como `.../resins`.

### 5. Gestão de Estado (ChatBot.jsx)

- Manter debounce para proteger o `localStorage`.
- Estados obrigatórios: `selectedImage`, `error`, `suggestionText`.

### 6. Segurança

- No backend, manter `MONGODB_URI` (com `retryWrites=true`) e `OPENAI_API_KEY`.
- No frontend, expor apenas `VITE_API_URL` e `VITE_ADMIN_API_TOKEN`.
