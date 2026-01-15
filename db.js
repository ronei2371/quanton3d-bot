import mongoose from 'mongoose'

const DEFAULT_OPTIONS = {
  serverSelectionTimeoutMS: 5000,
}

let connectPromise = null

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const retryMongoWrite = async (operation, options = {}) => {
  const { retries = 3, delayMs = 500, label = 'operacao' } = options
  let attempt = 0

  while (attempt <= retries) {
    try {
      return await operation()
    } catch (error) {
      if (attempt >= retries) {
        console.log(`[MongoDB] Falha ao salvar ${label} apos ${retries + 1} tentativas.`)
        throw error
      }
      await wait(delayMs)
      attempt += 1
    }
  }

  return null
}

export const connectToMongo = async (uri = process.env.MONGODB_URI) => {
  if (!uri) return false

  if (mongoose.connection.readyState === 1) {
    return true
  }

  if (!connectPromise) {
    connectPromise = mongoose
      .connect(uri, DEFAULT_OPTIONS)
      .then(() => true)
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
