import mongoose from 'mongoose';

// Schema de Parâmetros de Impressão
const ParametrosSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  sessionId: { type: String, index: true },
  userName: String,
  resin: { type: String, required: true, index: true },
  printer: { type: String, required: true, index: true },
  parametros: {
    layerHeight: String,
    baseLayers: String,
    exposureTime: String,
    baseExposureTime: String,
    transitionLayers: String,
    uvOffDelay: String,
    liftDistance: {
      value1: String,
      value2: String
    },
    liftSpeed: {
      value1: String,
      value2: String
    },
    retractSpeed: {
      value1: String,
      value2: String
    }
  },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});

// Schema de Sugestões
const SugestoesSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  sessionId: { type: String, required: true },
  suggestion: { type: String, required: true },
  userName: String,
  userPhone: String,
  userEmail: String,
  lastUserMessage: String,
  lastBotReply: String,
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true
  },
  createdAt: { type: Date, default: Date.now, index: true },
  approvedBy: String,
  approvedAt: Date,
  rejectedBy: String,
  rejectedAt: Date,
  rejectionReason: String,
  documentId: String
});

// Schema de Conversas (Histórico)
const ConversasSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  userName: String,
  userPhone: String,
  userEmail: String,
  resin: String,
  printer: String,
  messages: [{
    role: { type: String, enum: ['user', 'assistant', 'system'] },
    content: String,
    timestamp: { type: Date, default: Date.now }
  }],
  metadata: {
    documentsFound: Number,
    questionType: String,
    sentiment: String,
    urgency: String,
    intelligenceMetrics: Object
  },
  resolved: { type: Boolean, default: false },
  rating: Number,
  feedback: String,
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});

// Schema de Métricas
const MetricasSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  userName: String,
  userPhone: String,
  userEmail: String,
  message: String,
  reply: String,
  timestamp: { type: Date, default: Date.now, index: true },
  documentsFound: Number,
  questionType: String,
  questionConfidence: Number,
  entitiesDetected: Object,
  sentiment: String,
  urgency: String,
  intelligenceMetrics: Object,
  isImageAnalysis: Boolean,
  imageDescription: String,
  hasRelevantKnowledge: Boolean,
  feedbackAdded: Boolean,
  feedbackDocumentId: String,
  markedAsBad: Boolean,
  badResponseReason: String
});

const Parametros = mongoose.model('Parametros', ParametrosSchema);
const Sugestoes = mongoose.model('Sugestoes', SugestoesSchema);
const Conversas = mongoose.model('Conversas', ConversasSchema);
const Metricas = mongoose.model('Metricas', MetricasSchema);

export {
  Parametros,
  Sugestoes,
  Conversas,
  Metricas
};

export default {
  Parametros,
  Sugestoes,
  Conversas,
  Metricas
};
