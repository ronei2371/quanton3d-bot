export const swaggerSpec = {
  openapi: "3.0.0",
  info: {
    title: "Quanton3D Bot API",
    version: "1.0.0",
    description: "Documentação unificada das rotas públicas e administrativas"
  },
  servers: [
    { url: "https://quanton3d-bot-v2.onrender.com", description: "Produção" },
    { url: "http://localhost:10000", description: "Desenvolvimento" }
  ],
  paths: {
    "/health": {
      get: {
        summary: "Status básico da API",
        responses: {
          200: { description: "Status OK" }
        }
      }
    },
    "/health/rag": {
      get: {
        summary: "Status do mecanismo RAG",
        responses: {
          200: { description: "Estado do RAG" }
        }
      }
    },
    "/api/chat": {
      post: {
        summary: "Enviar mensagem ao bot",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                  sessionId: { type: "string" }
                },
                required: ["message"]
              }
            }
          }
        },
        responses: {
          200: { description: "Resposta gerada" },
          400: { description: "Payload inválido" },
          429: { description: "Rate limit" }
        }
      }
    },
    "/resins": {
      get: {
        summary: "Listagem pública de resinas",
        responses: {
          200: { description: "Lista de resinas" },
          404: { description: "Nenhuma resina encontrada" }
        }
      }
    },
    "/auth/login": {
      post: {
        summary: "Autenticação de administrador",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  password: { type: "string" }
                },
                required: ["password"]
              }
            }
          }
        },
        responses: {
          200: { description: "Login bem-sucedido" },
          401: { description: "Senha incorreta" }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    }
  }
};
