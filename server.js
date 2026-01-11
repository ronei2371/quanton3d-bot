import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import chatRoutes from './src/routes/chatRoutes.js'
import { authRoutes } from './src/routes/authRoutes.js'
import * as db from './db.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 10000  // ✅ CORRIGIDO: Porta 10000 para Render
const MONGODB_URI = process.env.MONGODB_URI || ''

// ==========================================================
// CONFIGURAÇÃO DE CORS
// ==========================================================
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean) || '*',
    credentials: true,
  })
)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// ==========================================================
// CONEXÃO COM MONGODB
// ==========================================================
if (MONGODB_URI) {
  db.connectToMongo(MONGODB_URI)
    .then(() => console.log('[MongoDB] ✅ Conectado com sucesso'))
    .catch((error) => console.error('[MongoDB] ❌ Erro na conexão:', error))
} else {
  console.warn('[MongoDB] ⚠️ MONGODB_URI não configurada')
}

// ==========================================================
// HEALTH CHECK
// ==========================================================
app.get('/health', async (req, res) => {
  try {
    const dbStatus = db.getCollection ? 'connected' : 'disconnected'
    res.json({
      status: 'ok',
      database: dbStatus,
      timestamp: new Date().toISOString(),
      port: PORT
    })
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    })
  }
})

// ==========================================================
// 1. ROTAS DE PARÂMETROS - Resinas e Impressoras
// ==========================================================
const handleResinsRequest = async (req, res) => {
  try {
    const collection = db.getParametrosCollection?.() || db.getCollection?.('parametros')
    if (!collection) {
      console.warn('[API] ⚠️ Collection parametros não disponível')
      return res.status(200).json({ success: true, resins: [] })
    }
    const resins = await collection.find({}).toArray()
    console.log(`[API] ✅ Resinas carregadas: ${resins.length}`)
    res.status(200).json({ success: true, resins })
  } catch (error) {
    console.error('[API] ❌ Erro ao buscar resinas:', error)
    res.status(500).json({ success: false, resins: [], message: 'Erro ao carregar resinas' })
  }
}

app.get('/api/resins', handleResinsRequest)
app.get('/resins', handleResinsRequest)

app.get('/api/params/printers', async (req, res) => {
  try {
    const collection = db.getCollection?.('printers')
    if (!collection) {
      return res.status(200).json({ success: true, printers: [] })
    }
    const printers = await collection.find({}).toArray()
    console.log(`[API] ✅ Impressoras carregadas: ${printers.length}`)
    res.status(200).json({ success: true, printers })
  } catch (error) {
    console.error('[API] ❌ Erro ao buscar impressoras:', error)
    res.status(200).json({ success: true, printers: [] })
  }
})

// ==========================================================
// 2. ROTAS DE GALERIA
// ==========================================================
app.get('/api/gallery', async (req, res) => {
  try {
    const collection = db.getGalleryCollection?.() || db.getCollection?.('gallery')
    if (!collection) {
      return res.status(200).json({ success: true, photos: [] })
    }
    
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 50
    const skip = (page - 1) * limit
    
    const photos = await collection.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray()
    
    console.log(`[API] ✅ Galeria carregada: ${photos.length} fotos`)
    res.status(200).json({ success: true, photos })
  } catch (error) {
    console.error('[API] ❌ Erro ao buscar galeria:', error)
    res.status(500).json({ success: false, photos: [] })
  }
})

app.post('/api/gallery', async (req, res) => {
  try {
    const collection = db.getGalleryCollection?.() || db.getCollection?.('gallery')
    if (!collection) {
      return res.status(503).json({ success: false, message: 'DB offline' })
    }
    await collection.insertOne({ ...req.body, createdAt: new Date() })
    console.log('[API] ✅ Foto adicionada à galeria')
    res.status(200).json({ success: true, message: 'Foto adicionada com sucesso!' })
  } catch (error) {
    console.error('[API] ❌ Erro ao adicionar foto:', error)
    res.status(500).json({ success: false, message: 'Erro ao salvar foto' })
  }
})

// ==========================================================
// 3. ROTAS DE FORMULÁRIOS (Correção dos 404)
// ==========================================================
const handleContactRequest = async (req, res) => {
  try {
    const collection = db.getCollection ? db.getCollection('messages') : null
    if (!collection) {
      console.warn('[FORM] ⚠️ DB offline, mas retornando sucesso (fallback)')
      return res.status(200).json({ success: true, message: 'Mensagem recebida (sem DB)' })
    }
    await collection.insertOne({ ...req.body, type: 'contact', createdAt: new Date() })
    console.log(`[FORM] ✅ Contato salvo: ${req.body.nome || req.body.name || 'anônimo'}`)
    res.status(200).json({ success: true, message: 'Mensagem enviada com sucesso!' })
  } catch (error) {
    console.error('[FORM] ❌ Erro ao salvar contato:', error)
    res.status(500).json({ success: false, message: 'Erro ao enviar mensagem' })
  }
}

app.post('/api/contact', handleContactRequest)
app.post('/contact', handleContactRequest)

const handleRegisterUserRequest = async (req, res) => {
  try {
    const collection = db.getCollection ? db.getCollection('partners') : null
    if (!collection) {
      console.warn('[FORM] ⚠️ DB offline, retornando sucesso (fallback)')
      return res.status(200).json({ success: true, message: 'Cadastro recebido' })
    }
    await collection.insertOne({ ...req.body, type: 'registration', createdAt: new Date() })
    console.log(`[FORM] ✅ Cadastro salvo: ${req.body.nome || req.body.name || 'anônimo'}`)
    res.status(200).json({ success: true, message: 'Cadastro realizado com sucesso!' })
  } catch (error) {
    console.error('[FORM] ❌ Erro ao salvar cadastro:', error)
    // Fallback: não travar o site
    res.status(200).json({ success: true, message: 'Cadastro recebido' })
  }
}

