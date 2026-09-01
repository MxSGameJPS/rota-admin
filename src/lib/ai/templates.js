function slugify(value) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || `npc-${Date.now()}`;
}
function cleanTitle(prompt, fallback) { return prompt.trim().replace(/\s+/g, ' ').slice(0, 86) || fallback; }

export function generateTemplate(entityType, prompt) {
  const now = Date.now();
  if (entityType === 'npc') {
    const name = 'NPC em Revisão';
    return {
      name, slug: `${slugify(name)}-${String(now).slice(-5)}`, roleType: 'outro', profession: 'Profissional do Direito', specialization: cleanTitle(prompt, 'A definir'), jurisdiction: '',
      professionalProfile: { yearsExperience: 10, background: `Perfil-base gerado a partir do briefing: ${prompt}`, proceduralStyle: 'Analítico e fundamentado.', priorities: ['coerência jurídica', 'prova', 'procedimento'] },
      personality: { formalism: 60, evidenceRigor: 70, urgencySensitivity: 55, conciliationOpenness: 45, proceduralErrorTolerance: 35, innovationOpenness: 50 },
      baseMemories: [{ summary: `Memória-base relacionada ao briefing: ${prompt}`, importance: 6, tags: ['base'] }],
      dialogueLibrary: [{ trigger: 'primeiro_contato', tone: 'profissional', text: 'Analisei os elementos apresentados. Prossiga com objetividade e fundamento.' }],
      decisionRules: [{ actionType: 'generic_legal_request', condition: 'Avaliar qualidade da fundamentação, prova e adequação processual.', weight: 50, rationale: 'Regra-base para revisão manual antes da publicação.' }],
      relationships: [], knowledge: [{ domain: 'Direito', level: 75, notes: 'Ajustar especialidade no editor.' }], metadata: { generationPrompt: prompt, generatedWith: 'template' }, status: 'draft',
    };
  }
  if (entityType === 'case') {
    return {
      id: `CASE_DRAFT_${now}`, code: `DRAFT-${String(now).slice(-7)}`, title: cleanTitle(prompt, 'Novo caso em revisão'), area: 'A definir', difficulty: 'Iniciante', difficultyStars: 1, deadlineHours: 48,
      honorariosReward: 1200, xpReward: 90, reputationReward: 4, minCareerTier: 'ESTAGIARIO',
      content: { client: { name: 'Cliente em revisão', summary: prompt }, briefing: { mainObjective: 'Completar o caso no editor antes da publicação.' }, locations: [], availableClues: [], strategies: [], socialJuridicoTools: [], minimumPassingScore: 70 },
      metadata: { generationPrompt: prompt, generatedWith: 'template' }, status: 'draft',
    };
  }
  return {
    id: `ITEM_${now}`, sku: `SKU-${String(now).slice(-8)}`, type: 'cosmetic', name: cleanTitle(prompt, 'Novo item'), description: `Item criado a partir do briefing: ${prompt}`, rarity: 'comum', priceCurrency: 'creditos', priceAmount: 100,
    effects: {}, content: {}, metadata: { generationPrompt: prompt, generatedWith: 'template' }, status: 'draft',
  };
}
