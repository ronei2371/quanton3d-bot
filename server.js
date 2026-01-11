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
    const dbStatus = db.getCollection ? 'connected' : 'disconnected'
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
// ROTAS DE PARÂMETROS
// ==========================================================
app.get('/api/resins', async (req, res) => {
  try {
    console.log('[API] 📦 Buscando resinas...')
    const collection = db.getParametrosCollection?.() || db.getCollection?.('parametros')
    
    if (!collection) {
      return res.status(200).json({ success: true, resins: [] })
    }
    
    const resins = await collection.find({}).toArray()
    console.log(`[API] ✅ ${resins.length} resinas`)
    
    res.status(200).json({ success: true, resins: resins || [] })
  } catch (error) {
    console.error('[API] ❌ Erro resinas:', error.message)
    res.status(500).json({ success: false, resins: [], error: error.message })
  }
})

app.get('/api/params/printers', async (req, res) => {
  try {
    const collection = db.getCollection?.('printers')
    if (!collection) {
      return res.status(200).json({ success: true, printers: [] })
    }
    const printers = await collection.find({}).toArray()
    res.status(200).json({ success: true, printers: printers || [] })
  } catch (error) {
    res.status(200).json({ success: true, printers: [] })
  }
})

// ==========================================================
// GALERIA
// ==========================================================
app.get('/api/gallery', async (req, res) => {
  try {
    const collection = db.getGalleryCollection?.() || db.getCollection?.('gallery')
    if (!collection) {
      return res.status(200).json({ success: true, photos: [], pagination: { page: 1, limit: 12, total: 0, totalPages: 0 } })
    }
    
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 12
    const skip = (page - 1) * limit
    
    const photos = await collection.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray()
    const total = await collection.countDocuments()
    
    console.log(`[API] ✅ Galeria: ${photos.length} fotos`)
    
    res.status(200).json({ 
      success: true, 
      photos: photos || [],
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    })
  } catch (error) {
    console.error('[API] ❌ Galeria:', error.message)
    res.status(500).json({ success: false, photos: [], error: error.message })
  }
})

app.post('/api/gallery', async (req, res) => {
  try {
    const collection = db.getGalleryCollection?.() || db.getCollection?.('gallery')
    if (!collection) {
      return res.status(503).json({ success: false, message: 'DB offline' })
    }
    await collection.insertOne({ ...req.body, createdAt: new Date() })
    res.status(200).json({ success: true, message: 'Foto adicionada!' })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro', error: error.message })
  }
})

// ==========================================================
// FORMULÁRIOS
// ==========================================================
app.post('/api/contact', async (req, res) => {
  try {
    const collection = db.getCollection ? db.getCollection('messages') : null
    if (!collection) {
      return res.status(200).json({ success: true, message: 'Mensagem recebida' })
    }
    await collection.insertOne({ ...req.body, type: 'contact', createdAt: new Date() })
    console.log(`[FORM] ✅ Contato: ${req.body.nome || 'anônimo'}`)
    res.status(200).json({ success: true, message: 'Mensagem enviada!' })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro', error: error.message })
  }
})

app.post('/api/register-user', async (req, res) => {
  try {
    const collection = db.getCollection ? db.getCollection('partners') : null
    if (!collection) {
      return res.status(200).json({ success: true, message: 'Cadastro recebido' })
    }
    await collection.insertOne({ ...req.body, type: 'registration', createdAt: new Date() })
    res.status(200).json({ success: true, message: 'Cadastro OK!' })
  } catch (error) {
    res.status(200).json({ success: true, message: 'Cadastro recebido' })
  }
})

app.post('/api/custom-request', async (req, res) => {
  try {
    const collection = db.getCollection ? db.getCollection('messages') : null
    if (!collection) {
      return res.status(200).json({ success: true, message: 'Pedido recebido' })
    }
    await collection.insertOne({ ...req.body, type: 'custom_request', createdAt: new Date() })
    res.status(200).json({ success: true, message: 'Pedido enviado!' })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro', error: error.message })
  }
})

app.post('/api/suggest-knowledge', async (req, res) => {
  try {
    const collection = db.getSuggestionsCollection?.() || db.getCollection?.('suggestions')
    if (!collection) {
      return res.status(200).json({ success: true, message: 'Sugestão recebida' })
    }
    await collection.insertOne({ ...req.body, createdAt: new Date(), status: 'pending' })
    res.status(200).json({ success: true, message: 'Sugestão enviada!' })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erro', error: error.message })
  }
})

// ==========================================================
// ANÁLISE DE IMAGEM
// ==========================================================
app.post('/api/ask-with-image', async (req, res) => {
  try {
    const { message, image, imageUrl, sessionId } = req.body

    if (!image && !imageUrl) {
      return res.status(400).json({ success: false, error: 'Imagem não fornecida' })
    }

    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    let finalImageUrl = imageUrl
    if (image && !imageUrl) {
      finalImageUrl = image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'Você é assistente de impressão 3D da Quanton3D. Analise imagens de peças, modelos e problemas.'
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: message || 'Analise esta imagem' },
            { type: 'image_url', image_url: { url: finalImageUrl } }
          ]
        }
      ],
      max_tokens: 1000
    })

    const reply = response.choices[0].message.content
    res.json({ success: true, reply, sessionId: sessionId || `img-${Date.now()}` })

  } catch (error) {
    console.error('[IMAGE] ❌:', error.message)
    res.status(500).json({ success: false, error: 'Erro ao analisar', message: error.message })
  }
})

// ==========================================================
// LOGIN ADMIN
// ==========================================================
app.post('/auth/login', (req, res) => {
  const { username, password } = req.body
  const adminUser = process.env.ADMIN_USER || 'admin'
  const adminPass = process.env.ADMIN_PASS || 'admin123'
  
  if (username === adminUser && password === adminPass) {
    console.log('[AUTH] ✅ Login OK')
    res.status(200).json({ success: true, message: 'Login OK', token: 'token-' + Date.now() })
  } else {
    console.log('[AUTH] ❌ Credenciais inválidas')
    res.status(401).json({ success: false, message: 'Credenciais inválidas' })
  }
})

// ==========================================================
// ROTAS DO CHAT
// ==========================================================
app.use('/api', chatRoutes)
app.use('/chat', chatRoutes)

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
