import { useCallback, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card.jsx'
import { Button } from '@/components/ui/button.jsx'
import { Input } from '@/components/ui/input.jsx'
import { X, User, MessageSquare, BarChart3, BookOpen, Beaker, Edit3, Mail, Camera, Eye, Trash2, AlertCircle, Handshake, ShoppingBag } from 'lucide-react'
import { toast } from 'sonner'
import { PartnersManager } from './PartnersManager.jsx'
import { MetricsTab } from './admin/MetricsTab.jsx'
import { SuggestionsTab } from './admin/SuggestionsTab.jsx'
import { OrdersTab } from './admin/OrdersTab.jsx'
import { GalleryTab } from './admin/GalleryTab.jsx'
import { DocumentsTab } from './admin/DocumentsTab.jsx'
import { ContactsTab } from './admin/ContactsTab.jsx'

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
    <div className="bg-white dark:bg-gray-700 p-4 rounded-lg border mb-4">
      <div className="flex gap-4">
        <img src={item.imageUrl} alt="Pendente" className="w-40 h-40 object-cover rounded-lg border" />
        <div className="flex-1 space-y-3">
          <select value={defectType} onChange={(e) => setDefectType(e.target.value)} className="w-full p-2 border rounded-lg text-sm bg-white dark:bg-gray-600">
            <option value="">Selecione o defeito...</option>
            <option value="descolamento da base">Descolamento da base</option>
            <option value="falha de suportes">Falha de suportes</option>
            <option value="rachadura/quebra da peca">Rachadura/quebra da peca</option>
            <option value="delaminacao">Delaminação</option>
            <option value="outro">Outro</option>
          </select>
          <textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="Diagnóstico técnico..." className="w-full p-2 border rounded-lg text-sm bg-white dark:bg-gray-600" />
          <textarea value={solution} onChange={(e) => setSolution(e.target.value)} placeholder="Solução recomendada..." className="w-full p-2 border rounded-lg text-sm bg-white dark:bg-gray-600" />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleApproveClick} disabled={isSubmitting} className="bg-green-600 hover:bg-green-700 text-white">Aprovar e Treinar ELIO</Button>
            {canDelete && <Button size="sm" variant="outline" onClick={() => onDelete(item._id)} className="text-red-600">Descartar</Button>}
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
  const [loading, setLoading] = useState(false)

  const [metricsRefreshKey, setMetricsRefreshKey] = useState(0)
  const [suggestionsCount, setSuggestionsCount] = useState(0)
  const [ordersPendingCount, setOrdersPendingCount] = useState(0)
  const [customRequests, setCustomRequests] = useState([])
  const [contactCount, setContactCount] = useState(0)
  const [knowledgeRefreshKey, setKnowledgeRefreshKey] = useState(0)

  const [pendingVisualPhotos, setPendingVisualPhotos] = useState([])

  const [paramsResins, setParamsResins] = useState([])
  const [paramsPrinters, setParamsPrinters] = useState([])
  const [paramsProfiles, setParamsProfiles] = useState([])
  const [paramsLoading, setParamsLoading] = useState(false)
  const [newResinName, setNewResinName] = useState('')

  const API_BASE_URL = useMemo(() => {
    const raw = import.meta.env.VITE_API_URL || window.location.origin
    return String(raw).replace(/\/api\/?$/, '').replace(/\/+$/, '')
  }, [])

  const buildAdminUrl = useCallback((path) => {
    const cleanPath = path.replace(/^\/+/, '').replace(/^api\//, '')
    return `${API_BASE_URL}/api/${cleanPath}`
  }, [API_BASE_URL])

  const ADMIN_PASSWORD = 'Rmartins1201'
  const TEAM_SECRET = 'suporte_quanton_2025'
  const isAdmin = accessLevel === 'admin'

  const loadCustomRequests = async () => {
    try {
      const res = await fetch(buildAdminUrl('/custom-requests'))
      const data = await res.json()
      setCustomRequests(data.requests || [])
    } catch (err) {
      console.error(err)
    }
  }

  const loadPendingVisualPhotos = async () => {
    try {
      const res = await fetch(buildAdminUrl('/visual-knowledge/pending'))
      const data = await res.json()
      setPendingVisualPhotos(data.documents || data.pending || [])
    } catch (err) {
      console.error(err)
    }
  }

  const loadParamsData = async () => {
    setParamsLoading(true)
    try {
      const [resRes, priRes, proRes] = await Promise.all([
        fetch(buildAdminUrl('/params/resins')),
        fetch(buildAdminUrl('/params/printers')),
        fetch(buildAdminUrl('/params/profiles')),
      ])
      const [resData, priData, proData] = await Promise.all([resRes.json(), priRes.json(), proRes.json()])
      if (resData.success) setParamsResins(resData.resins || [])
      if (priData.success) setParamsPrinters(priData.printers || [])
      if (proData.success) setParamsProfiles(proData.profiles || [])
    } finally {
      setParamsLoading(false)
    }
  }

  const refreshAllData = async () => {
    setLoading(true)
    try {
      await Promise.all([loadCustomRequests(), loadPendingVisualPhotos(), loadParamsData()])
      setMetricsRefreshKey((k) => k + 1)
      setKnowledgeRefreshKey((k) => k + 1)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async () => {
    if (password === ADMIN_PASSWORD) {
      setAccessLevel('admin')
      setIsAuthenticated(true)
    } else if (password === TEAM_SECRET) {
      setAccessLevel('support')
      setIsAuthenticated(true)
    } else {
      toast.error('Senha incorreta!')
      return
    }
    await refreshAllData()
  }

  const addResin = async () => {
    if (!newResinName.trim()) return
    await fetch(buildAdminUrl('/params/resins'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newResinName.trim() }),
    })
    setNewResinName('')
    await loadParamsData()
    toast.success('Resina salva!')
  }

  const deleteResin = async (id) => {
    if (!isAdmin) return
    if (confirm('Deletar resina e perfis?')) {
      await fetch(buildAdminUrl(`/params/resins/${id}`), { method: 'DELETE' })
      await loadParamsData()
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
        <Card className="p-8 max-w-md w-full space-y-4">
          <h2 className="text-2xl font-bold text-center bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Quanton3D Admin</h2>
          <Input type="password" placeholder="Sua senha pessoal" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
          <Button onClick={handleLogin} className="w-full bg-blue-600 hover:bg-blue-700">Entrar no Sistema</Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4">
      <div className="max-w-7xl mx-auto py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Painel Administrativo Quanton3D</h1>
          <div className="flex gap-2">
            <Button onClick={refreshAllData} disabled={loading} size="sm">{loading ? '...' : 'Atualizar Dados'}</Button>
            <Button onClick={onClose} variant="outline" size="sm"><X className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-8 bg-white dark:bg-gray-900 p-2 rounded-xl shadow-sm border">
          <Button onClick={() => setActiveTab('metrics')} variant={activeTab === 'metrics' ? 'default' : 'ghost'} size="sm"><BarChart3 className="h-4 w-4 mr-2" /> Métricas</Button>
          <Button onClick={() => setActiveTab('messages')} variant={activeTab === 'messages' ? 'default' : 'ghost'} size="sm"><Mail className="h-4 w-4 mr-2" /> Mensagens ({contactCount})</Button>
          <Button onClick={() => setActiveTab('custom')} variant={activeTab === 'custom' ? 'default' : 'ghost'} size="sm"><Beaker className="h-4 w-4 mr-2" /> Fórmulas ({customRequests.length})</Button>
          <Button onClick={() => setActiveTab('suggestions')} variant={activeTab === 'suggestions' ? 'default' : 'ghost'} size="sm"><MessageSquare className="h-4 w-4 mr-2" /> Sugestões ({suggestionsCount})</Button>
          <Button onClick={() => setActiveTab('orders')} variant={activeTab === 'orders' ? 'default' : 'ghost'} size="sm"><ShoppingBag className="h-4 w-4 mr-2" /> Pedidos ({ordersPendingCount})</Button>
          <Button onClick={() => setActiveTab('visual')} variant={activeTab === 'visual' ? 'default' : 'ghost'} size="sm"><Eye className="h-4 w-4 mr-2" /> Treino Visual</Button>
          <Button onClick={() => setActiveTab('gallery')} variant={activeTab === 'gallery' ? 'default' : 'ghost'} size="sm"><Camera className="h-4 w-4 mr-2" /> Galeria</Button>
          <Button onClick={() => setActiveTab('knowledge')} variant={activeTab === 'knowledge' ? 'default' : 'ghost'} size="sm"><BookOpen className="h-4 w-4 mr-2" /> Conhecimento</Button>
          <Button onClick={() => setActiveTab('partners')} variant={activeTab === 'partners' ? 'default' : 'ghost'} size="sm"><Handshake className="h-4 w-4 mr-2" /> Parceiros</Button>
          <Button onClick={() => setActiveTab('params')} variant={activeTab === 'params' ? 'default' : 'ghost'} size="sm"><Edit3 className="h-4 w-4 mr-2" /> Parâmetros</Button>
        </div>

        {activeTab === 'metrics' && <MetricsTab buildAdminUrl={buildAdminUrl} refreshKey={metricsRefreshKey} />}
        {activeTab === 'messages' && <ContactsTab buildAdminUrl={buildAdminUrl} isVisible={true} onCountChange={setContactCount} />}
        {activeTab === 'knowledge' && <DocumentsTab isAdmin={isAdmin} refreshKey={knowledgeRefreshKey} />}
        {activeTab === 'suggestions' && <SuggestionsTab buildAdminUrl={buildAdminUrl} isAdmin={isAdmin} isVisible={true} onCountChange={setSuggestionsCount} />}
        {activeTab === 'orders' && <OrdersTab buildAdminUrl={buildAdminUrl} isAdmin={isAdmin} isVisible={true} onCountChange={setOrdersPendingCount} />}

        {activeTab === 'custom' && (
          <div className="grid gap-4">
            {customRequests.length === 0 && <p className="text-center py-10 opacity-50">Nenhuma fórmula customizada pedida ainda.</p>}
            {customRequests.map((req, i) => (
              <Card key={i} className="p-4 flex justify-between items-center hover:shadow-md transition-shadow">
                <div className="flex gap-4 items-center">
                  <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center"><User className="h-5 w-5" /></div>
                  <div>
                    <p className="font-bold">{req.name} - Resina {req.cor}</p>
                    <p className="text-xs text-gray-500">Deseja: {req.caracteristica}</p>
                  </div>
                </div>
                <Button size="sm" className="bg-green-600" onClick={() => window.open(`https://wa.me/55${String(req.phone || '').replace(/\D/g, '')}`)}>Chamar no WhatsApp</Button>
              </Card>
            ))}
          </div>
        )}

        {activeTab === 'visual' && (
          <div className="space-y-6">
            <h3 className="font-bold text-xl flex items-center gap-2"><AlertCircle className="text-yellow-500" /> Fotos enviadas para o ELIO analisar</h3>
            {pendingVisualPhotos.length === 0 && <Card className="p-10 text-center opacity-50">Nenhuma foto pendente no momento.</Card>}
            {pendingVisualPhotos.map((p) => (
              <PendingVisualItemForm key={p._id} item={p} onApprove={() => {}} onDelete={() => {}} canDelete={isAdmin} />
            ))}
          </div>
        )}

        {activeTab === 'params' && (
          <div className="space-y-6">
            <Card className="p-6 border-blue-200 dark:border-blue-800">
              <h3 className="font-bold mb-4 flex items-center gap-2"><Beaker className="text-blue-500" /> Gerenciar Catálogo de Resinas</h3>
              <div className="flex gap-2 mb-6">
                <Input placeholder="Nome da Resina (Ex: ABS-Like)" value={newResinName} onChange={(e) => setNewResinName(e.target.value)} />
                <Button onClick={addResin} className="bg-blue-600">Adicionar Resina</Button>
              </div>
              {paramsLoading ? <p>Carregando...</p> : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {paramsResins.map((r) => (
                    <div key={r.id} className="p-3 border rounded-lg bg-white dark:bg-gray-800 flex justify-between items-center group">
                      <span className="font-medium">{r.name}</span>
                      <Trash2 className="h-4 w-4 cursor-pointer text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteResin(r.id)} />
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-500 mt-4">Impressoras: {paramsPrinters.length} | Perfis: {paramsProfiles.length}</p>
            </Card>
          </div>
        )}

        {activeTab === 'gallery' && <GalleryTab isAdmin={isAdmin} isVisible={true} />}
        {activeTab === 'partners' && <PartnersManager />}
      </div>
    </div>
  )
}

export default AdminPanel
