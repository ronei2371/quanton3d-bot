import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import chatRoutes from './src/routes/chatRoutes.js'
import { apiRoutes } from './src/routes/apiRoutes.js'
import { suggestionsRoutes } from './src/routes/suggestionsRoutes.js'
// IMPORTANTE: Trazendo as rotas de segurança
import { authRoutes } from './src/routes/authRoutes.js'
import { buildAdminRoutes } from './src/routes/adminRoutes.js'
import { metrics } from './src/utils/metrics.js'
import { connectToMongo, getPrintParametersCollection, isConnected } from './db.js'
import { initializeRAG } from './rag-search.js'
import { legacyProfiles, legacyResins } from './src/data/seedData.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 10000
const MONGODB_URI = process.env.MONGODB_URI || ''

// ==========================================================
// CORS - Lista VIP (Permite seu site novo entrar)
// ==========================================================
const allowedOrigins = [
  'https://quanton3dia.onrender.com',           // SEU SITE NOVO
  'https://quanton3d-bot-v2.onrender.com',      // SEU SERVIDOR
  'http://localhost:5173',
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
// CONFIGURAÇÃO DAS ROTAS NOVAS (AQUI ESTAVA O ERRO!)
// ==========================================================

// 1. Configura as rotas de Admin
const adminRoutes = buildAdminRoutes({
  adminSecret: process.env.ADMIN_SECRET,
  adminJwtSecret: process.env.ADMIN_JWT_SECRET
})

// 2. Rota de Login (Essencial para o painel entrar)
app.use('/auth', authRoutes)

// 3. Rotas da API Admin (CORRIGIDO: Agora usa /api/admin para casar com o frontend)
app.use('/api/admin', adminRoutes)


// ==========================================================
// OUTRAS ROTAS DO SISTEMA
// ==========================================================
app.get('/health/metrics', (req, res) => {
  res.json({
    success: true,
    metrics: metrics.getStats(),
    timestamp: new Date().toISOString()
  })
})

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
// SERVIR O FRONTEND (Fallback)
// ==========================================================
const distPath = path.join(__dirname, 'dist')
const adminPanelPath = path.join(__dirname, 'public', 'params-panel.html')
app.use(express.static(distPath))

app.get(['/admin', '/admin/'], (req, res) => {
  res.sendFile(adminPanelPath)
})

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

    // Inicializa RAG se possível
    if (process.env.OPENAI_API_KEY && isConnected()) {
        try {
            await initializeRAG();
            console.log('[INIT] ✅ RAG inicializado');
        } catch (error) {
            console.error('[INIT] ❌ Erro no RAG:', error.message);
        }
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log('═══════════════════════════════════════════════')
      console.log('🤖 QUANTON3D BOT ONLINE!')
      console.log(`📡 Porta: ${PORT}`)
      console.log(`🔓 CORS: ${allowedOrigins.join(', ')}`)
      console.log('═══════════════════════════════════════════════\n')
    })

  } catch (error) {
    console.error('\n❌ ERRO FATAL:', error)
    process.exit(1)
  }
}

startServer()
