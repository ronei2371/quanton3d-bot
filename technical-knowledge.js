// Conhecimento Técnico Avançado - Fatiadores e Parâmetros
// Para uso no bot Quanton3D

export const SLICER_KNOWLEDGE = `
# GUIA COMPLETO DE FATIADORES 3D (SLICERS)

## O QUE É UM FATIADOR (SLICER)?

Um fatiador é um software que converte modelos 3D (arquivos STL, OBJ) em instruções que a impressora 3D consegue entender. Ele "fatia" o modelo em camadas horizontais e gera um arquivo com todas as configurações necessárias para impressão.

---

## PRINCIPAIS FATIADORES PARA RESINA

### 1. CHITUBOX (Mais Popular)
**Vantagens:**
- Gratuito e fácil de usar
- Interface intuitiva
- Suporta maioria das impressoras
- Atualizações frequentes

**Desvantagens:**
- Algumas funções avançadas são pagas (Pro)
- Pode ter bugs ocasionais

**Download:** www.chitubox.com

---

### 2. LYCHEE SLICER
**Vantagens:**
- Geração automática de suportes muito boa
- Interface moderna
- Simulação de impressão em tempo real

**Desvantagens:**
- Versão gratuita tem limitações
- Mais pesado que Chitubox

**Download:** mango3d.io/lychee-slicer

---

### 3. PRUSA SLICER
**Vantagens:**
- Totalmente gratuito e open-source
- Muito estável
- Ótimos perfis pré-configurados

**Desvantagens:**
- Interface menos intuitiva para iniciantes
- Foco maior em impressoras Prusa

---

## ENTENDENDO ALTURA DE CAMADA

### O QUE É ALTURA DE CAMADA?

É a espessura de cada fatia horizontal que a impressora vai curar. Medida em milímetros (mm).

**Exemplo:** 0.05mm significa que cada camada tem 0,05 milímetros de altura.

---

### VARIAÇÕES DE ALTURA DE CAMADA

#### **0.025mm (25 microns) - ULTRA DETALHADO**
- **Uso:** Miniaturas, joias, peças com detalhes extremamente finos
- **Vantagens:** Máxima qualidade, detalhes microscópicos
- **Desvantagens:** MUITO lento (dobro do tempo), arquivo grande
- **Tempo de exposição:** REDUZIR em 20-30% (ex: 2s → 1.4-1.6s)
- **Resinas recomendadas:** Alchemist, Spin+, VulcanCast

#### **0.05mm (50 microns) - PADRÃO RECOMENDADO** ⭐
- **Uso:** 90% das impressões, uso geral
- **Vantagens:** Ótimo equilíbrio qualidade/velocidade
- **Desvantagens:** Nenhuma significativa
- **Tempo de exposição:** Valores padrão (2-4s monocromática)
- **Resinas:** TODAS as resinas Quanton3D

#### **0.1mm (100 microns) - RÁPIDO**
- **Uso:** Protótipos rápidos, peças grandes, testes
- **Vantagens:** Metade do tempo de impressão
- **Desvantagens:** Linhas de camada visíveis, menos detalhes
- **Tempo de exposição:** AUMENTAR em 50-100% (ex: 2s → 3-4s)
- **Resinas recomendadas:** Iron, Spark, Poseidon

---

### REGRA DE OURO: ALTURA X TEMPO DE EXPOSIÇÃO

**QUANTO MAIOR A CAMADA → MAIS TEMPO DE EXPOSIÇÃO**
**QUANTO MENOR A CAMADA → MENOS TEMPO DE EXPOSIÇÃO**

**Por quê?**
- Camadas mais grossas precisam de mais luz UV para curar completamente
- Camadas mais finas curam mais rápido pois são mais finas

**Tabela de Referência (Impressoras Monocromáticas):**

| Altura | Tempo Base | Tempo Normal | Observação |
|--------|-----------|--------------|------------|
| 0.025mm | 25-50s | 1.5-2.5s | Muito delicado |
| 0.05mm | 30-40s | 2-4s | **PADRÃO** |
| 0.1mm | 40-60s | 3-6s | Mais robusto |

**Para RGB (telas coloridas):** Multiplicar por 3-5x

---

## PARÂMETROS PRINCIPAIS DO CHITUBOX

### 1. LAYER HEIGHT (Altura de Camada)
- **O que é:** Espessura de cada camada
- **Onde ajustar:** Print Settings → Layer Height
- **Valores comuns:** 0.025mm, 0.05mm, 0.1mm
- **Dica:** Use 0.05mm para 90% dos casos

---

### 2. BOTTOM LAYERS (Camadas Base)
- **O que é:** Primeiras camadas que aderem à plataforma
- **Onde ajustar:** Print Settings → Bottom Layers
- **Valores recomendados:** 5-8 camadas
- **Dica:** Aumentar se peças estão soltando da plataforma

---

### 3. EXPOSURE TIME (Tempo de Exposição)
- **O que é:** Quanto tempo a luz UV fica ligada por camada
- **Onde ajustar:** Print Settings → Exposure Time
- **Valores Quanton3D (mono):** 2-4 segundos
- **Dica:** Começar com 2.5s e ajustar conforme calibração

---

### 4. BOTTOM EXPOSURE (Exposição Base)
- **O que é:** Tempo de exposição das camadas base
- **Onde ajustar:** Print Settings → Bottom Exposure
- **Valores recomendados:** 30-40 segundos (mono)
- **Dica:** Mais tempo = melhor aderência

---

### 5. LIFT DISTANCE (Distância de Elevação)
- **O que é:** Quanto a plataforma sobe após cada camada
- **Onde ajustar:** Print Settings → Lift Distance
- **Valores comuns:** 5-8mm
- **Dica:** Reduzir para 4-5mm em peças pequenas (mais rápido)

---

### 6. LIFT SPEED (Velocidade de Elevação)
- **O que é:** Velocidade que a plataforma sobe
- **Onde ajustar:** Print Settings → Lift Speed
- **Valores recomendados:** 
  - Subida: 60-80 mm/min
  - Descida: 150-180 mm/min
- **Dica:** Mais lento = menos chance de falhas, mas mais demorado

---

### 7. RETRACT SPEED (Velocidade de Retração)
- **O que é:** Velocidade que a plataforma desce
- **Onde ajustar:** Print Settings → Retract Speed
- **Valores recomendados:** 150-200 mm/min
- **Dica:** Pode ser mais rápido que lift speed

---

### 8. LIGHT-OFF DELAY (Atraso de Desligamento)
- **O que é:** Tempo de espera após desligar a luz UV
- **Onde ajustar:** Print Settings → Light-off Delay
- **Valores recomendados:** 1-3 segundos
- **Dica:** Dar tempo para resina fluir de volta

---

### 9. TRANSITION LAYERS (Camadas de Transição)
- **O que é:** Camadas intermediárias entre base e normal
- **Onde ajustar:** Print Settings → Transition Layers
- **Valores recomendados:** 3-5 camadas
- **Dica:** Suaviza transição entre tempos diferentes

---

### 10. ANTI-ALIASING (Suavização)
- **O que é:** Suaviza bordas das camadas
- **Onde ajustar:** Print Settings → Anti-Aliasing
- **Valores:** 2, 4, 8 (quanto maior, mais suave)
- **Dica:** Usar 4 ou 8 para melhor qualidade

---

## SUPORTES (SUPPORTS)

### TIPOS DE SUPORTES

#### **LIGHT (Leve)**
- Pontas pequenas: 0.3-0.4mm
- Corpo fino: 0.6-0.8mm
- **Uso:** Miniaturas, peças delicadas
- **Remoção:** Fácil, marcas mínimas

#### **MEDIUM (Médio)** ⭐ RECOMENDADO
- Pontas médias: 0.4-0.5mm
- Corpo médio: 0.8-1.2mm
- **Uso:** Maioria das impressões
- **Remoção:** Moderada

#### **HEAVY (Pesado)**
- Pontas grandes: 0.5-0.6mm
- Corpo grosso: 1.5-2.0mm
- **Uso:** Peças grandes, resinas flexíveis
- **Remoção:** Difícil, deixa marcas

---

### ONDE COLOCAR SUPORTES?

1. **Ilhas:** Partes flutuantes sem conexão
2. **Overhangs:** Ângulos maiores que 45°
3. **Pontas finas:** Dedos, antenas, espadas
4. **Áreas planas grandes:** Para evitar sucção

**DICA:** Inclinar peça 30-45° reduz necessidade de suportes

---

### CONFIGURAÇÕES DE SUPORTES NO CHITUBOX

- **Contact Depth:** 0.3-0.5mm (profundidade na peça)
- **Contact Diameter:** 0.3-0.5mm (tamanho da ponta)
- **Support Diameter:** 0.8-1.2mm (corpo do suporte)
- **Platform Touch Diameter:** 1.5-2.0mm (base na plataforma)

---

## ORIENTAÇÃO DA PEÇA

### REGRAS DE ORIENTAÇÃO

1. **Inclinar 30-45°:** Reduz sucção e melhora qualidade
2. **Detalhes para cima:** Parte mais importante longe da plataforma
3. **Evitar áreas planas grandes:** Causam sucção no FEP
4. **Minimizar suportes em faces visíveis:** Menos marcas

---

## HOLLOW (OCAR PEÇA)

### QUANDO OCAR?

- Peças grandes (economiza resina)
- Modelos sólidos pesados
- Reduzir tempo de impressão

### CONFIGURAÇÕES

- **Wall Thickness:** 2-3mm (espessura da parede)
- **Infill:** 0% (completamente oco)
- **Drain Holes:** 2-4 furos de 3-5mm (para resina sair)

**IMPORTANTE:** SEMPRE fazer furos de drenagem!

---

## CALIBRAÇÃO DE EXPOSIÇÃO

### MÉTODO DO CALIBRADOR QUANTON3D

1. Baixar arquivo CALIBRADOR.STL do site
2. Fatiar com parâmetros iniciais
3. Imprimir
4. Verificar qual número encaixa no furo 3
5. Ajustar:
   - Encaixa em 4-5: REDUZIR exposição
   - Encaixa em 1-2: AUMENTAR exposição
   - Encaixa em 3: PERFEITO! ✓

---

## PROBLEMAS COMUNS E SOLUÇÕES

### Peça não adere na plataforma
- ✅ Aumentar Bottom Exposure (+10s)
- ✅ Aumentar Bottom Layers (+2 camadas)
- ✅ Verificar nivelamento

### Linhas horizontais visíveis
- ✅ Reduzir altura de camada (0.05 → 0.025mm)
- ✅ Ativar Anti-Aliasing (nível 8)
- ✅ Limpar FEP e LCD

### Suportes quebrando
- ✅ Usar suportes mais grossos (Medium/Heavy)
- ✅ Aumentar Contact Depth
- ✅ Adicionar mais pontos de suporte

### Peça deformada
- ✅ Melhorar orientação (inclinar mais)
- ✅ Adicionar suportes em áreas críticas
- ✅ Reduzir Lift Speed

### Detalhes não aparecem
- ✅ Aumentar Exposure Time (+0.5s)
- ✅ Reduzir altura de camada
- ✅ Verificar qualidade do arquivo STL

---

## DICAS PROFISSIONAIS

1. **Sempre salve seus perfis:** Quando achar configurações perfeitas, salve!
2. **Teste com peças pequenas:** Antes de imprimir grande, teste parâmetros
3. **Anote tudo:** Mantenha registro de configurações que funcionaram
4. **Limpe o tanque:** Filtrar resina entre impressões melhora qualidade
5. **Temperatura importa:** Resina fria (< 20°C) precisa mais exposição

---

## ATALHOS DO CHITUBOX

- **Delete:** Remover objeto selecionado
- **Ctrl + D:** Duplicar objeto
- **F:** Focar na seleção
- **Ctrl + Z:** Desfazer
- **Ctrl + Y:** Refazer
- **Ctrl + A:** Selecionar tudo
- **S:** Adicionar suportes automáticos

---

**LEMBRE-SE:** Cada resina e impressora é única. Use este guia como ponto de partida e ajuste conforme necessário!
`;

module.exports = { SLICER_KNOWLEDGE };
