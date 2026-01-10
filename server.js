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

// Configuração de CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean) || '*',
    credentials: true,
  })
)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Conexão MongoDB
if (MONGODB_URI) {
  db.connectToMongo(MONGODB_URI)
    .then(() => console.log('[MongoDB] Conectado com sucesso'))
    .catch((error) => console.error('[MongoDB] Falha na conexão', error))
} else {
  console.warn('[MongoDB] URI não definida!')
}

// ==========================================================
// ROTAS ALINHADAS COM O FRONTEND (CORREÇÃO DO DIAGNÓSTICO)
// ==========================================================

// 1. Rota de Resinas (Corrigido para /api/resins)
app.get('/api/resins', async (req, res) => {
  const collection = db.getParametrosCollection()
  if (!collection) return res.status(503).json({ success: false, message: 'Banco off' })
  try {
    const resins = await collection.find({}).toArray()
    return res.status(200).json({ success: true, resins })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Erro ao buscar resinas' })
  }
})

// 2. Rota de Impressoras (Adicionada para parar o erro 404)
app.get('/api/params/printers', async (req, res) => {
  // Retorna lista vazia por enquanto para não dar erro
  return res.status(200).json({ success: true, printers: [] })
})

// 3. Rota da Galeria (Adicionado GET para visualizar e mantido POST)
app.get('/api/gallery', async (req, res) => {
  const collection = db.getGalleryCollection()
  if (!collection) return res.status(503).json({ success: false })
  try {
    // Pega as últimas 50 fotos aprovadas (ou todas se não tiver filtro)
    const photos = await collection.find({}).sort({ createdAt: -1 }).limit(50).toArray()
    return res.status(200).json({ success: true, photos })
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Erro ao buscar galeria' })
  }
})

app.post('/api/gallery', async (req, res) => {
  const collection = db.getGalleryCollection()
  if (!collection) return res.status(503).json({ message: 'Banco off' })
  try {
    await collection.insertOne({ ...req.body, approved: false, createdAt: new Date() })
    return res.status(200).json({ success: true, message: 'Foto enviada!' })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Erro ao salvar' })
  }
})

// 4. Rota de Sugestões (Nome ajustado para suggest-knowledge)
app.post('/api/suggest-knowledge', async (req, res) => {
  const collection = db.getSuggestionsCollection()
  if (!collection) return res.status(503).json({ message: 'Banco off' })
  try {
    await collection.insertOne({ ...req.body, source: 'user_suggestion', createdAt: new Date() })
    return res.status(200).json({ success: true, message: 'Obrigado pela sugestão!' })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Erro ao salvar' })
  }
})

// 5. Rota de Contato (Nome ajustado para contact)
app.post('/api/contact', async (req, res) => {
  const collection = db.getCollection ? db.getCollection('messages') : null
  if (!collection) return res.status(503).json({ message: 'Banco off' })
  try {
    await collection.insertOne({ ...req.body, read: false, createdAt: new Date() })
    return res.status(200).json({ success: true, message: 'Mensagem enviada!' })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Erro ao enviar' })
  }
})

// 6. Rota de Login (Mock para evitar erro 404 no admin)
app.post('/auth/login', (req, res) => {
  return res.status(401).json({ success: false, message: 'Login de admin temporariamente desativado.' })
})

// Rotas Extras (Compatibilidade)
app.post('/api/messages', (req, res) => res.redirect(307, '/api/contact'))
app.post('/api/suggestions', (req, res) => res.redirect(307, '/api/suggest-knowledge'))

// ==========================================================

// Rotas do Chat
app.use('/api', chatRoutes)
app.use('/chat', chatRoutes)

// Rota para servir o Frontend (se estiver junto)
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
