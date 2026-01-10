import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import chatRoutes from './src/routes/chatRoutes.js'
import * as db from './db.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 4000
const MONGODB_URI = process.env.MONGODB_URI || ''

app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean) || '*',
    credentials: true,
  })
)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Conexão com o Banco
if (MONGODB_URI) {
  db.connectToMongo(MONGODB_URI)
    .then(() => console.log('[MongoDB] Conectado com sucesso'))
    .catch((error) => console.error('[MongoDB] Falha na conexão', error))
} else {
  console.warn('[MongoDB] MONGODB_URI não configurada')
}

// --- ROTAS DO SITE (CORREÇÃO DOS ERROS VERMELHOS) ---

// 1. Rota de Parâmetros (Resinas)
app.get('/resins', async (req, res) => {
  const collection = db.getParametrosCollection()
  if (!collection) return res.status(503).json({ success: false, message: 'Banco indisponível' })
  try {
    const resins = await collection.find({}).toArray()
    return res.status(200).json({ success: true, resins })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Erro ao carregar resinas.' })
  }
})

// 2. Rota de Sugestões (Correção do erro da imagem)
app.post('/api/suggestions', async (req, res) => {
  const collection = db.getSuggestionsCollection()
  if (!collection) return res.status(503).json({ message: 'Banco indisponível' })
  try {
    await collection.insertOne({ ...req.body, createdAt: new Date() })
    return res.status(200).json({ success: true, message: 'Sugestão enviada!' })
  } catch (error) {
    console.error('Erro sugestão:', error)
    return res.status(500).json({ success: false, message: 'Erro ao salvar sugestão.' })
  }
})

// 3. Rota da Galeria (Envio de fotos)
app.post('/api/gallery', async (req, res) => {
  const collection = db.getGalleryCollection()
  if (!collection) return res.status(503).json({ message: 'Banco indisponível' })
  try {
    await collection.insertOne({ ...req.body, approved: false, createdAt: new Date() })
    return res.status(200).json({ success: true, message: 'Foto enviada para aprovação!' })
  } catch (error) {
    console.error('Erro galeria:', error)
    return res.status(500).json({ success: false, message: 'Erro ao salvar foto.' })
  }
})

// 4. Rota de Fale Conosco (Messages)
app.post('/api/messages', async (req, res) => {
  // Tenta pegar a coleção 'messages' direto, já que não criamos helper específico pra ela
  const collection = db.getCollection ? db.getCollection('messages') : null
  if (!collection) return res.status(503).json({ message: 'Banco indisponível' })
  try {
    await collection.insertOne({ ...req.body, read: false, createdAt: new Date() })
    return res.status(200).json({ success: true, message: 'Mensagem enviada!' })
  } catch (error) {
    console.error('Erro contato:', error)
    return res.status(500).json({ success: false, message: 'Erro ao enviar mensagem.' })
  }
})
// ----------------------------------------------------

// Rotas do Chat
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
