# Diretrizes Técnicas Atualizadas: Projeto Quanton3D (Jan 2026)

Documento de referência consolidado para evitar regressões e ambiguidades ao configurar ou evoluir o projeto.

## 1. Visão Geral da Arquitetura

- **Frontend (`quanton3dia`)**: site estático em React/Vite. **Nunca** deve conter chaves secretas (`MONGODB_URI` ou `OPENAI_API_KEY`).
- **Backend (`quanton3d-bot-v2`)**: servidor Node.js que hospeda a API, conecta no MongoDB (database `quanton3d`) e processa a IA.

## 2. Regras de Banco de Dados (CRÍTICO)

- **Coleção de Resinas**: os dados das 459 resinas estão armazenados na coleção do MongoDB chamada **`parametros`** (não usar `print_parameters`).
- **Leitura de Dados**: o endpoint `/resins` (e variações administrativas) deve ler **diretamente** de `db.collection('parametros')`. Não usar fallback para arquivos JSON locais para evitar dados desatualizados.

## 3. Configurações de Build e Deploy

- **Variável CI**: sempre definir `CI=true` no Render.
- **Dependências**: usar `pnpm install --no-frozen-lockfile`.
- **Instalação no Render**: garantir que a variável `SKIP_INSTALL` esteja como `false` quando houver atualizações de código.

## 4. Integração de API e Rotas

- **Base URL**: o frontend usa `VITE_API_URL` apontando para `https://quanton3d-bot-v2.onrender.com/api`.
- **Compatibilidade**: o backend deve servir rotas tanto em `/api/chat` quanto na raiz `/chat` para evitar erros de CORS ou 404.
- **Rota de Resinas**: o frontend remove o sufixo `/api` ao chamar rotas públicas de dados (por exemplo, busca em `...onrender.com/resins`).

## 5. Gestão de Estado (`ChatBot.jsx`)

- Manter o sistema de debounce para proteger o `localStorage`.
- Estados obrigatórios: `selectedImage`, `error`, `suggestionText`.

## 6. Segurança

- **Backend (v2)**: deve conter `MONGODB_URI` (com a flag `retryWrites=true`) e `OPENAI_API_KEY`.
- **Frontend**: apenas `VITE_API_URL` e `VITE_ADMIN_API_TOKEN`.
