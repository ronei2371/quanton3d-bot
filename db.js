import mongoose from 'mongoose'

const DEFAULT_OPTIONS = {
  serverSelectionTimeoutMS: 5000,
}

let connectPromise = null

export const connectToMongo = async (uri) => {
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

const getCollection = (name) => {
  if (!mongoose.connection?.db) return null
  return mongoose.connection.db.collection(name)
}

export const getGalleryCollection = () => getCollection('gallery')
export const getSuggestionsCollection = () => getCollection('suggestions')
export const getMetricasCollection = () => getCollection('metricas')
export const getParametrosCollection = () => getCollection('parametros')

const conversasSchema = new mongoose.Schema({}, { strict: false, collection: 'conversas' })

export const Conversas = mongoose.models.Conversas || mongoose.model('Conversas', conversasSchema)

export default {
  connectToMongo,
  getGalleryCollection,
  getSuggestionsCollection,
  getMetricasCollection,
  getParametrosCollection,
  Conversas,
}
