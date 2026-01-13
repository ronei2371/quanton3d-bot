diff --git a/src/routes/chatRoutes.js b/src/routes/chatRoutes.js
index 2c1c9e7dc1d2f94d3345c2b34dd7ecce4bf08a24..7ea961d31ad8cf5aee8f4191ad81e4c04e369b3b 100644
--- a/src/routes/chatRoutes.js
+++ b/src/routes/chatRoutes.js
@@ -93,120 +93,136 @@ function summarizeImagePayload(body = {}) {
 }
 
 function extractImageUrl(body = {}) {
   const normalized = resolveImagePayload(body);
   return normalized ? normalized.value : null;
 }
 
 function attachMultipartImage(req, res, next) {
   const files = req.files || {};
   const file =
     files.image?.[0] ||
     files.file?.[0] ||
     files.attachment?.[0];
 
   if (file?.buffer) {
     req.body = req.body ?? {};
     req.body.imageFile = {
       base64: file.buffer.toString('base64'),
       mimeType: file.mimetype
     };
   }
 
   next();
 }
 
-async function generateResponse({ message, imageSummary, imageUrl }) {
+async function generateResponse({ message, imageSummary, imageUrl, hasImage }) {
   const trimmedMessage = typeof message === 'string' ? message.trim() : '';
-  const ragResults = trimmedMessage ? await searchKnowledge(trimmedMessage) : [];
+  const ragQuery = trimmedMessage || (hasImage ? 'diagnostico visual impressao 3d resina defeitos comuns' : '');
+  const ragResults = ragQuery ? await searchKnowledge(ragQuery) : [];
   const ragContext = formatContext(ragResults);
+  const hasRelevantContext = ragResults.length > 0;
+  const adhesionIssueHint = /dificil|difícil|duro|presa|grudada|grudado/i.test(trimmedMessage)
+    && /mesa|plate|plataforma|base/i.test(trimmedMessage)
+    ? 'Nota de triagem: cliente relata peça muito presa na plataforma; evite sugerir AUMENTAR exposição base sem dados. Considere sobre-adesão e peça parâmetros antes de recomendar ajustes.'
+    : null;
 
   // --- AQUI ESTÁ A CORREÇÃO DA PERSONALIDADE ---
   const systemPrompt = `
     Você é a IA Oficial da Quanton3D, especialista técnica em resinas e impressão 3D.
     
     SUAS REGRAS DE OURO:
     1. JAMAIS cite fontes explicitamente como "(Fonte: Documento 1)" ou "[Doc 1]". Use o conhecimento naturalmente no texto.
     2. Seja cordial, direto e profissional. Aja como um consultor técnico experiente.
     3. Responda de forma objetiva (máximo de 6 a 8 linhas), com tópicos quando fizer sentido.
-    4. Se o usuário relatar falhas (como "peça sem definição"), aja como suporte técnico: analise as causas prováveis (cura, limpeza, parâmetros) baseando-se no contexto.
-    5. Se a resposta não estiver no contexto, diga que precisa de mais detalhes e sugira contato humano pelo WhatsApp (31) 98334-0053.
-    6. Não invente parâmetros nem diagnósticos; peça dados específicos quando necessário.
+    4. Só apresente causas prováveis quando houver CONTEXTO_RELEVANTE=SIM ou o cliente fornecer dados técnicos claros.
+    5. Se CONTEXTO_RELEVANTE=NAO, NÃO diagnostique. Peça informações objetivas (modelo da impressora, resina, tempo de exposição, altura de camada, velocidade de lift, temperatura, orientação/suportes) e ofereça ajuda humana no WhatsApp (31) 98334-0053.
+    6. Se IMAGEM=SIM, descreva rapidamente o que você observa sem afirmar a causa. Liste no máximo 2-3 hipóteses e peça dados antes de recomendar ajustes.
+    7. Só forneça valores numéricos quando o cliente informar impressora e resina, ou quando o contexto trouxer parâmetros explícitos.
+    8. Nunca mencione uma resina específica (ex: Pyroblast+) se o cliente não citou ou se não estiver no contexto.
+    9. Não invente parâmetros nem diagnósticos; peça dados específicos quando necessário.
   `;
 
   const prompt = [
     `Contexto Técnico (Use isso para basear sua resposta):\n${ragContext}`,
     '---',
+    `Sinalizadores: CONTEXTO_RELEVANTE=${hasRelevantContext ? 'SIM' : 'NAO'} | IMAGEM=${hasImage ? 'SIM' : 'NAO'}`,
     trimmedMessage ? `Cliente perguntou: ${trimmedMessage}` : 'Cliente enviou uma imagem.',
+    adhesionIssueHint,
     imageSummary ? `Detalhes da imagem: ${imageSummary}` : null,
   ].filter(Boolean).join('\n\n');
 
   const client = getOpenAIClient();
   const userContent = imageUrl
     ? [
         { type: 'text', text: prompt },
         { type: 'image_url', image_url: { url: imageUrl } }
       ]
     : prompt;
 
   const model = imageUrl ? DEFAULT_VISION_MODEL : DEFAULT_CHAT_MODEL;
 
   const completion = await client.chat.completions.create({
     model,
     temperature: 0.3,
     max_tokens: 500,
     messages: [
       { role: 'system', content: systemPrompt },
       { role: 'user', content: userContent }
     ]
   });
 
   const reply = completion?.choices?.[0]?.message?.content?.trim();
 
   return {
     reply: reply || 'Estou analisando sua solicitação, mas tive um breve soluço. Poderia repetir?',
     documentsUsed: ragResults.length
   };
 }
 
 async function handleChatRequest(req, res) {
   try {
     const { message, sessionId } = req.body ?? {};
     const trimmedMessage = typeof message === 'string' ? message.trim() : '';
     const resolvedImage = resolveImagePayload(req.body);
     const hasImage = Boolean(resolvedImage);
     const imageUrl = resolvedImage ? resolvedImage.value : null;
 
     console.log(`[CHAT] Msg: ${trimmedMessage.substring(0, 50)}...`);
 
     if (!trimmedMessage && !hasImage) {
       // Se não tem msg nem imagem, pode ser um "ping" de início de sessão
       return res.json({ reply: 'Olá! Sou a IA da Quanton3D. Como posso ajudar com suas impressões hoje?', sessionId: sessionId || 'new' });
     }
 
     const imageSummary = hasImage ? summarizeImagePayload(req.body) : '';
-    const response = await generateResponse({ message: trimmedMessage, imageSummary, imageUrl });
+    const response = await generateResponse({
+      message: trimmedMessage,
+      imageSummary,
+      imageUrl,
+      hasImage
+    });
 
     res.json({
       reply: response.reply,
       sessionId: sessionId || 'session-auto',
       documentsUsed: response.documentsUsed
     });
   } catch (error) {
     console.error('Erro Chat:', error);
     res.status(500).json({ error: 'Erro no processamento da IA.' });
   }
 }
 
 router.post('/ask', handleChatRequest);
 router.post('/chat', handleChatRequest);
 router.post(
   '/ask-with-image',
   upload.fields([
     { name: 'image', maxCount: 1 },
     { name: 'file', maxCount: 1 },
     { name: 'attachment', maxCount: 1 }
   ]),
   attachMultipartImage,
   handleChatRequest
 );
 