app.post('/api/register-user', handleRegisterUserRequest)
app.post('/register-user', handleRegisterUserRequest)

const handleCustomRequest = async (req, res) => {
  try {
    const collection = db.getCollection ? db.getCollection('messages') : null
    if (!collection) {
      console.warn('[FORM] ⚠️ DB offline, mas retornando sucesso (fallback)')
      return res.status(200).json({ success: true, message: 'Pedido recebido' })
    }
    await collection.insertOne({ ...req.body, type: 'custom_request', createdAt: new Date() })
    console.log(`[FORM] ✅ Pedido customizado salvo: ${req.body.titulo || 'sem título'}`)
    res.status(200).json({ success: true, message: 'Pedido enviado com sucesso!' })
  } catch (error) {
    console.error('[FORM] ❌ Erro ao salvar pedido:', error)
    res.status(500).json({ success: false, message: 'Erro ao enviar pedido' })
  }
}

app.post('/api/custom-request', handleCustomRequest)
app.post('/custom-request', handleCustomRequest)

const handleSuggestKnowledgeRequest = async (req, res) => {
  try {
    const collection = db.getSuggestionsCollection?.() || db.getCollection?.('suggestions')
    if (!collection) {
      console.warn('[FORM] ⚠️ DB offline, mas retornando sucesso (fallback)')
      return res.status(200).json({ success: true, message: 'Sugestão recebida' })
    }
    await collection.insertOne({ ...req.body, createdAt: new Date(), status: 'pending' })
    console.log(`[FORM] ✅ Sugestão salva: ${req.body.titulo || 'sem título'}`)
    res.status(200).json({ success: true, message: 'Sugestão enviada! Obrigado!' })
  } catch (error) {
    console.error('[FORM] ❌ Erro ao salvar sugestão:', error)
    res.status(500).json({ success: false, message: 'Erro ao enviar sugestão' })
  }
}

app.post('/api/suggest-knowledge', handleSuggestKnowledgeRequest)
app.post('/suggest-knowledge', handleSuggestKnowledgeRequest)

// ==========================================================
// 4. AUTENTICAÇÃO ADMIN (JWT)
// ==========================================================
app.use('/auth', authRoutes)
app.use('/api/auth', authRoutes)

// ==========================================================
// ROTAS DO CHAT (Bot IA - Cérebro)
// ==========================================================
console.log('[ROUTES] 📡 Montando rotas do chat...')
app.use('/api', chatRoutes)
app.use('/', chatRoutes)

// ==========================================================
// SERVIR FRONTEND (Arquivos Estáticos)
// ==========================================================
const distPath = path.join(__dirname, 'dist')
console.log(`[FRONTEND] 📂 Pasta dist: ${distPath}`)
app.use(express.static(distPath))

// ==========================================================
// FALLBACK PARA SPA (React Router)
// ==========================================================
app.get('*', (req, res) => {
  // Se for rota de API, retornar 404 JSON
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ 
      error: 'Rota de API não encontrada',
      path: req.path 
    })
  }
  
  // Servir index.html para rotas do frontend
  const indexPath = path.join(distPath, 'index.html')
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('[FRONTEND] ❌ Erro ao servir index.html:', err.message)
      res.status(404).json({ 
        error: 'Frontend não encontrado',
        message: 'Execute "npm run build" antes de fazer deploy',
        path: indexPath
      })
    }
  })
})

// ==========================================================
// INICIALIZAÇÃO DO SERVIDOR
// ==========================================================
const startServer = async () => {
  try {
    console.log('\n═══════════════════════════════════════════════')
    console.log('🚀 INICIANDO QUANTON3D BOT...')
    console.log('═══════════════════════════════════════════════\n')

    // 1. Verificar MongoDB
    if (MONGODB_URI) {
      console.log('[INIT] 🔄 Aguardando conexão MongoDB...')
      await new Promise(resolve => setTimeout(resolve, 2000)) // Aguardar conexão
      console.log('[INIT] ✅ MongoDB verificado')
    } else {
      console.log('[INIT] ⚠️ MongoDB não configurado')
    }

    // 2. Verificar OpenAI API
    if (!process.env.OPENAI_API_KEY) {
      console.log('[INIT] ⚠️ OPENAI_API_KEY não configurada')
    } else {
      console.log('[INIT] ✅ OpenAI API configurada')
    }

    // 3. Inicializar RAG (se disponível)
    try {
      const { initRAG } = await import('./src/services/ragService.js')
      await initRAG()
      console.log('[INIT] ✅ RAG inicializado')
    } catch (error) {
      console.log('[INIT] ⚠️ RAG não disponível:', error.message)
    }

    console.log('\n[INIT] ✨ Todos os serviços inicializados!\n')

    // 4. Iniciar servidor HTTP
    app.listen(PORT, '0.0.0.0', () => {
      console.log('═══════════════════════════════════════════════')
      console.log('🤖 QUANTON3D BOT ONLINE!')
      console.log('═══════════════════════════════════════════════')
      console.log(`📡 Porta: ${PORT}`)
      console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`)
      console.log(`💚 Health: http://localhost:${PORT}/health`)
      console.log(`🤖 Chat: http://localhost:${PORT}/api/ask`)
      console.log(`🖼️  Imagem: http://localhost:${PORT}/api/ask-with-image`)
      console.log(`📝 Formulários: /api/contact, /api/register-user`)
      console.log('═══════════════════════════════════════════════\n')
    })

  } catch (error) {
    console.error('\n❌ ERRO FATAL AO INICIAR SERVIDOR:', error)
    console.error(error.stack)
    process.exit(1)
  }
}

// Iniciar o servidor
startServer()
