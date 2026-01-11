import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import chatRoutes from './src/routes/chatRoutes.js'
import { apiRoutes } from './src/routes/apiRoutes.js'
import { suggestionsRoutes } from './src/routes/suggestionsRoutes.js'
import { authRoutes } from './src/routes/authRoutes.js'
import { buildAdminRoutes } from './src/routes/adminRoutes.js'
import { metrics } from './src/utils/metrics.js'
import * as db from './db.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 10000
const MONGODB_URI = process.env.MONGODB_URI || ''

// ==========================================================
// CORS
// ==========================================================
const allowedOrigins = [
  'https://quanton3dia.onrender.com',
  'http://localhost:5173',
  'https://quanton3d-bot-v2.onrender.com',
  'http://localhost:3000',
  'http://localhost:10000'
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log(`⚠️ Origem bloqueada: ${origin}`);
        callback(null, true);
      }
    },
    credentials: true,
  })
)

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// ==========================================================
// CONEXÃO MONGODB
// ==========================================================
if (MONGODB_URI) {
  db.connectToMongo(MONGODB_URI)
    .then(() => console.log('[MongoDB] ✅ Conectado'))
    .catch((error) => console.error('[MongoDB] ❌ Erro:', error))
} else {
  console.warn('[MongoDB] ⚠️ MONGODB_URI não configurada')
}

// ==========================================================
// HEALTH CHECK
// ==========================================================
app.get('/health', async (req, res) => {
  try {
    const dbStatus = db.isConnected?.() ? 'connected' : 'disconnected'
    res.json({
      status: 'ok',
      database: dbStatus,
      timestamp: new Date().toISOString(),
      port: PORT
    })
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message })
  }
})

// ==========================================================
// ROTAS DE API / ADMIN / MÉTRICAS
// ==========================================================
app.get('/health/metrics', (req, res) => {
  res.json({
    success: true,
    metrics: metrics.getStats(),
    timestamp: new Date().toISOString()
  })
})

const adminRoutes = buildAdminRoutes()

app.use('/api', apiRoutes)
app.use('/', apiRoutes)
app.use('/api', suggestionsRoutes)
app.use('/', suggestionsRoutes)
app.use('/auth', authRoutes)
app.use('/admin', authRoutes)
app.use('/admin', adminRoutes)

// ==========================================================
// ROTAS DO CHAT
// ==========================================================
app.use('/api', chatRoutes)
app.use('/chat', chatRoutes)
app.use('/', chatRoutes)

// ==========================================================
// FRONTEND
// ==========================================================
const distPath = path.join(__dirname, 'dist')
app.use(express.static(distPath))

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API não encontrada', path: req.path })
  }
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) {
      res.status(404).json({ error: 'Frontend não encontrado' })
    }
  })
})

// ==========================================================
// INICIALIZAÇÃO
// ==========================================================
const startServer = async () => {
  try {
    console.log('\n🚀 INICIANDO QUANTON3D BOT...\n')

    if (MONGODB_URI) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      console.log('[INIT] ✅ MongoDB')
    }

    if (!process.env.OPENAI_API_KEY) {
      console.log('[INIT] ⚠️ OPENAI_API_KEY não configurada')
    } else {
      console.log('[INIT] ✅ OpenAI API')
    }

    // ✅ CORREÇÃO: Caminho correto sem duplicação
    try {
      const ragModule = await import('./src/services/ragService.js')
      if (ragModule && ragModule.initRAG) {
        await ragModule.initRAG()
        console.log('[INIT] ✅ RAG inicializado')
      }
    } catch (error) {
      console.log('[INIT] ⚠️ RAG não disponível (continuando sem RAG)')
    }

    console.log('\n✨ Serviços prontos!\n')

    app.listen(PORT, '0.0.0.0', () => {
      console.log('═══════════════════════════════════════════════')
      console.log('🤖 QUANTON3D BOT ONLINE!')
      console.log('═══════════════════════════════════════════════')
      console.log(`📡 Porta: ${PORT}`)
      console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`)
      console.log(`💚 Health: /health`)
      console.log(`🤖 Chat: /api/ask`)
      console.log(`🖼️  Imagem: /api/ask-with-image`)
      console.log('═══════════════════════════════════════════════\n')
    })

  } catch (error) {
    console.error('\n❌ ERRO FATAL:', error)
    process.exit(1)
  }
}

startServer()
