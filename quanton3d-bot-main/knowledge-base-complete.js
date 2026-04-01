// Base de conhecimento completa da Quanton3D
// Gerado automaticamente a partir dos arquivos fornecidos

const fs = require('fs');
const path = require('path');

// Carregar dados extraídos das resinas
let resinsData = {};
try {
  const dataPath = path.join(__dirname, '../resins_extracted.json');
  if (fs.existsSync(dataPath)) {
    resinsData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  }
} catch (error) {
  console.log('Dados de resinas não encontrados, usando dados padrão');
}

const COMPLETE_KNOWLEDGE = `
# BASE DE CONHECIMENTO COMPLETA - QUANTON3D

## INFORMAÇÕES GERAIS

A Quanton3D é especializada em resinas UV SLA de alta performance para impressão 3D.
Todas as resinas são fotopolimerizáveis e compatíveis com impressoras LCD e DLP (405nm).

Responsável Técnico: Wellington Venâncio (CRQ: 02419876 II Região)
Contato: (31) 3271-6935 | atendimento@quanton3d.com.br
Endereço: Av. Dom Pedro II, 5.056 – Jardim Montanhês, Belo Horizonte – MG – CEP: 30.750-000

---

## CATÁLOGO DE RESINAS QUANTON3D

### 1. PYROBLAST+ (Resina de Alta Temperatura)
**Aplicações:** Moldes para fundição, peças que suportam alta temperatura
**Características:**
- Alta precisão e dureza (Shore D: 73)
- Resistência térmica superior
- Módulo de Elasticidade: 827 MPa
- Tensão de Ruptura: 8.4 MPa
- Alongamento: 2%
- Viscosidade: Baixa (95 segundos - Copo Ford)
- Densidade: 1.296 g/cm³
- Odor: Médio
- pH: 6.8

**Parâmetros de Impressão:**
- Altura de camada: 0.05mm
- Exposição normal: 2-8s (monocromática)
- Exposição base: 35-70s
- Temperatura ideal: 18-35°C

**Pós-processamento:**
- Lavagem: Álcool isopropílico por 2-4 minutos
- Cura UV: Conforme potência da câmara

---

### 2. IRON / IRON 7030 (Resina Mecânica)
**Aplicações:** Peças funcionais, componentes mecânicos, protótipos resistentes
**Características:**
- Alta resistência mecânica
- Ótima durabilidade
- Ideal para peças que sofrem tensão

**Parâmetros de Impressão:**
- Altura de camada: 0.05mm
- Exposição normal: 2-6s (monocromática)
- Exposição base: 30-60s

---

### 3. SPIN+ (Resina para Fundição)
**Aplicações:** Joalheria, fundição de precisão, peças para cera perdida
**Características:**
- Queima limpa sem resíduos
- Alta precisão de detalhes
- Ideal para fundição em metal

**Parâmetros de Impressão:**
- Altura de camada: 0.05mm
- Exposição normal: 2-5s
- Exposição base: 30-50s

---

### 4. POSEIDON (Resina Lavável em Água)
**Aplicações:** Projetos ecológicos, uso doméstico, fácil limpeza
**Características:**
- Lavável em água (não requer álcool)
- Ecologicamente mais amigável
- Odor reduzido

**Parâmetros de Impressão:**
- Altura de camada: 0.05mm
- Exposição normal: 2-4s
- Exposição base: 30-45s
- Lavagem: Água corrente

---

### 5. SPARK (Resina de Uso Geral)
**Aplicações:** Protótipos, modelos gerais, peças decorativas
**Características:**
- Versátil e econômica
- Boa precisão
- Fácil de usar

**Parâmetros de Impressão:**
- Altura de camada: 0.05mm
- Exposição normal: 2-4s
- Exposição base: 30-40s

---

### 6. FLEXFORM (Resina Flexível)
**Aplicações:** Juntas, vedações, peças que requerem elasticidade
**Características:**
- Alta flexibilidade
- Resistente a rasgos
- Mantém elasticidade após cura

**Parâmetros de Impressão:**
- Altura de camada: 0.05mm
- Exposição normal: 3-6s
- Exposição base: 35-50s
- **IMPORTANTE:** Usar suportes com pontas maiores

---

### 7. ALCHEMIST (Resina de Alta Precisão)
**Aplicações:** Miniaturas, modelos detalhados, joias
**Características:**
- Altíssima precisão
- Detalhes extremamente finos
- Acabamento superior

**Parâmetros de Impressão:**
- Altura de camada: 0.025mm (camadas ultra-finas)
- Exposição normal: 2-4s
- Exposição base: 30-40s

---

### 8. LOWSMELL (Resina de Baixo Odor)
**Aplicações:** Uso doméstico, ambientes fechados
**Características:**
- Odor significativamente reduzido
- Ideal para uso em casa
- Mantém qualidade de impressão

**Parâmetros de Impressão:**
- Altura de camada: 0.05mm
- Exposição normal: 2-4s
- Exposição base: 30-40s

---

### 9. VULCANCAST (Resina Premium para Fundição)
**Aplicações:** Fundição de alta qualidade, joalheria premium
**Características:**
- Queima ultra-limpa
- Precisão excepcional
- Versão premium da linha de fundição

**Parâmetros de Impressão:**
- Altura de camada: 0.05mm
- Exposição normal: 2-5s
- Exposição base: 30-50s

---

### 10. ATHOM DENTAL (Resina Odontológica)
**Aplicações:** Modelos dentários, guias cirúrgicos, moldeiras
**Características:**
- Biocompatível para uso odontológico
- Alta precisão dimensional
- Cor bege/marfim

**Parâmetros de Impressão:**
- Altura de camada: 0.05mm
- Exposição normal: 2-4s
- Exposição base: 30-40s

---

### 11. ATHOM GENGIVA (Resina para Simulação de Gengiva)
**Aplicações:** Modelos com gengiva, próteses, demonstrações
**Características:**
- Cor rosa similar à gengiva
- Flexibilidade moderada
- Uso odontológico

**Parâmetros de Impressão:**
- Altura de camada: 0.05mm
- Exposição normal: 2-4s
- Exposição base: 30-40s

---

### 12. ATHOM CASTABLE (Resina Fundível Odontológica)
**Aplicações:** Coroas, pontes, inlays, onlays para fundição
**Características:**
- Queima limpa para fundição odontológica
- Alta precisão
- Uso profissional

**Parâmetros de Impressão:**
- Altura de camada: 0.05mm
- Exposição normal: 2-5s
- Exposição base: 30-50s

---

### 13. ATHOM ALINHADORES (Resina para Alinhadores)
**Aplicações:** Alinhadores transparentes, placas de bruxismo
**Características:**
- Transparência
- Biocompatível
- Flexibilidade controlada

**Parâmetros de Impressão:**
- Altura de camada: 0.05mm
- Exposição normal: 2-4s
- Exposição base: 30-40s

---

## AJUSTES PARA IMPRESSORAS RGB

**IMPORTANTE:** Para impressoras com tela RGB (colorida), multiplique os tempos de exposição por 3-5x.

Exemplo:
- Monocromática: 2-4s → RGB: 6-20s
- Base monocromática: 30-40s → Base RGB: 90-200s

---

## PROCEDIMENTOS GERAIS

### ANTES DE IMPRIMIR:
1. **Agitar vigorosamente** o frasco de resina
2. Verificar temperatura ambiente (18-35°C)
3. Nivelar a plataforma de impressão
4. Limpar o tanque e verificar FEP

### CALIBRAÇÃO:
1. Baixar arquivo CALIBRADOR.STL do site
2. Imprimir com parâmetros iniciais
3. A peça menor deve encaixar no furo 3
4. Se encaixar em 4-5: reduzir exposição
5. Se encaixar em 1-2: aumentar exposição

### PÓS-PROCESSAMENTO:
1. Remover peça da plataforma com espátula
2. Lavar em álcool isopropílico por 2-4 minutos
3. Secar completamente
4. Remover suportes
5. Curar em câmara UV ou luz solar

### ARMAZENAMENTO:
- Temperatura: 18-35°C
- Local ventilado
- Longe de luz solar direta
- Frasco bem fechado
- Validade: 12 meses

---

## SEGURANÇA E EPIs

### EPIs OBRIGATÓRIOS:
- Luvas nitrílicas
- Óculos de proteção
- Máscara com filtros contra vapores orgânicos e gases ácidos
- Avental impermeável químico

### PRIMEIROS SOCORROS:
**Contato com pele:**
- Não se expor à luz solar
- Remover excesso com papel
- Lavar com água e sabão neutro

**Contato com olhos:**
- Lavar com água corrente abundante
- Procurar médico se necessário

**Inalação:**
- Ir para local arejado
- Procurar médico se houver dificuldade respiratória

**Ingestão:**
- NÃO induzir vômito
- NÃO oferecer nada via oral
- Procurar médico imediatamente

---

## PROBLEMAS COMUNS E SOLUÇÕES

### Falha de aderência na plataforma:
- Aumentar tempo de exposição base
- Verificar nivelamento
- Aumentar número de camadas base

### Linhas horizontais na peça:
- Verificar e limpar FEP
- Limpar LCD
- Verificar estabilidade da impressora

### Peças frágeis:
- Aumentar tempo de exposição
- Verificar temperatura da resina
- Agitar bem a resina antes de usar

### Deformações:
- Melhorar posicionamento de suportes
- Inclinar peça adequadamente
- Verificar temperatura ambiente

### Suportes soltando:
- Usar suportes mais espessos
- Aumentar pontos de contato
- Para resinas flexíveis: usar pontas maiores

---

## TEMPERATURAS BAIXAS

Em regiões frias ou épocas de baixa temperatura:
- Pré-aquecer resina em banho-maria (máx 40°C)
- NUNCA usar micro-ondas
- Usar aquecedores elétricos de ar
- Manter impressora em ambiente aquecido

---

## CONTATO E SUPORTE

**WhatsApp:** (31) 3271-6935
**Email:** atendimento@quanton3d.com.br
**Horário:** Segunda a Sexta, 8h às 18h

**Suporte Técnico Inclui:**
- Calibração de impressora
- Diagnóstico de problemas
- Otimização de parâmetros
- Orientação de uso
- Chamadas de vídeo (agendamento)

---

## IMPORTANTE

- Todas as resinas são produtos químicos e devem ser manuseadas com cuidado
- MANTER FORA DO ALCANCE DE CRIANÇAS E ANIMAIS
- NÃO É PRODUTO PARA SAÚDE (exceto linha Athom com uso específico)
- Tóxico para organismos aquáticos - não descartar em água ou solo
- Consultar FISPQ completa para informações detalhadas de segurança

---

**NOTA:** Esta base de conhecimento é específica para resinas QUANTON3D. 
Não forneço suporte para resinas de outras marcas.
`;

module.exports = { COMPLETE_KNOWLEDGE, resinsData };
