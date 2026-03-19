// =====================================================
// FIX CHAT - OVERRIDE DE EMERGÊNCIA
// Sobrescreve as funções antigas do chat para usar as rotas corretas
// =====================================================

(function() {
  'use strict';
  
  console.log('🔧 [FIX] Carregando correções de chat...');
  
  const API_BASE_URL = 'https://quanton3d-bot-v2.onrender.com';
  
  // =====================================================
  // OVERRIDE: Função de enviar mensagem
  // =====================================================
  
  function getSessionId() {
    let sessionId = sessionStorage.getItem('quanton3d_session_id');
    if (!sessionId) {
      sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('quanton3d_session_id', sessionId);
    }
    return sessionId;
  }
  
  // OVERRIDE da função sendMessage (se existir)
  if (window.sendMessage) {
    console.log('🔧 [FIX] Sobrescrevendo sendMessage()');
    const originalSendMessage = window.sendMessage;
    
    window.sendMessage = async function(message, additionalData = {}) {
      try {
        console.log('📤 [FIX] Enviando mensagem via rota corrigida:', message);
        
        const response = await fetch(`${API_BASE_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: message,
            sessionId: getSessionId(),
            ...additionalData
          })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('✅ [FIX] Resposta recebida:', data);
        
        return {
          success: true,
          reply: data.reply || data.response,
          data: data
        };
      } catch (error) {
        console.error('❌ [FIX] Erro:', error);
        return {
          success: false,
          error: error.message,
          reply: 'Erro ao conectar com a IA. Tente novamente.'
        };
      }
    };
  }
  
  // OVERRIDE da função sendImageWithMessage (se existir)
  if (window.sendImageWithMessage) {
    console.log('🔧 [FIX] Sobrescrevendo sendImageWithMessage()');
    
    window.sendImageWithMessage = async function(imageFile, message = '', additionalData = {}) {
      try {
        console.log('📤 [FIX] Enviando imagem via rota corrigida');
        
        // Converter para base64
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(imageFile);
        });
        
        const response = await fetch(`${API_BASE_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: message || 'Analisar imagem',
            sessionId: getSessionId(),
            image: base64,
            hasImage: true,
            ...additionalData
          })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('✅ [FIX] Imagem processada:', data);
        
        return {
          success: true,
          reply: data.reply || data.response,
          data: data
        };
      } catch (error) {
        console.error('❌ [FIX] Erro ao processar imagem:', error);
        return {
          success: false,
          error: error.message,
          reply: 'Erro ao processar imagem. Tente novamente.'
        };
      }
    };
  }
  
  // OVERRIDE do apiClient (se existir)
  if (window.apiClient) {
    console.log('🔧 [FIX] Sobrescrevendo apiClient');
    
    window.apiClient.sendMessage = async function(message, sessionId, additionalData = {}) {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          sessionId: sessionId || getSessionId(),
          ...additionalData
        })
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    };
    
    window.apiClient.API_BASE_URL = API_BASE_URL;
  }
  
  // Criar funções globais se não existirem
  if (!window.sendMessage) {
    console.log('🔧 [FIX] Criando sendMessage() global');
    
    window.sendMessage = async function(message, additionalData = {}) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: message,
            sessionId: getSessionId(),
            ...additionalData
          })
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        return {
          success: true,
          reply: data.reply || data.response,
          data: data
        };
      } catch (error) {
        console.error('❌ [FIX] Erro:', error);
        return {
          success: false,
          reply: 'Erro ao conectar com a IA.'
        };
      }
    };
  }
  
  console.log('✅ [FIX] Correções aplicadas com sucesso!');
  console.log('📡 [FIX] Backend URL:', API_BASE_URL);
  
})();
