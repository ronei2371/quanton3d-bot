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

const ensureIndexes = async () => {
  const db = mongoose.connection?.db
  if (!db) return

  try {
    await Promise.all([
      db.collection('documents').createIndex({ createdAt: -1 }),
      db.collection('conversas').createIndex({ createdAt: -1 })
    ])
  } catch (error) {
    console.warn('Aviso: falha ao garantir indexes do MongoDB.', error)
  }
}


export const connectToMongo = async (uri = process.env.MONGODB_URI) => {
  if (!uri) return false

  const normalizedUri = ensureRetryWritesEnabled(uri)

  if (mongoose.connection.readyState === 1) {
    return true
  }

  if (!connectPromise) {
    connectPromise = mongoose
      .connect(normalizedUri, DEFAULT_OPTIONS)
      .then(async () => {
        await ensureIndexes()
        return true
      })
      .catch((error) => {
        connectPromise = null
        throw error
      })
  }

  return connectPromise
}

// Funções utilitárias para pegar coleções
export const getCollection = (name) => {
  if (!mongoose.connection?.db) return null
  return mongoose.connection.db.collection(name)
}

export const getDb = () => mongoose.connection?.db || null

// Exportações que o RAG precisa
export const getDocumentsCollection = () => getCollection('documents')
export const getVisualKnowledgeCollection = () => getCollection('visual_knowledge')
export const isConnected = () => mongoose.connection.readyState === 1

// Exportações que o SITE precisa
export const getGalleryCollection = () => getCollection('gallery')
export const getSuggestionsCollection = () => getCollection('sugestoes')
export const getSugestoesCollection = () => getCollection('sugestoes')
export const getMetricasCollection = () => getCollection('metricas')
export const getParametrosCollection = () => getCollection('parametros')
export const getPrintParametersCollection = () => getCollection('parametros')
export const getConversasCollection = () => getCollection('conversas')
export const getLearningCollection = () => getCollection('learning')

const conversasSchema = new mongoose.Schema({}, { strict: false, collection: 'conversas' })

export const Conversas = mongoose.models.Conversas || mongoose.model('Conversas', conversasSchema)
export const getOrdersCollection = () => getCollection('orders')
