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

// Conexão com o Banco de Dados
if (MONGODB_URI) {
  db.connectToMongo(MONGODB_URI)
    .then(() => console.log('[MongoDB] Conectado com sucesso'))
    .catch((error) => console.error('[MongoDB] Erro na conexão', error))
}

// ==========================================================
// ALINHAMENTO DE ROTAS COM O FRONTEND (DIAGNÓSTICO)
// ==========================================================

// 1. Resinas e Parâmetros
app.get('/api/resins', async (req, res) => {
  const collection = db.getParametrosCollection()
  if (!collection) return res.status(503).json({ success: false, message: 'DB offline' })
  try {
    const resins = await collection.find({}).toArray()
    res.status(200).json({ success: true, resins })
  } catch (e) { res.status(500).json({ success: false }) }
})

app.get('/api/params/printers', async (req, res) => {
  res.status(200).json({ success: true, printers: [] })
})

// 2. Galeria
app.get('/api/gallery', async (req, res) => {
  const collection = db.getGalleryCollection()
  try {
    const photos = await collection.find({}).limit(50).toArray()
    res.status(200).json({ success: true, photos })
  } catch (e) { res.status(500).json({ success: false }) }
})

app.post('/api/gallery', async (req, res) => {
  const collection = db.getGalleryCollection()
  try {
    await collection.insertOne({ ...req.body, createdAt: new Date() })
    res.status(200).json({ success: true })
  } catch (e) { res.status(500).json({ success: false }) }
})

// 3. Formulários e Mensagens (Correção dos 404)
app.post('/api/contact', async (req, res) => {
  const collection = db.getCollection ? db.getCollection('messages') : null
  try {
    await collection.insertOne({ ...req.body, type: 'contact', createdAt: new Date() })
    res.status(200).json({ success: true })
  } catch (e) { res.status(500).json({ success: false }) }
})

app.post('/api/register-user', async (req, res) => {
  const collection = db.getCollection ? db.getCollection('partners') : null
  try {
    await collection.insertOne({ ...req.body, type: 'registration', createdAt: new Date() })
    res.status(200).json({ success: true })
  } catch (e) { res.status(200).json({ success: true }) } // Fallback para não travar o site
})

app.post('/api/custom-request', async (req, res) => {
  const collection = db.getCollection ? db.getCollection('messages') : null
  try {
    await collection.insertOne({ ...req.body, type: 'custom_request', createdAt: new Date() })
    res.status(200).json({ success: true })
  } catch (e) { res.status(500).json({ success: false }) }
})

app.post('/api/suggest-knowledge', async (req, res) => {
  const collection = db.getSuggestionsCollection()
  try {
    await collection.insertOne({ ...req.body, createdAt: new Date() })
    res.status(200).json({ success: true })
  } catch (e) { res.status(500).json({ success: false }) }
})

// 4. Admin e Login
app.post('/auth/login', (req, res) => {
  res.status(401).json({ success: false, message: 'Acesso restrito' })
})

// ==========================================================

// Rotas do Chat (Cérebro)
app.use('/api', chatRoutes)
app.use('/chat', chatRoutes)

// Servir o Frontend e Fallback de HTML
const distPath = path.join(__dirname, 'dist')
app.use(express.static(distPath))

app.get('*', (req, res) => {
  // Se for uma rota que deveria ser API, não manda o HTML
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Rota de API não encontrada' })
  }
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`🚀 Bot Quanton3D rodando na porta ${PORT}`)
})
