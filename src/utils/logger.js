// ====================================================================
// LOGGER ESTRUTURADO COM WINSTON
// ====================================================================

import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir = path.join(__dirname, '../../logs');

// Criar diretorio de logs se nao existir
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Formato personalizado
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Logger principal
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: customFormat,
  defaultMeta: { service: 'quanton3d-bot' },
  transports: [
    // Erros em arquivo separado
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Todos os logs
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880,
      maxFiles: 5
    })
  ]
});

// Em desenvolvimento, tambem mostrar no console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Funcoes auxiliares
export const logRAG = (message, level = 'info', meta = {}) => {
  logger.log(level, `[RAG] ${message}`, { component: 'rag', ...meta });
};

export const logChat = (message, level = 'info', meta = {}) => {
  logger.log(level, `[CHAT] ${message}`, { component: 'chat', ...meta });
};

export const logAdmin = (message, level = 'info', meta = {}) => {
  logger.log(level, `[ADMIN] ${message}`, { component: 'admin', ...meta });
};

export const logError = (error, context = '') => {
  logger.error(`[ERROR] ${context}`, {
    error: error.message,
    stack: error.stack,
    context
  });
};

export default logger;
