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
import { connectToMongo, getPrintParametersCollection, isConnected } from './db.js'
import { initializeRAG } from './rag-search.js'
import { legacyProfiles, legacyResins } from './src/data/seedData.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 10000
const MONGODB_URI = process.env.MONGODB_URI || ''

// --- LISTA VIP (CORS) ---
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

// --- HEALTH CHECK ---
app.get('/health', async (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// --- ROTAS DO SISTEMA ---
app.use('/auth', authRoutes) // <--- A ROTA QUE FALTAVA!
const adminRoutes = buildAdminRoutes({
  adminSecret: process.env.ADMIN_SECRET,
  adminJwtSecret: process.env.ADMIN_JWT_SECRET
})
app.use('/api/admin', adminRoutes)

app.use('/api', apiRoutes)
app.use('/', apiRoutes)
app.use('/api', suggestionsRoutes)
app.use('/', suggestionsRoutes)
app.use('/api', chatRoutes)
app.use('/chat', chatRoutes)
app.use('/', chatRoutes)

// --- SERVIR ARQUIVOS ---
const distPath = path.join(__dirname, 'dist')
app.use(express.static(distPath))

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Bot Quanton3D rodando na porta ${PORT}`)
  console.log('Rotas de Login (/auth) ativadas!')
})

export { app }
export default server
