import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import chatRoutes from './src/routes/chatRoutes.js'
import { apiRoutes } from './src/routes/apiRoutes.js'
import { suggestionsRoutes } from './src/routes/suggestionsRoutes.js'
import { authRoutes } from './src/routes/authRoutes.js'
import { buildAdminRoutes } from './src/routes/adminRoutes.js'
import { metrics } from './src/utils/metrics.js'
import { connectToMongo, getPrintParametersCollection, isConnected } from './db.js'
import { initializeRAG } from './rag-search.js'
import { legacyProfiles } from './src/data/seedData.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 10000
const MONGODB_URI = process.env.MONGODB_URI || ''

// ==========================================================
// CORS - PERMITE O FRONTEND
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
        callback(null, true); // Permite mesmo assim (modo permissivo)
      }
    },
    credentials: true,
  })
)

app.use(helmet())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// ==========================================================
// HEALTH CHECK
// ==========================================================
app.get('/health', async (req, res) => {
  try {
    const dbStatus = isConnected?.() ? 'connected' : 'disconnected'
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
// MÉTRICAS
// ==========================================================
app.get('/health/metrics', (req, res) => {
  res.json({
    success: true,
    metrics: metrics.getStats(),
    timestamp: new Date().toISOString()
  })
})

// ==========================================================
// AUTENTICAÇÃO (SEM VALIDAÇÃO PARA PAINEL ANTIGO)
// ==========================================================
app.use('/auth', authRoutes)

// ==========================================================
// ROTAS ADMIN - PAINEL ANTIGO (SEM /api/)
// ==========================================================
const adminRoutes = buildAdminRoutes()

// Compatibilidade: painel antigo (/admin/*) e frontend novo (/api/admin/*)
app.use('/admin', adminRoutes)
app.use('/api/admin', adminRoutes)

// ==========================================================
// ROTAS DA API
// ==========================================================
app.use('/api', apiRoutes)
app.use('/', apiRoutes)
app.use('/api', suggestionsRoutes)
app.use('/', suggestionsRoutes)

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
const adminPanelPath = path.join(__dirname, 'public', 'params-panel.html')
app.use(express.static(distPath))

app.get(['/admin', '/admin/'], (req, res) => {
  res.sendFile(adminPanelPath, (err) => {
    if (err) {
      res.sendFile(path.join(distPath, 'index.html'))
    }
  })
})

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/admin/')) {
    return res.status(404).json({ error: 'Rota não encontrada', path: req.path })
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
      if (!MONGODB_URI.includes('retryWrites=true')) {
        console.warn('[MongoDB] ⚠️ Recomenda-se usar MONGODB_URI com retryWrites=true (Diretriz Jan/2026).')
      }
      await connectToMongo(MONGODB_URI)
      console.log('[MongoDB] ✅ Conectado')
      await new Promise(resolve => setTimeout(resolve, 2000))

      const paramsCollection = getPrintParametersCollection()
      if (paramsCollection) {
        const count = await paramsCollection.countDocuments()
        if (count === 0) {
          console.log('[INIT] ⚠️ Banco vazio! Injetando dados legacy...')
          await paramsCollection.insertMany(legacyProfiles)
          console.log('[INIT] ✅ Perfis inseridos com sucesso.')
        }
      }
    } else {
      console.warn('[MongoDB] ⚠️ MONGODB_URI não configurada')
    }

    if (!process.env.OPENAI_API_KEY) {
      console.log('[INIT] ⚠️ OPENAI_API_KEY não configurada')
    } else {
      console.log('[INIT] ✅ OpenAI API')
    }

    try {
      if (isConnected()) {
        await initializeRAG();
        console.log('[INIT] ✅ RAG inicializado');
      }
    } catch (error) {
      console.error('[INIT] ⚠️ RAG não disponível (continuando sem RAG)');
    }

    console.log('\n✨ Serviços prontos!\n')

    app.listen(PORT, '0.0.0.0', () => {
      console.log('═══════════════════════════════════════════════')
      console.log('🤖 QUANTON3D BOT ONLINE!')
      console.log('═══════════════════════════════════════════════')
      console.log(`📡 Porta: ${PORT}`)
      console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`)
      console.log(`💚 Health: /health`)
      console.log(`🔐 Auth: /auth/login`)
      console.log(`👤 Admin: /admin/*`)
      console.log(`🤖 Chat: /api/ask`)
      console.log('═══════════════════════════════════════════════\n')
    })

  } catch (error) {
    console.error('\n❌ ERRO FATAL:', error)
    process.exit(1)
  }
}

startServer()
