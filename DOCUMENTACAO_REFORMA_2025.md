# Relatório Técnico de Atualização (Change Log) — 2025

Este documento registra as principais mudanças após a migração de persistência para MongoDB e a implementação de autenticação por JWT no painel administrativo do Quanton3D Bot.

> **Nota (jan/2026):** para orientações consolidadas e atualizadas sobre build, deploy e regras de dados — incluindo o uso exclusivo da coleção `parametros` para resinas — consulte o arquivo `DIRETRIZES_TECNICAS_2026.md`.

## 1) Arquitetura de Dados

### 1.1. Migração de `fs` para MongoDB
- **Antes:** parte da persistência era feita em arquivos locais (filesystem). Isso era limitado em ambientes como o Render (volátil e sem persistência confiável).
- **Agora:** o backend opera **exclusivamente com MongoDB**. O log de inicialização confirma essa decisão (“Sistema configurado para usar APENAS MongoDB para persistência”).
- **Impacto:** elimina dependência de arquivos locais, melhora a durabilidade dos dados e permite escalabilidade horizontal.

### 1.2. Coleções principais criadas/consumidas
O módulo `db.js` centraliza a conexão e expõe funções de acesso às coleções. As coleções criadas automaticamente (quando não existem) são:
- `documents` — base de conhecimento (RAG).
- `messages` — mensagens de contato (“Fale Conosco”).
- `parametros` — parâmetros de impressão persistidos (coleção única em MongoDB; substitui a antiga `print_parameters`). 

Coleções utilizadas/esperadas no fluxo atual:
- `gallery` — galeria de fotos (upload / aprovação).
- `visual_knowledge` — conhecimento visual para RAG com imagens.
- `suggestions` — sugestões de conhecimento (aprovadas/rejeitadas).
- `partners` — parceiros/empresas parceiras.
- `learning` — base de aprendizado (quando usada por processos internos).

### 1.3. Modelos Mongoose
Além do cliente nativo do MongoDB, existem modelos com Mongoose para:
- `Parametros` → coleção `parametros`.
- `Sugestoes` → coleção `suggestions`.
- `Conversas` → histórico de conversas.
- `Metricas` → métricas de interação e qualidade.

> **Nota:** a conexão é aberta via `connectToMongo()` (MongoClient + Mongoose), garantindo acesso tanto às coleções diretas quanto aos modelos.

---

## 2) Protocolo de Segurança

### 2.1. Autenticação via Bearer Token (JWT)
- **Login Admin (`POST /admin/login`)**: recebe a senha `ADMIN_SECRET`, valida e emite um **JWT de curta duração (30 min)**.
- **Resposta do login:** `token` + `expiresIn: 1800`.
- **Cabeçalho padrão:** `Authorization: Bearer <TOKEN>`.

### 2.2. Proteção de rotas administrativas
- **Middleware `authenticateJWT`**:
  - Verifica se o header `Authorization` existe e começa com `Bearer`.
  - Valida o token com `ADMIN_JWT_SECRET`.
  - Bloqueia acesso se token ausente/expirado/inválido.

### 2.3. Rotas administrativas protegidas (exemplos)
Rotas de administração agora exigem Bearer Token, como:
- `GET /custom-requests`
- `GET /metrics`, `GET /metrics/*`
- `POST /add-knowledge`
- `POST /admin/knowledge/import`
- `GET /admin/knowledge/list`
- `DELETE /admin/knowledge/:id`
- `GET /api/knowledge` + `PUT/DELETE /api/knowledge/:id`
- `GET /suggestions`, `PUT /approve-suggestion/:id`, `PUT /reject-suggestion/:id`
- `GET /rag-status`, `GET /intelligence-stats`
- Rotas de **galeria** e **conhecimento visual** (`/api/gallery/*`, `/api/visual-knowledge/*`)
- Rotas de **parceiros** (`/api/partners/*`)
- Rotas de **parâmetros** (`/params/*`)

> Resultado: a área administrativa não é mais acessível sem token válido.

---

## 3) Variáveis de Ambiente (Render)

### 3.1. Obrigatórias (funcionamento base)
- `MONGODB_URI` — conexão com o banco MongoDB.
- `ADMIN_SECRET` — senha estática de login do admin.
- `ADMIN_JWT_SECRET` — segredo de assinatura/verificação do JWT.
- `OPENAI_API_KEY` — chave da OpenAI para gerar respostas/embeddings.

### 3.2. Recomendadas / opcionais por recurso
- `OPENAI_MODEL` — modelo base do chat (padrão: `gpt-4o`).
- `OPENAI_TEMPERATURE` — controle de criatividade (padrão: `0.0`).
- `RAG_EMBEDDING_MODEL` — embedding para RAG (padrão: `text-embedding-3-large`).
- `RAG_MIN_RELEVANCE` — threshold de relevância para RAG (padrão: `0.7`).
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
  - Necessárias para upload/armazenamento de fotos (galeria e conhecimento visual). Sem elas, a galeria fica desabilitada.
- `PORT` — porta do servidor (Render normalmente injeta automaticamente).
- `NODE_ENV` — comportamento de debug de erros.

---

## 4) Frontend ADM

### 4.1. Tela de teste/local (`admin-panel-test.html`)
- **Login protegido por senha** com botão “Entrar”.
- Ao autenticar, o token é salvo no `localStorage` (`quanton3d_admin_token`).
- Exibe **status de autenticação** (✅ autenticado / 🔒 não autenticado).
- Após login bem-sucedido:
  - Carrega status do RAG.
  - Carrega estatísticas de IA.
  - Lista sugestões pendentes/avaliadas.

### 4.2. Uso de Bearer Token nas chamadas
- Todas as ações administrativas passam a enviar:
  ```http
  Authorization: Bearer <token>
  ```
- Isso inclui: listagem, aprovação/rejeição de sugestões, métricas e ações administrativas.

### 4.3. Feedback visual e mensagens
- Interface apresenta **mensagens de sucesso/erro** conforme retorno do backend.
- Mostra contadores e status das sugestões (pendente, aprovada, rejeitada).

---

## 5) Conclusão

Com a migração para MongoDB e a introdução de autenticação JWT, o sistema ganhou:
- **Persistência confiável** em ambiente de nuvem.
- **Segurança reforçada** para operações administrativas.
- **Fluxo administrativo rastreável**, com token e duração definida.
- **Frontend administrativo atualizado**, alinhado com as novas exigências de autenticação.

Este relatório consolida a reforma técnica do backend e a atualização do painel administrativo em 2025.
