import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card.jsx'
import { Button } from '@/components/ui/button.jsx'
import { Input } from '@/components/ui/input.jsx'
import { X, Check, Clock, User, Phone, Calendar, MessageSquare, Users, TrendingUp, BarChart3, BookOpen, Plus, FileText, Beaker, Edit3, Mail, Camera, Image, Loader2, Eye, Trash2, Upload, AlertCircle } from 'lucide-react'

// URL Base do Servidor
const API_URL = 'https://quanton3d-bot-v2.onrender.com';

function PendingVisualItemForm({ item, onApprove, onDelete, canDelete }) {
  const [defectType, setDefectType] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [solution, setSolution] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleApproveClick = async () => {
    setIsSubmitting(true)
    try {
      const success = await onApprove(item._id, defectType, diagnosis, solution)
      if (success) {
        setDefectType('')
        setDiagnosis('')
        setSolution('')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-700 p-4 rounded-lg border">
      <div className="flex gap-4">
        <img 
          src={item.imageUrl} 
          alt="Foto pendente" 
          className="w-40 h-40 object-cover rounded-lg border flex-shrink-0"
        />
        <div className="flex-1 space-y-3">
          <div className="text-xs text-gray-500">
            Enviada em: {new Date(item.createdAt).toLocaleString('pt-BR')}
            {item.userName && <span className="ml-2">| Cliente: {item.userName}</span>}
          </div>
          <select
            value={defectType}
            onChange={(e) => setDefectType(e.target.value)}
            className="w-full p-2 border rounded-lg text-sm bg-white dark:bg-gray-600"
          >
            <option value="">Selecione o tipo de defeito...</option>
            <option value="problema de LCD">Problema de LCD / Tela</option>
            <option value="descolamento da base">Descolamento da base</option>
            <option value="falha de suportes">Falha de suportes</option>
            <option value="rachadura/quebra da peca">Rachadura/quebra da peca</option>
            <option value="falha de adesao entre camadas / delaminacao">Delaminacao</option>
            <option value="deformacao/warping">Deformacao/warping</option>
            <option value="problema de superficie/acabamento">Problema de superficie</option>
            <option value="excesso ou falta de cura">Excesso ou falta de cura</option>
            <option value="outro">Outro</option>
          </select>
          <textarea
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            placeholder="Diagnostico tecnico..."
            className="w-full p-2 border rounded-lg text-sm bg-white dark:bg-gray-600 min-h-[60px]"
          />
          <textarea
            value={solution}
            onChange={(e) => setSolution(e.target.value)}
            placeholder="Solucao recomendada..."
            className="w-full p-2 border rounded-lg text-sm bg-white dark:bg-gray-600 min-h-[60px]"
          />
          <div className="flex gap-2">
            <Button 
              size="sm"
              onClick={handleApproveClick}
              disabled={isSubmitting}
              className="bg-green-600 hover:bg-green-700"
            >
              <Check className="h-4 w-4 mr-1" />
              {isSubmitting ? 'Aprovando...' : 'Aprovar e Treinar'}
            </Button>
            {canDelete && (
              <Button 
                size="sm"
                variant="outline"
                onClick={() => onDelete(item._id)}
                className="text-red-600 border-red-300 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Descartar
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function AdminPanel({ onClose }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [accessLevel, setAccessLevel] = useState(null)
  const [password, setPassword] = useState('')
  const [activeTab, setActiveTab] = useState('metrics')
  const [metrics, setMetrics] = useState(null)
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  
  // Knowledge States
  const [knowledgeTitle, setKnowledgeTitle] = useState('')
  const [knowledgeContent, setKnowledgeContent] = useState('')
  const [addingKnowledge, setAddingKnowledge] = useState(false)
  const [knowledgeDocuments, setKnowledgeDocuments] = useState([])
  const [knowledgeLoading, setKnowledgeLoading] = useState(false)
  const [knowledgeDateStart, setKnowledgeDateStart] = useState('')
  const [knowledgeDateEnd, setKnowledgeDateEnd] = useState('')
  const [editingKnowledge, setEditingKnowledge] = useState(null)
  const [editKnowledgeTitle, setEditKnowledgeTitle] = useState('')
  const [editKnowledgeContent, setEditKnowledgeContent] = useState('')
  
  // Custom Requests & Messages
  const [customRequests, setCustomRequests] = useState([])
  const [editingSuggestion, setEditingSuggestion] = useState(null)
  const [editedText, setEditedText] = useState('')
  const [contactMessages, setContactMessages] = useState([])
  
  // Gallery
  const [galleryEntries, setGalleryEntries] = useState([])
  const [galleryLoading, setGalleryLoading] = useState(false)
  const [editingGalleryEntry, setEditingGalleryEntry] = useState(null)
  const [editGalleryData, setEditGalleryData] = useState({})
  const [savingGalleryEdit, setSavingGalleryEdit] = useState(false)

  // Visual RAG states
  const [visualKnowledge, setVisualKnowledge] = useState([])
  const [visualLoading, setVisualLoading] = useState(false)
  const [visualImage, setVisualImage] = useState(null)
  const [visualImagePreview, setVisualImagePreview] = useState(null)
  const [pendingVisualPhotos, setPendingVisualPhotos] = useState([])
  const [pendingVisualLoading, setPendingVisualLoading] = useState(false)
  const [visualDefectType, setVisualDefectType] = useState('')
  const [visualDiagnosis, setVisualDiagnosis] = useState('')
  const [visualSolution, setVisualSolution] = useState('')
  const [addingVisual, setAddingVisual] = useState(false)
  
  // Details Modals
  const [selectedResin, setSelectedResin] = useState(null)
  const [resinDetails, setResinDetails] = useState(null)
  const [resinDetailsLoading, setResinDetailsLoading] = useState(false)
  const [selectedClient, setSelectedClient] = useState(null)
  const [clientHistory, setClientHistory] = useState(null)
  const [clientHistoryLoading, setClientHistoryLoading] = useState(false)

  const ADMIN_PASSWORD = 'quanton3d2024'
  const TEAM_SECRET = 'suporte_quanton_2025'
  const isAdmin = accessLevel === 'admin'

  const handleLogin = () => {
    if (password === ADMIN_PASSWORD) {
      setAccessLevel('admin')
      setIsAuthenticated(true)
    } else if (password === TEAM_SECRET) {
      setAccessLevel('support')
      setIsAuthenticated(true)
    } else {
      alert('Senha incorreta!')
      return
    }
    loadAllData()
  }

  const loadAllData = () => {
    loadMetrics()
    loadSuggestions()
    loadCustomRequests()
    loadContactMessages()
    loadGalleryEntries()
    loadVisualKnowledge()
    loadPendingVisualPhotos()
    loadKnowledgeDocuments()
  }

  const loadMetrics = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/metrics?auth=quanton3d_admin_secret`)
      const data = await response.json()
      setMetrics(data.metrics)
    } catch (error) {
      console.error('Erro ao carregar métricas:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadSuggestions = async () => {
    try {
      const response = await fetch(`${API_URL}/suggestions?auth=quanton3d_admin_secret`)
      const data = await response.json()
      setSuggestions(data.suggestions || [])
    } catch (error) {
      console.error('Erro ao carregar sugestões:', error)
    }
  }

  const loadCustomRequests = async () => {
    try {
      const response = await fetch(`${API_URL}/custom-requests?auth=quanton3d_admin_secret`)
      const data = await response.json()
      setCustomRequests(data.requests || [])
    } catch (error) {
      console.error('Erro ao carregar pedidos customizados:', error)
    }
  }

  const loadContactMessages = async () => {
    try {
      const response = await fetch(`${API_URL}/api/contact?auth=quanton3d_admin_secret`)
      const data = await response.json()
      setContactMessages(data.messages || [])
    } catch (error) {
      console.error('Erro ao carregar mensagens de contato:', error)
    }
  }

  const toggleMessageResolved = async (messageId, currentResolved) => {
    try {
      const response = await fetch(`${API_URL}/api/contact/${messageId}?auth=quanton3d_admin_secret`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved: !currentResolved })
      })
      const data = await response.json()
      if (data.success) {
        loadContactMessages()
      } else {
        alert('Erro ao atualizar status: ' + data.error)
      }
    } catch (error) {
      console.error('Erro ao atualizar status da mensagem:', error)
      alert('Erro ao atualizar status da mensagem')
    }
  }

  const loadGalleryEntries = async () => {
    setGalleryLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/gallery/all?auth=quanton3d_admin_secret`)
      const data = await response.json()
      setGalleryEntries(data.entries || [])
    } catch (error) {
      console.error('Erro ao carregar galeria:', error)
    } finally {
      setGalleryLoading(false)
    }
  }

  const loadKnowledgeDocuments = async () => {
    setKnowledgeLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/knowledge?auth=quanton3d_admin_secret`)
      const data = await response.json()
      setKnowledgeDocuments(data.documents || [])
    } catch (error) {
      console.error('Erro ao carregar documentos de conhecimento:', error)
    } finally {
      setKnowledgeLoading(false)
    }
  }

  const deleteKnowledgeDocument = async (id) => {
    if (!isAdmin) {
      alert('Seu nivel de acesso nao permite excluir dados.')
      return
    }
    if (!confirm('Tem certeza que deseja deletar este documento?')) return
    try {
      const response = await fetch(`${API_URL}/api/knowledge/${id}?auth=quanton3d_admin_secret`, {
        method: 'DELETE'
      })
      const data = await response.json()
      if (data.success) {
        alert('Documento deletado com sucesso!')
        loadKnowledgeDocuments()
      } else {
        alert('Erro: ' + data.error)
      }
    } catch (error) {
      alert('Erro ao deletar documento')
    }
  }

  const openEditKnowledge = (doc) => {
    setEditingKnowledge(doc)
    setEditKnowledgeTitle(doc.title || '')
    setEditKnowledgeContent(doc.content || '')
  }

  const saveEditKnowledge = async () => {
    if (!editingKnowledge) return
    try {
      const response = await fetch(`${API_URL}/api/knowledge/${editingKnowledge._id}?auth=quanton3d_admin_secret`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editKnowledgeTitle, content: editKnowledgeContent })
      })
      const data = await response.json()
      if (data.success) {
        alert('Documento atualizado com sucesso!')
        setEditingKnowledge(null)
        loadKnowledgeDocuments()
      } else {
        alert('Erro: ' + data.error)
      }
    } catch (error) {
      alert('Erro ao atualizar documento')
    }
  }

  const getFilteredKnowledgeDocuments = () => {
    if (!knowledgeDateStart && !knowledgeDateEnd) return knowledgeDocuments
    return knowledgeDocuments.filter(doc => {
      if (!doc.createdAt) return true
      const docDate = new Date(doc.createdAt)
      if (knowledgeDateStart && docDate < new Date(knowledgeDateStart)) return false
      if (knowledgeDateEnd && docDate > new Date(knowledgeDateEnd + 'T23:59:59')) return false
      return true
    })
  }

  const loadVisualKnowledge = async () => {
    setVisualLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/visual-knowledge?auth=quanton3d_admin_secret`)
      const data = await response.json()
      setVisualKnowledge(data.documents || [])
    } catch (error) { console.error(error) } finally { setVisualLoading(false) }
  }

  const loadPendingVisualPhotos = async () => {
    setPendingVisualLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/visual-knowledge/pending?auth=quanton3d_admin_secret`)
      const data = await response.json()
      setPendingVisualPhotos(data.documents || [])
    } catch (error) { console.error(error) } finally { setPendingVisualLoading(false) }
  }

  const approvePendingVisual = async (id, defectType, diagnosis, solution) => {
    if (!defectType || !diagnosis || !solution) {
      alert('Preencha todos os campos antes de aprovar')
      return false
    }
    try {
      const response = await fetch(`${API_URL}/api/visual-knowledge/${id}/approve?auth=quanton3d_admin_secret`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defectType, diagnosis, solution })
      })
      const data = await response.json()
      if (data.success) {
        alert('Conhecimento visual aprovado com sucesso!')
        loadPendingVisualPhotos()
        loadVisualKnowledge()
        return true
      } else {
        alert('Erro: ' + data.error)
        return false
      }
    } catch (error) {
      alert('Erro ao aprovar')
      return false
    }
  }

  const deletePendingVisual = async (id) => {
    if (!isAdmin) return alert('Acesso negado')
    if (!confirm('Deletar foto pendente?')) return
    try {
      const response = await fetch(`${API_URL}/api/visual-knowledge/${id}?auth=quanton3d_admin_secret`, {
        method: 'DELETE'
      })
      const data = await response.json()
      if (data.success) {
        loadPendingVisualPhotos()
      } else {
        alert('Erro: ' + data.error)
      }
    } catch (error) {
      alert('Erro ao deletar')
    }
  }

  const addVisualKnowledgeEntry = async () => {
    if (!visualImage || !visualDefectType || !visualDiagnosis || !visualSolution) {
      alert('Preencha todos os campos e a foto')
      return
    }
    setAddingVisual(true)
    try {
      const formData = new FormData()
      formData.append('image', visualImage)
      formData.append('defectType', visualDefectType)
      formData.append('diagnosis', visualDiagnosis)
      formData.append('solution', visualSolution)

      const response = await fetch(`${API_URL}/api/visual-knowledge?auth=quanton3d_admin_secret`, {
        method: 'POST',
        body: formData
      })
      const data = await response.json()
      
      if (data.success) {
        alert('Conhecimento visual adicionado!')
        setVisualImage(null)
        setVisualImagePreview(null)
        setVisualDefectType('')
        setVisualDiagnosis('')
        setVisualSolution('')
        loadVisualKnowledge()
      } else {
        alert('Erro: ' + data.error)
      }
    } catch (error) {
      alert('Erro ao adicionar')
    } finally {
      setAddingVisual(false)
    }
  }

  const deleteVisualKnowledgeEntry= async (id) => {
    if (!isAdmin) return alert('Acesso negado')
    if (!confirm('Deletar conhecimento visual?')) return
    try {
      const response = await fetch(`${API_URL}/api/visual-knowledge/${id}?auth=quanton3d_admin_secret`, {
        method: 'DELETE'
      })
      const data = await response.json()
      if (data.success) {
        loadVisualKnowledge()
      } else {
        alert('Erro: ' + data.error)
      }
    } catch (error) {
      alert('Erro ao deletar')
    }
  }

  const loadResinDetails = async (resin) => {
    setSelectedResin(resin)
    setResinDetailsLoading(true)
    setResinDetails(null)
    try {
      const response = await fetch(`${API_URL}/metrics/resin-details?resin=${encodeURIComponent(resin)}&auth=quanton3d_admin_secret`)
      const data = await response.json()
      if (data.success) {
        setResinDetails(data)
      } else {
        alert('Erro ao carregar detalhes: ' + data.error)
        setSelectedResin(null)
      }
    } catch (error) {
      console.error('Erro ao carregar detalhes:', error)
      setSelectedResin(null)
    } finally {
      setResinDetailsLoading(false)
    }
  }

  const loadClientHistory = async (clientKey) => {
    setSelectedClient(clientKey)
    setClientHistoryLoading(true)
    setClientHistory(null)
    try {
      const response = await fetch(`${API_URL}/metrics/client-history?clientKey=${encodeURIComponent(clientKey)}&auth=quanton3d_admin_secret`)
      const data = await response.json()
      if (data.success) {
        setClientHistory(data)
      } else {
        alert('Erro ao carregar historico: ' + data.error)
        setSelectedClient(null)
      }
    } catch (error) {
      console.error('Erro ao carregar historico:', error)
      setSelectedClient(null)
    } finally {
      setClientHistoryLoading(false)
    }
  }

  const approveGalleryEntry = async (id) => {
    try {
      const response = await fetch(`${API_URL}/api/gallery/${id}/approve?auth=quanton3d_admin_secret`, { method: 'PUT' })
      const data = await response.json()
      if (data.success) loadGalleryEntries()
      else alert('Erro: ' + data.error)
    } catch (error) { alert('Erro ao aprovar') }
  }

  const rejectGalleryEntry = async (id) => {
    if (!isAdmin) return alert('Acesso negado')
    if (!confirm('Rejeitar foto?')) return
    try {
      const response = await fetch(`${API_URL}/api/gallery/${id}/reject?auth=quanton3d_admin_secret`, { method: 'PUT' })
      const data = await response.json()
      if (data.success) loadGalleryEntries()
      else alert('Erro: ' + data.error)
    } catch (error) { alert('Erro ao rejeitar') }
  }

  const openEditGallery = (entry) => {
    setEditingGalleryEntry(entry)
    setEditGalleryData({
      name: entry.name || '',
      resin: entry.resin || '',
      printer: entry.printer || '',
      comment: entry.comment || '',
      layerHeight: entry.layerHeight || '',
      baseLayers: entry.baseLayers || '',
      exposureTime: entry.exposureTime || '',
      baseExposureTime: entry.baseExposureTime || '',
      transitionLayers: entry.transitionLayers || '',
      uvOffDelay: entry.uvOffDelay || '',
      lowerLiftDistance1: entry.lowerLiftDistance1 || '',
      lowerLiftDistance2: entry.lowerLiftDistance2 || '',
      liftDistance1: entry.liftDistance1 || '',
      liftDistance2: entry.liftDistance2 || '',
      lowerRetractDistance1: entry.lowerRetractDistance1 || '',
      lowerRetractDistance2: entry.lowerRetractDistance2 || '',
      retractDistance1: entry.retractDistance1 || '',
      retractDistance2: entry.retractDistance2 || '',
      lowerLiftSpeed1: entry.lowerLiftSpeed1 || '',
      lowerLiftSpeed2: entry.lowerLiftSpeed2 || '',
      liftSpeed1: entry.liftSpeed1 || '',
      liftSpeed2: entry.liftSpeed2 || '',
      lowerRetractSpeed1: entry.lowerRetractSpeed1 || '',
      lowerRetractSpeed2: entry.lowerRetractSpeed2 || '',
      retractSpeed1: entry.retractSpeed1 || '',
      retractSpeed2: entry.retractSpeed2 || ''
    })
  }

  const saveGalleryEdit = async () => {
    if (!editingGalleryEntry) return
    setSavingGalleryEdit(true)
    try {
      const response = await fetch(`${API_URL}/api/gallery/${editingGalleryEntry._id}?auth=quanton3d_admin_secret`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editGalleryData)
      })
      const data = await response.json()
      if (data.success) {
        setEditingGalleryEntry(null)
        setEditGalleryData({})
        loadGalleryEntries()
        alert('Atualizado!')
      } else {
        alert('Erro: ' + data.error)
      }
    } catch (error) {
      alert('Erro ao atualizar')
    } finally {
      setSavingGalleryEdit(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-blue-950 flex items-center justify-center p-4">
        <Card className="p-8 max-w-md w-full">
          <h2 className="text-2xl font-bold mb-6 text-center bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Painel Administrativo
          </h2>
          <div className="space-y-4">
            <Input
              type="password"
              placeholder="Senha do painel"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
            />
            <Button onClick={handleLogin} className="w-full bg-gradient-to-r from-blue-600 to-purple-600">Entrar</Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-blue-950 p-4">
      <div className="container mx-auto max-w-7xl py-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Painel Administrativo
            </h1>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${isAdmin ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
              {isAdmin ? 'Admin' : 'Equipe'}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadAllData} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Atualizar Dados'}
            </Button>
            {onClose && <Button variant="ghost" onClick={onClose}><X className="h-5 w-5"/></Button>}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {[
            { id: 'metrics', label: 'Métricas', icon: BarChart3 },
            { id: 'suggestions', label: `Sugestões (${suggestions.length})`, icon: MessageSquare },
            { id: 'knowledge', label: 'Gestão de Conhecimento', icon: BookOpen },
            { id: 'visual', label: 'Treinamento Visual', icon: Eye },
            { id: 'gallery', label: 'Galeria', icon: Camera },
            { id: 'messages', label: `Mensagens (${contactMessages.length})`, icon: Mail },
            { id: 'custom', label: 'Formulações', icon: Beaker },
          ].map(tab => (
            <Button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              variant={activeTab === tab.id ? 'default' : 'outline'}
              className={activeTab === tab.id ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white' : ''}
            >
              <tab.icon className="h-4 w-4 mr-2" />
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Content */}
        {activeTab === 'metrics' && metrics && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-6">
                <div className="flex justify-between">
                  <div><p className="text-sm text-gray-500">Total de Conversas</p><p className="text-3xl font-bold text-blue-600">{metrics.conversations.total}</p></div>
                  <MessageSquare className="h-12 w-12 text-blue-100" />
                </div>
              </Card>
              <Card className="p-6">
                <div className="flex justify-between">
                  <div><p className="text-sm text-gray-500">Cadastros</p><p className="text-3xl font-bold text-green-600">{metrics.registrations.total}</p></div>
                  <Users className="h-12 w-12 text-green-100" />
                </div>
              </Card>
              <Card className="p-6">
                <div className="flex justify-between">
                  <div><p className="text-sm text-gray-500">Taxa de Conversão</p><p className="text-3xl font-bold text-purple-600">{metrics.conversations.total > 0 ? ((metrics.registrations.total / metrics.conversations.uniqueSessions) * 100).toFixed(1) : 0}%</p></div>
                  <TrendingUp className="h-12 w-12 text-purple-100" />
                </div>
              </Card>
            </div>

            <Card className="p-6">
              <h3 className="text-xl font-bold mb-4">📊 Perguntas Mais Frequentes</h3>
              <div className="space-y-2">
                {metrics.topQuestions.map((item, index) => (
                  <div key={index} className="flex justify-between p-3 bg-gray-50 rounded">
                    <span>{item.question}</span>
                    <span className="font-bold">{item.count}x</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-xl font-bold mb-4">🧪 Menções de Resinas</h3>
              <p className="text-sm text-gray-500 mb-4">Clique em uma resina para ver detalhes dos clientes</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(metrics.resinMentions).map(([resin, count]) => (
                  <div key={resin} onClick={() => loadResinDetails(resin)} className="bg-blue-50 p-4 rounded-lg text-center cursor-pointer hover:bg-blue-100 transition-colors">
                    <p className="text-sm font-medium">{resin}</p>
                    <p className="text-2xl font-bold text-blue-600">{count}</p>
                  </div>
                ))}
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="p-6">
                <h3 className="text-xl font-bold mb-4">👤 Top Clientes</h3>
                <div className="space-y-2">
                  {metrics.topClients.map((item, index) => (
                    <div key={index} className="flex justify-between p-2 bg-gray-50 rounded">
                      <span>{item.client}</span>
                      <div className="flex gap-2 items-center">
                        <span className="font-bold">{item.count}x</span>
                        <Button size="sm" variant="ghost" onClick={() => loadClientHistory(item.client)}><Eye className="h-4 w-4"/></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="p-6">
                <h3 className="text-xl font-bold mb-4">🔥 Tópicos</h3>
                <div className="flex flex-wrap gap-2">
                  {metrics.topTopics.map((item, index) => (
                    <span key={index} className="px-3 py-1 bg-gray-100 rounded-full text-sm">{item.topic} ({item.count})</span>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* SUGESTÕES */}
        {activeTab === 'suggestions' && (
          <div className="space-y-4">
            {suggestions.length === 0 ? (
              <Card className="p-12 text-center text-gray-500">Nenhuma sugestão pendente</Card>
            ) : (
              suggestions.map((sug) => (
                <Card key={sug.id} className="p-6 border-l-4 border-yellow-400">
                  <div className="flex justify-between mb-4">
                    <span className="font-bold">{sug.userName}</span>
                    <span className="text-xs text-gray-500">{new Date(sug.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded mb-2"><p className="text-xs font-bold text-gray-500">PERGUNTA</p><p>{sug.lastUserMessage}</p></div>
                  <div className="bg-gray-50 p-3 rounded mb-2"><p className="text-xs font-bold text-gray-500">RESPOSTA BOT</p><p>{sug.lastBotReply}</p></div>
                  <div className="bg-yellow-50 p-3 rounded mb-4"><p className="text-xs font-bold text-yellow-600">SUGESTÃO</p><p>{sug.suggestion}</p></div>
                  
                  {sug.status === 'pending' && (
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={async () => {
                        await fetch(`${API_URL}/reject-suggestion/${sug.id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ auth: 'quanton3d_admin_secret' }) });
                        loadSuggestions();
                      }}>Rejeitar</Button>
                      <Button className="bg-green-600 hover:bg-green-700" onClick={async () => {
                        await fetch(`${API_URL}/approve-suggestion/${sug.id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ auth: 'quanton3d_admin_secret' }) });
                        loadSuggestions();
                      }}>Aprovar</Button>
                    </div>
                  )}
                </Card>
              ))
            )}
          </div>
        )}

        {/* CONHECIMENTO TEXTO */}
        {activeTab === 'knowledge' && (
          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="font-bold mb-4 flex gap-2"><Plus className="h-5 w-5"/> Adicionar Conhecimento</h3>
              <Input className="mb-2" placeholder="Título" value={knowledgeTitle} onChange={e => setKnowledgeTitle(e.target.value)} />
              <textarea className="w-full border rounded p-2 mb-2 h-32" placeholder="Conteúdo..." value={knowledgeContent} onChange={e => setKnowledgeContent(e.target.value)} />
              <Button className="w-full bg-blue-600" disabled={addingKnowledge} onClick={async () => {
                if(!knowledgeTitle || !knowledgeContent) return alert('Preencha tudo');
                setAddingKnowledge(true);
                await fetch(`${API_URL}/add-knowledge`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ auth: 'quanton3d_admin_secret', title: knowledgeTitle, content: knowledgeContent }) });
                setAddingKnowledge(false); setKnowledgeTitle(''); setKnowledgeContent(''); alert('Adicionado!'); loadKnowledgeDocuments();
              }}>Salvar</Button>
            </Card>

            <Card className="p-6">
              <div className="flex justify-between mb-4">
                <h3 className="font-bold">Documentos ({getFilteredKnowledgeDocuments().length})</h3>
                <div className="flex gap-2">
                  <Input type="date" className="w-32" value={knowledgeDateStart} onChange={e => setKnowledgeDateStart(e.target.value)} />
                  <Input type="date" className="w-32" value={knowledgeDateEnd} onChange={e => setKnowledgeDateEnd(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {getFilteredKnowledgeDocuments().map(doc => (
                  <div key={doc._id} className="p-3 border rounded flex justify-between items-start group">
                    <div><p className="font-bold">{doc.title}</p><p className="text-xs text-gray-500">{new Date(doc.createdAt).toLocaleDateString()}</p><p className="text-xs line-clamp-1">{doc.content}</p></div>
                    {isAdmin && <div className="flex gap-1 opacity-0 group-hover:opacity-100"><Button size="sm" variant="ghost" onClick={() => openEditKnowledge(doc)}><Edit3 className="h-4 w-4"/></Button><Button size="sm" variant="ghost" onClick={() => deleteKnowledgeDocument(doc._id)}><Trash2 className="h-4 w-4 text-red-500"/></Button></div>}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* TREINAMENTO VISUAL */}
        {activeTab === 'visual' && (
          <div className="space-y-6">
            {pendingVisualPhotos.length > 0 && (
              <Card className="p-6 border-yellow-200 bg-yellow-50">
                <h4 className="font-bold text-yellow-800 mb-4">Fotos Pendentes ({pendingVisualPhotos.length})</h4>
                <div className="space-y-4">
                  {pendingVisualPhotos.map(item => (
                    <PendingVisualItemForm key={item._id} item={item} canDelete={isAdmin} onApprove={approvePendingVisual} onDelete={deletePendingVisual} />
                  ))}
                </div>
              </Card>
            )}

            <Card className="p-6">
              <h4 className="font-bold mb-4">Adicionar Exemplo Visual</h4>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="border-2 border-dashed rounded h-48 flex items-center justify-center relative">
                  <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => {
                    const file = e.target.files[0];
                    if(file) { setVisualImage(file); const r = new FileReader(); r.onload = () => setVisualImagePreview(r.result); r.readAsDataURL(file); }
                  }} />
                  {visualImagePreview ? <img src={visualImagePreview} className="h-full object-contain" /> : <p className="text-gray-400">Clique para selecionar</p>}
                </div>
                <div className="space-y-2">
                  <select className="w-full border rounded p-2" value={visualDefectType} onChange={e => setVisualDefectType(e.target.value)}>
                    <option value="">Tipo de Defeito...</option>
                    <option value="problema de LCD">LCD / Tela</option>
                    <option value="descolamento da base">Descolamento</option>
                    <option value="falha de suportes">Suportes</option>
                    <option value="delaminacao">Delaminação</option>
                    <option value="outro">Outro</option>
                  </select>
                  <textarea className="w-full border rounded p-2 h-20" placeholder="Diagnóstico" value={visualDiagnosis} onChange={e => setVisualDiagnosis(e.target.value)} />
                  <textarea className="w-full border rounded p-2 h-20" placeholder="Solução" value={visualSolution} onChange={e => setVisualSolution(e.target.value)} />
                  <Button className="w-full bg-purple-600" onClick={addVisualKnowledgeEntry} disabled={addingVisual}>{addingVisual ? 'Enviando...' : 'Adicionar'}</Button>
                </div>
              </div>
            </Card>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
               {visualKnowledge.map(item => (
                 <div key={item._id} className="relative group rounded-xl overflow-hidden shadow-sm border aspect-square">
                    <img src={item.imageUrl} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 text-center text-white">
                       <p className="font-bold text-sm mb-1">{item.defectType}</p>
                       <p className="text-xs line-clamp-2 mb-2">{item.diagnosis}</p>
                       {isAdmin && (
                         <Button size="sm" variant="destructive" onClick={() => deleteVisualKnowledgeEntry(item._id)}>Excluir</Button>
                       )}
                    </div>
                 </div>
               ))}
            </div>
          </div>
        )}

        {/* GALERIA */}
        {activeTab === 'gallery' && (
          <div className="space-y-4">
            {galleryEntries.filter(e => e.status !== 'rejected').map(entry => (
              <Card key={entry._id} className="p-4">
                <div className="flex gap-4">
                  <div className="flex gap-2 w-32">
                    {entry.images && entry.images.map((img, i) => (
                      <img key={i} src={img.url} className="w-16 h-16 object-cover rounded" />
                    ))}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <span className="font-bold">{entry.name}</span>
                      <span className={`px-2 rounded text-xs ${entry.status === 'pending' ? 'bg-yellow-100' : 'bg-green-100'}`}>{entry.status}</span>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">{entry.resin} | {entry.printer}</p>
                    {entry.comment && <p className="text-sm bg-gray-50 p-2 rounded mb-2">{entry.comment}</p>}
                    
                    {/* CAIXA AZUL DO MANUS */}
                    {(entry.layerHeight || entry.baseLayers || entry.exposureTime) && (
                      <div className="bg-blue-50 p-3 rounded text-xs text-blue-800 grid grid-cols-2 gap-2">
                        {entry.layerHeight && <div>Layer: {entry.layerHeight}</div>}
                        {entry.baseLayers && <div>Base: {entry.baseLayers}</div>}
                        {entry.exposureTime && <div>Exp: {entry.exposureTime}s</div>}
                        {entry.baseExposureTime && <div>Base Exp: {entry.baseExposureTime}s</div>}
                        {entry.liftSpeed1 && <div>Lift: {entry.liftSpeed1}/{entry.liftSpeed2}</div>}
                      </div>
                    )}

                    <div className="flex gap-2 mt-2">
                      {entry.status === 'pending' && (
                        <>
                          <Button size="sm" className="bg-green-600" onClick={() => approveGalleryEntry(entry._id)}>Aprovar</Button>
                          {isAdmin && <Button size="sm" variant="outline" onClick={() => rejectGalleryEntry(entry._id)}>Rejeitar</Button>}
                        </>
                      )}
                      {entry.status === 'approved' && isAdmin && (
                        <Button size="sm" variant="destructive" onClick={() => rejectGalleryEntry(entry._id)}>Apagar</Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* MODALS DE DETALHES */}
        {selectedResin && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-2xl p-6 h-[80vh] overflow-y-auto">
              <div className="flex justify-between mb-4"><h3 className="font-bold text-xl">{selectedResin}</h3><Button variant="ghost" onClick={() => setSelectedResin(null)}><X/></Button></div>
              {resinDetailsLoading ? <Loader2 className="animate-spin mx-auto"/> : (
                <div className="space-y-4">
                  {resinDetails?.customers?.map((c, i) => (
                    <div key={i} className="flex justify-between p-3 border rounded">
                      <div><p className="font-bold">{c.name}</p><p className="text-xs text-gray-500">{c.email}</p></div>
                      <p className="text-xs">{c.printer}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {selectedClient && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-2xl p-6 h-[80vh] overflow-y-auto">
              <div className="flex justify-between mb-4"><h3 className="font-bold text-xl">Histórico do Cliente</h3><Button variant="ghost" onClick={() => setSelectedClient(null)}><X/></Button></div>
              {clientHistoryLoading ? <Loader2 className="animate-spin mx-auto"/> : (
                <div className="space-y-4">
                  <div className="bg-blue-50 p-4 rounded"><p className="font-bold">{clientHistory?.client?.name}</p><p>{clientHistory?.client?.email}</p></div>
                  {clientHistory?.conversations?.map((conv, i) => (
                    <div key={i} className="border-l-4 border-blue-500 pl-4 py-2">
                      <p className="text-xs text-gray-500">{new Date(conv.timestamp).toLocaleString()}</p>
                      <p className="font-bold text-sm mt-1">{conv.prompt}</p>
                      <p className="text-sm text-gray-600 mt-1">{conv.reply}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Modal de Edição de Texto */}
        {editingKnowledge && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
             <Card className="w-full max-w-lg p-6">
                <h3 className="text-lg font-bold mb-4">Editar Texto</h3>
                <Input className="mb-4" value={editKnowledgeTitle} onChange={e => setEditKnowledgeTitle(e.target.value)} />
                <textarea className="w-full border rounded-lg p-2 h-40 mb-4" value={editKnowledgeContent} onChange={e => setEditKnowledgeContent(e.target.value)} />
                <div className="flex justify-end gap-2">
                   <Button variant="outline" onClick={() => setEditingKnowledge(null)}>Cancelar</Button>
                   <Button onClick={saveEditKnowledge}>Salvar</Button>
                </div>
             </Card>
          </div>
        )}

      </div>
    </div>
  )
}
