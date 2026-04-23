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
// FUNÇÃO BASE
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
export const getSugestoesCollection = () => getCollection('sugestoes');
export const getMetricasCollection = () => getCollection('metricas');
export const getParametrosCollection = () => getCollection('parametros');
export const getContactsCollection = () => getCollection('contacts');
export const getCustomRequestsCollection = () => getCollection('custom_requests');
export const getConversasCollection = () => getCollection('conversas');
export const getOrdersCollection = () => getCollection('pedidos');
export const getDb = () => mongoose.connection?.db || null;

// ====================================================================
// COLLECTIONS DO RAG
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

export default {
  connectToMongo,
  getCollection,
  isConnected,
  getGalleryCollection,
  getSuggestionsCollection,
  getSugestoesCollection,
  getMetricasCollection,
  getParametrosCollection,
  getContactsCollection,
  getCustomRequestsCollection,
  getConversasCollection,
  getOrdersCollection,
  getDb,
  getDocumentsCollection,
  getVisualKnowledgeCollection,
  getExpertKnowledgeCollection,
  getPrintParametersCollection,
  Conversas,
};
