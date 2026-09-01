import { OAB_46_SCOPE, OAB_46_SCOPE_SUMMARY } from './oabBlueprint';

export const EXAM_TYPE_PRESETS = {
  oab_first_phase: {
    id: 'oab_first_phase',
    label: 'Exame da Ordem - 1ª Fase',
    questionCount: 80,
    fixedPassingScore: 40,
    fixedDurationMinutes: 300,
    targetLevels: false,
    eligibility: { careerStage: 'ESTAGIARIO_SENIOR' },
    scopeSummary: OAB_46_SCOPE_SUMMARY,
    instructions: 'Simulado objetivo de conhecimentos jurídicos gerais. Use o escopo do 46º EOU 2026 apenas como referência de distribuição e nível; nunca copie questões.',
  },
  mestrado: {
    id: 'mestrado',
    label: 'Mestrado',
    questionCount: 40,
    targetLevels: true,
    maxTargetLevel: 5,
    eligibility: {},
    scopeSummary: [],
    instructions: 'Avaliação acadêmica de Direito com 40 questões. O administrador define tema, linha de pesquisa, nível-alvo, duração e nota de corte.',
  },
  doutorado: {
    id: 'doutorado',
    label: 'Doutorado',
    questionCount: 40,
    targetLevels: true,
    maxTargetLevel: 5,
    eligibility: {},
    scopeSummary: [],
    instructions: 'Avaliação acadêmica avançada de Direito com 40 questões. Valorize pesquisa, teoria, precedentes, metodologia e problemas complexos.',
  },
  concurso_juiz: {
    id: 'concurso_juiz',
    label: 'Concurso para Juiz',
    questionCount: 20,
    targetLevels: false,
    eligibility: { minDoctorateLevel: 4 },
    scopeSummary: [],
    instructions: 'Concurso de 20 questões para magistratura. O jogador só pode prestar com Doutorado em nível 4 ou 5.',
  },
  concurso_desembargador: {
    id: 'concurso_desembargador',
    label: 'Concurso para Desembargador',
    questionCount: 20,
    targetLevels: false,
    eligibility: { minDoctorateLevel: 4 },
    scopeSummary: [],
    instructions: 'Concurso de 20 questões de alta complexidade para tribunal. O jogador só pode prestar com Doutorado em nível 4 ou 5.',
  },
};

export function getExamPreset(examType) {
  const preset = EXAM_TYPE_PRESETS[examType];
  if (!preset) throw new Error(`Tipo de exame não suportado: ${examType}`);
  return preset;
}

export function getExpectedQuestionScope(exam) {
  if (exam.examType === 'oab_first_phase') return OAB_46_SCOPE;
  return Array.from({ length: exam.questionCount }, (_, index) => ({ number: index + 1, area: null }));
}

export function getExamTypeOptions() {
  return Object.values(EXAM_TYPE_PRESETS).map((preset) => ({
    id: preset.id,
    label: preset.label,
    questionCount: preset.questionCount,
    targetLevels: Boolean(preset.targetLevels),
    maxTargetLevel: preset.maxTargetLevel || null,
    eligibility: preset.eligibility,
  }));
}
