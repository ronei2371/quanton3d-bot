import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import chatRoutes from './src/routes/chatRoutes.js'

// --- CORREÇÃO DO CODEX ---
const dbModule = await import('./db.js')
const db = dbModule.default ?? dbModule
// -------------------------

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 4000
const MONGODB_URI = process.env.MONGODB_URI || ''
const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean) || []

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true)
      }

      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true)
      }

      return callback(new Error('Not allowed by CORS'))
    },
    credentials: true,
  })
)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

if (MONGODB_URI && typeof db.connectToMongo === 'function') {
  db.connectToMongo(MONGODB_URI)
    .then(() => {
      console.log('[MongoDB] Conectado com sucesso')
    })
    .catch((error) => {
      console.error('[MongoDB] Falha na conexão', error)
    })
} else if (MONGODB_URI) {
  console.warn('[MongoDB] Helper connectToMongo indisponível; conexão não iniciada')
} else {
  console.warn('[MongoDB] MONGODB_URI não configurada; conexão não iniciada')
}

app.get('/resins', async (req, res) => {
  if (typeof db.getParametrosCollection !== 'function') {
    return res.status(503).json({
      success: false,
      message: 'Helpers do banco indisponíveis. Tente novamente mais tarde.',
    })
  }

  const collection = db.getParametrosCollection()

  if (!collection) {
    return res.status(503).json({
      success: false,
      message: 'Banco de dados indisponível. Tente novamente mais tarde.',
    })
  }

  try {
    const resins = await collection.find({}).toArray()
    return res.status(200).json({ success: true, resins })
  } catch (error) {
    console.error('[RESINS] Falha ao carregar resinas', error)
    return res.status(500).json({
      success: false,
      message: 'Erro ao carregar resinas.',
    })
  }
})

app.use('/api', chatRoutes)
app.use('/chat', chatRoutes)

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, 'dist')

  app.use(express.static(distPath))
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

const server = app.listen(PORT, () => {
  console.log(`🚀 Bot Quanton3D rodando na porta ${PORT}`)
})

export { app }
export default server
