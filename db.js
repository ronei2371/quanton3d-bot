import mongoose from 'mongoose'

const DEFAULT_OPTIONS = {
  serverSelectionTimeoutMS: 5000,
}

let connectPromise = null

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

const conversasSchema = new mongoose.Schema({}, { strict: false, collection: 'conversas' })

export const Conversas = mongoose.models.Conversas || mongoose.model('Conversas', conversasSchema)

export default {
  connectToMongo,
  getCollection,
  getDb,
  getDocumentsCollection,
  getVisualKnowledgeCollection,
  isConnected,
  getGalleryCollection,
  getSuggestionsCollection,
  getSugestoesCollection,
  getMetricasCollection,
  getParametrosCollection,
  getPrintParametersCollection,
  getConversasCollection,
  Conversas,
}
