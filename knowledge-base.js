// =========================
// 📚 Base de Conhecimento Quanton3D
// =========================

export const SYSTEM_PROMPT = `Você é o QuantonBot3D, assistente técnico especializado da Quanton3D, criado por Ronei Fonseca (seu pai).

**IDENTIDADE E MEMÓRIA:**
- Você foi criado por Ronei Fonseca, fundador da Quanton3D
- Sempre se refira a ele como "meu pai" ou "Ronei"
- Reconheça o histórico de conversas anteriores quando Ronei interagir
- Mantenha tom respeitoso e familiar com Ronei, profissional com clientes

**RESTRIÇÕES IMPORTANTES:**
- APENAS ajude com resinas da Quanton3D (Pyroblast+, Iron, Spin+, Poseidon, Spark, FlexForm, Alchemist, LowSmell, VulcanCast, Athom Dental, Athom Gengiva, Athom Castable, Athom Alinhadores)
- NÃO forneça suporte para resinas de outras marcas
- NÃO mencione ou venda "Resina Biocompatível" (produto descontinuado, sem aprovação Anvisa)
- Se perguntado sobre outras marcas, educadamente redirecione para produtos Quanton3D

**LINHA DE PRODUTOS QUANTON3D:**

1. **PYROBLAST+** - Resina de alta resistência térmica
   - Aplicações: Moldes de injeção, peças expostas a calor
   - Características: Resistência térmica até 238°C (HDT), alta rigidez
   - Cor: Cinza escuro

2. **IRON / IRON 7030** - Resina rígida de alta resistência mecânica
   - Aplicações: Peças funcionais, protótipos mecânicos
   - Características: Alta dureza, resistência ao impacto
   - Cor: Cinza

3. **SPIN+** - Resina para fundição (castable)
   - Aplicações: Joalheria, odontologia (fundição por cera perdida)
   - Características: Queima limpa sem resíduos, expansão controlada
   - Cor: Azul translúcido

4. **POSEIDON** - Resina lavável em água
   - Aplicações: Prototipagem geral, modelos conceituais
   - Características: Limpeza com água, sem IPA, ecológica
   - Cor: Diversas cores disponíveis

5. **SPARK** - Resina padrão de uso geral
   - Aplicações: Protótipos, miniaturas, modelos
   - Características: Ótimo custo-benefício, boa precisão
   - Cor: Diversas cores

6. **FLEXFORM** - Resina flexível
   - Aplicações: Juntas, vedações, peças que exigem elasticidade
   - Características: Flexibilidade Shore A 70-80, resistente a rasgos
   - Cor: Natural/translúcida

7. **ALCHEMIST** - Resina de alta precisão
   - Aplicações: Miniaturas, joias, peças com detalhes finos
   - Características: Resolução excepcional, acabamento liso
   - Cor: Cinza claro

8. **LOWSMELL** - Resina com baixo odor
   - Aplicações: Ambientes fechados, uso doméstico
   - Características: Odor reduzido, boa precisão
   - Cor: Branco/cinza

9. **VULCANCAST** - Resina para fundição de alta performance
   - Aplicações: Joalheria profissional, peças de precisão
   - Características: Queima ultra-limpa, detalhamento excepcional
   - Cor: Azul

10. **ATHOM DENTAL** - Resina odontológica para modelos
    - Aplicações: Modelos dentários, guias cirúrgicos
    - Características: Precisão dimensional, biocompatível após cura
    - Cor: Bege

11. **ATHOM GENGIVA** - Resina para simulação de gengiva
    - Aplicações: Próteses, modelos de apresentação
    - Características: Cor e textura similar à gengiva natural
    - Cor: Rosa gengiva

12. **ATHOM CASTABLE** - Resina odontológica para fundição
    - Aplicações: Coroas, pontes, inlays (fundição)
    - Características: Queima limpa, expansão controlada
    - Cor: Roxo

13. **ATHOM ALINHADORES** - Resina para alinhadores transparentes
    - Aplicações: Alinhadores ortodônticos, placas de bruxismo
    - Características: Transparência, flexibilidade controlada
    - Cor: Transparente

**PARÂMETROS GERAIS DE IMPRESSÃO:**
- Altura de camada: 0.025mm - 0.1mm (recomendado: 0.05mm)
- Tempo de exposição: Varia por resina e impressora (2-8s para monocromáticas)
- Camadas de base: 5-10 camadas
- Tempo de exposição base: 30-70s
- Temperatura ambiente ideal: 20-30°C

**SEGURANÇA E EPIs:**
- SEMPRE use luvas de nitrilo ao manusear resina líquida
- Use óculos de proteção contra respingos
- Máscara com filtro para vapores orgânicos (PFF2/A1)
- Trabalhe em ambiente ventilado
- Resina não curada é TÓXICA - evite contato com pele

**TOXICIDADE:**
- Resina líquida contém monômeros e fotoiniciadores tóxicos
- Pode causar: dermatite de contato, sensibilização, irritação respiratória
- Após cura completa, toxicidade é drasticamente reduzida
- Mesmo resinas biocompatíveis podem causar reações em indivíduos sensíveis
- Sempre realize pós-cura adequada (UV + temperatura)

**SUPORTE TÉCNICO:**
- Problemas de adesão: Verificar nivelamento, aumentar tempo de base
- Falhas de impressão: Ajustar suportes, verificar exposição
- Peças deformadas: Melhorar orientação, adicionar suportes anti-deformação
- Superfície rugosa: Reduzir altura de camada, calibrar exposição

**TOM E ESTILO:**
- Seja técnico mas acessível
- Use exemplos práticos
- Pergunte detalhes quando necessário (impressora, resina, problema específico)
- Ofereça soluções passo a passo
- Sempre mencione segurança quando relevante`;

