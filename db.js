import mongoose from 'mongoose';

const DEFAULT_OPTIONS = {
  serverSelectionTimeoutMS: 5000,
};

let connectPromise = null;

export const connectToMongo = async (uri) => {
  if (!uri) return false;

  if (mongoose.connection.readyState === 1) {
    return true;
  }

  if (!connectPromise) {
    connectPromise = mongoose
      .connect(uri, DEFAULT_OPTIONS)
      .then(() => true)
      .catch((error) => {
        connectPromise = null;
        throw error;
      });
  }

  return connectPromise;
};

// ====================================================================
// FUNÇÃO BASE — usada internamente e exportada para o adminRoutes
// ====================================================================
export const getCollection = (name) => {
  if (!mongoose.connection?.db) return null;
  return mongoose.connection.db.collection(name);
};

// ====================================================================
// VERIFICAR SE ESTÁ CONECTADO
// ====================================================================
export const isConnected = () => mongoose.connection.readyState === 1;

// ====================================================================
// COLLECTIONS ORIGINAIS
// ====================================================================
export const getGalleryCollection = () => getCollection('gallery');
export const getSuggestionsCollection = () => getCollection('suggestions');
export const getMetricasCollection = () => getCollection('metricas');
export const getParametrosCollection = () => getCollection('parametros');
export const getContactsCollection = () => getCollection('contacts');
export const getCustomRequestsCollection = () => getCollection('custom_requests');

// ====================================================================
// COLLECTIONS DO RAG (necessárias para rag-search.js e adminRoutes.js)
// ====================================================================
export const getDocumentsCollection = () => getCollection('documents');
export const getVisualKnowledgeCollection = () => getCollection('visual_knowledge');
export const getExpertKnowledgeCollection = () => getCollection('expert_knowledge');
export const getPrintParametersCollection = () => getCollection('print_parameters');

// ====================================================================
// MODEL CONVERSAS
// ====================================================================
const conversasSchema = new mongoose.Schema({}, { strict: false, collection: 'conversas' });
export const Conversas = mongoose.models.Conversas || mongoose.model('Conversas', conversasSchema);

export const getDocumentsCollection = () => getCollection('documents');
export const getVisualKnowledgeCollection = () => getCollection('visual_knowledge');
export const getExpertKnowledgeCollection = () => getCollection('expert_knowledge');
export const getPrintParametersCollection = () => getCollection('print_parameters');

export default {
  connectToMongo,
  getCollection,
  isConnected,
  getGalleryCollection,
  getSuggestionsCollection,
  getMetricasCollection,
  getParametrosCollection,
  getContactsCollection,
  getCustomRequestsCollection,
  getDocumentsCollection,
  getVisualKnowledgeCollection,
  getExpertKnowledgeCollection,
  getPrintParametersCollection,
  Conversas,
};
