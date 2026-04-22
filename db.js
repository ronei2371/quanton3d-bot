import mongoose from 'mongoose'

const DEFAULT_OPTIONS = {
  serverSelectionTimeoutMS: 5000,
}

const ensureRetryWritesEnabled = (uri = '') => {
  if (typeof uri !== 'string' || !uri.trim()) return uri
  if (!uri.startsWith('mongodb')) return uri
  if (/[?&]retryWrites=/i.test(uri)) return uri

  const joiner = uri.includes('?') ? '&' : '?'
  return `${uri}${joiner}retryWrites=true`
}

let connectPromise = null

// MELHORIA: Índices para as novas coleções de inteligência, mantendo os antigos
const ensureIndexes = async () => {
  const db = mongoose.connection?.db
  if (!db) return

  try {
    await Promise.all([
      db.collection('documents').createIndex({ createdAt: -1 }),
      db.collection('conversas').createIndex({ createdAt: -1 }),
      db.collection('visual_knowledge').createIndex({ createdAt: -1 }),
      db.collection('expert_knowledge').createIndex({ createdAt: -1 }),
      db.collection('sugestoes').createIndex({ createdAt: -1 })
    ])
    console.log('[DB] Índices de performance garantidos.');
  } catch (error) {
    console.warn('Aviso: falha ao garantir indexes do MongoDB.', error)
  }
}

export const connectToMongo = async (uri = process.env.MONGODB_URI) => {
  if (!uri) return false

  const finalUri = ensureRetryWritesEnabled(uri)

  if (mongoose.connection.readyState === 1) return true
  if (connectPromise) return connectPromise

  connectPromise = mongoose.connect(finalUri, DEFAULT_OPTIONS)
    .then(async () => {
      await ensureIndexes()
      return true
    })
    .catch(err => {
      console.error('Erro conexao MongoDB:', err)
      connectPromise = null
      return false
    })

  return connectPromise
}

// MANUTENÇÃO: Mantendo todas as funções originais para não quebrar o apiRoutes.js
export const getDocumentsCollection = () => mongoose.connection?.db?.collection('documents')
export const getConversasCollection = () => mongoose.connection?.db?.collection('conversas')
export const getVisualKnowledgeCollection = () => mongoose.connection?.db?.collection('visual_knowledge')
export const getExpertKnowledgeCollection = () => mongoose.connection?.db?.collection('expert_knowledge')
export const getSugestoesCollection = () => mongoose.connection?.db?.collection('sugestoes')
export const getOrdersCollection = () => mongoose.connection?.db?.collection('orders')

// Função genérica mantida para compatibilidade total
export const getCollection = (name) => mongoose.connection?.db?.collection(name)

export const isConnected = () => mongoose.connection.readyState === 1
export const getDb = () => mongoose.connection?.db;