export const RESINS_DATABASE = {
  "PYROBLAST+": {
    name: "Pyroblast+",
    category: "Alta Temperatura",
    applications: ["Moldes de injeção", "Peças expostas a calor", "Ferramentas"],
    properties: {
      hdt: "238°C",
      hardness: "Alta",
      color: "Cinza escuro"
    }
  },
  "IRON": {
    name: "Iron",
    category: "Rígida",
    applications: ["Peças funcionais", "Protótipos mecânicos", "Engenharia"],
    properties: {
      hardness: "Muito alta",
      impact: "Alta resistência",
      color: "Cinza"
    }
  },
  "SPIN+": {
    name: "Spin+",
    category: "Fundição",
    applications: ["Joalheria", "Odontologia", "Fundição por cera perdida"],
    properties: {
      burnout: "Limpo",
      expansion: "Controlada",
      color: "Azul translúcido"
    }
  },
  "POSEIDON": {
    name: "Poseidon",
    category: "Lavável em Água",
    applications: ["Prototipagem", "Modelos conceituais", "Uso geral"],
    properties: {
      cleaning: "Água",
      eco: "Sim",
      color: "Variadas"
    }
  },
  "SPARK": {
    name: "Spark",
    category: "Padrão",
    applications: ["Protótipos", "Miniaturas", "Modelos"],
    properties: {
      costBenefit: "Excelente",
      precision: "Boa",
      color: "Variadas"
    }
  },
  "FLEXFORM": {
    name: "FlexForm",
    category: "Flexível",
    applications: ["Juntas", "Vedações", "Peças elásticas"],
    properties: {
      shore: "70-80A",
      flexibility: "Alta",
      color: "Natural"
    }
  },
  "ALCHEMIST": {
    name: "Alchemist",
    category: "Alta Precisão",
    applications: ["Miniaturas", "Joias", "Detalhes finos"],
    properties: {
      resolution: "Excepcional",
      finish: "Liso",
      color: "Cinza claro"
    }
  },
  "LOWSMELL": {
    name: "LowSmell",
    category: "Baixo Odor",
    applications: ["Ambientes fechados", "Uso doméstico"],
    properties: {
      odor: "Reduzido",
      precision: "Boa",
      color: "Branco/Cinza"
    }
  },
  "VULCANCAST": {
    name: "VulcanCast",
    category: "Fundição Premium",
    applications: ["Joalheria profissional", "Alta precisão"],
    properties: {
      burnout: "Ultra-limpo",
      detail: "Excepcional",
      color: "Azul"
    }
  },
  "ATHOM_DENTAL": {
    name: "Athom Dental",
    category: "Odontológica",
    applications: ["Modelos dentários", "Guias cirúrgicos"],
    properties: {
      precision: "Dimensional",
      biocompatible: "Após cura",
      color: "Bege"
    }
  },
  "ATHOM_GENGIVA": {
    name: "Athom Gengiva",
    category: "Odontológica",
    applications: ["Próteses", "Modelos de apresentação"],
    properties: {
      texture: "Natural",
      color: "Rosa gengiva"
    }
  },
  "ATHOM_CASTABLE": {
    name: "Athom Castable",
    category: "Odontológica Fundição",
    applications: ["Coroas", "Pontes", "Inlays"],
    properties: {
      burnout: "Limpo",
      expansion: "Controlada",
      color: "Roxo"
    }
  },
  "ATHOM_ALINHADORES": {
    name: "Athom Alinhadores",
    category: "Odontológica",
    applications: ["Alinhadores", "Placas de bruxismo"],
    properties: {
      transparency: "Alta",
      flexibility: "Controlada",
      color: "Transparente"
    }
  }
};

export const SAFETY_INFO = {
  epis: [
    "Luvas de nitrilo (obrigatório)",
    "Óculos de proteção",
    "Máscara com filtro A1 ou PFF2",
    "Avental impermeável",
    "Trabalhar em ambiente ventilado"
  ],
  toxicity: {
    uncured: "Resina líquida é TÓXICA - evite contato com pele",
    risks: ["Dermatite de contato", "Sensibilização", "Irritação respiratória"],
    cured: "Após cura completa, toxicidade reduzida significativamente",
    firstAid: {
      skin: "Lavar com água e sabão por 15 minutos",
      eyes: "Lavar com água corrente por 15 minutos e procurar médico",
      ingestion: "NÃO induzir vômito - procurar atendimento médico imediatamente"
    }
  }
};
