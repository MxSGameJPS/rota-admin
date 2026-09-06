import { z } from 'zod';
import { caseSchema } from './contracts';

export const REPERCUSSION_LEVELS = ['COMUM', 'RELEVANTE', 'GRANDE_REPERCUSSAO', 'NACIONAL'];
export const PROCEDURAL_STAGES = ['PRIMEIRA_INSTANCIA', 'SEGUNDA_INSTANCIA', 'STJ', 'STF'];
export const APPEAL_TYPES = [
  'APELACAO',
  'AGRAVO_INSTRUMENTO',
  'AGRAVO_INTERNO',
  'RECURSO_ESPECIAL',
  'RECURSO_EXTRAORDINARIO',
  'AGRAVO_RECURSO_ESPECIAL',
  'AGRAVO_RECURSO_EXTRAORDINARIO',
  'OUTRO',
];
export const APPEAL_TRIGGERS = ['PLAYER_LOSS', 'PLAYER_WIN_OPPONENT_APPEALS', 'ANY_RESULT'];

export const REPERCUSSION_RULES = {
  COMUM: { xpMultiplier: 1, reputationBonus: 0 },
  RELEVANTE: { xpMultiplier: 1.25, reputationBonus: 2 },
  GRANDE_REPERCUSSAO: { xpMultiplier: 1.75, reputationBonus: 6 },
  NACIONAL: { xpMultiplier: 2.5, reputationBonus: 10 },
};

export const PROCEDURAL_STAGE_MIN_TIER = {
  PRIMEIRA_INSTANCIA: null,
  SEGUNDA_INSTANCIA: 'ADVOGADO_CONTRATADO',
  STJ: 'ADVOGADO_SENIOR',
  STF: 'ADVOGADO_SENIOR',
};

const CAREER_TIER_ORDER = [
  'ESTAGIARIO',
  'ESTAGIARIO_SENIOR',
  'ADVOGADO_CONTRATADO',
  'ADVOGADO_SENIOR',
  'SOCIO_ESCRITORIO',
  'DONO_ESCRITORIO',
  'MAGISTRADO_SUBSTITUTO',
  'JUIZ_TITULAR',
  'DESEMBARGADOR',
  'MINISTRO_STF',
];

export const caseProcessFieldsSchemaShape = {
  repercussionLevel: z.enum(REPERCUSSION_LEVELS).default('COMUM'),
  proceduralStage: z.enum(PROCEDURAL_STAGES).default('PRIMEIRA_INSTANCIA'),
  courtName: z.string().min(3).optional(),
  processKey: z.string().min(4).optional(),
  appealOfCaseId: z.string().min(4).optional(),
  appealType: z.enum(APPEAL_TYPES).optional(),
  appealTrigger: z.enum(APPEAL_TRIGGERS).optional(),
  appealDeadlineDays: z.number().int().positive().optional(),
};

export function validateCaseProcessData(data, ctx) {
  const isContinuation = Boolean(data.appealOfCaseId);
  const continuationFields = [
    ['appealType', data.appealType],
    ['appealTrigger', data.appealTrigger],
    ['appealDeadlineDays', data.appealDeadlineDays],
  ];

  if (!isContinuation) {
    for (const [field, value] of continuationFields) {
      if (value !== undefined) {
        ctx.addIssue({ code: 'custom', path: [field], message: `${field} só pode ser informado quando appealOfCaseId apontar para a fase anterior.` });
      }
    }
    return;
  }

  if (data.appealOfCaseId === data.id) {
    ctx.addIssue({ code: 'custom', path: ['appealOfCaseId'], message: 'Um recurso não pode apontar para a própria fase.' });
  }

  for (const [field, value] of continuationFields) {
    if (value === undefined) {
      ctx.addIssue({ code: 'custom', path: [field], message: `Continuações processuais precisam informar ${field}.` });
    }
  }
}

export const caseProcessSchema = caseSchema.extend(caseProcessFieldsSchemaShape).superRefine(validateCaseProcessData);

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function higherCareerTier(currentTier, requiredTier) {
  if (!requiredTier) return currentTier;
  const currentIndex = CAREER_TIER_ORDER.indexOf(currentTier);
  const requiredIndex = CAREER_TIER_ORDER.indexOf(requiredTier);
  if (requiredIndex < 0) return currentTier;
  if (currentIndex < 0 || currentIndex < requiredIndex) return requiredTier;
  return currentTier;
}

function inferRepercussion(text) {
  if (/\brepercussao nacional\b|\bnacional\b/.test(text)) return 'NACIONAL';
  if (/\bgrande repercussao\b|\bgrande_repercussao\b/.test(text)) return 'GRANDE_REPERCUSSAO';
  if (/\brepercussao relevante\b|\brelevante\b/.test(text)) return 'RELEVANTE';
  return 'COMUM';
}

function inferAppealType(text) {
  if (/agravo (?:em|de )?recurso extraordinario|agravo_recurso_extraordinario/.test(text)) return 'AGRAVO_RECURSO_EXTRAORDINARIO';
  if (/agravo (?:em|de )?recurso especial|agravo_recurso_especial/.test(text)) return 'AGRAVO_RECURSO_ESPECIAL';
  if (/recurso extraordinario|recurso_extraordinario/.test(text)) return 'RECURSO_EXTRAORDINARIO';
  if (/recurso especial|recurso_especial/.test(text)) return 'RECURSO_ESPECIAL';
  if (/agravo de instrumento|agravo_instrumento/.test(text)) return 'AGRAVO_INSTRUMENTO';
  if (/agravo interno|agravo_interno/.test(text)) return 'AGRAVO_INTERNO';
  if (/\bapelacao\b/.test(text)) return 'APELACAO';
  if (/\boutro recurso\b|\brecurso atipico\b/.test(text)) return 'OUTRO';
  return undefined;
}

function inferAppealTrigger(text) {
  if (/parte contraria (?:ja )?(?:recorreu|recorra|recorre)|oponente (?:recorreu|recorra)|player_win_opponent_appeals/.test(text)) return 'PLAYER_WIN_OPPONENT_APPEALS';
  if (/jogador (?:tenha )?perdid|jogador perder|decisao desfavoravel|player_loss/.test(text)) return 'PLAYER_LOSS';
  if (/qualquer resultado|independentemente do resultado|any_result/.test(text)) return 'ANY_RESULT';
  return undefined;
}

function inferDeadlineDays(text) {
  const match = text.match(/(?:prazo(?: recursal)?(?: de)?\s*)?(\d{1,3})\s*dias?\b/);
  return match ? Number(match[1]) : undefined;
}

function findMentionedCase(prompt, caseCatalog) {
  const text = normalizeText(prompt);
  return caseCatalog.find((item) => {
    const id = normalizeText(item.id);
    const code = normalizeText(item.code);
    const title = normalizeText(item.title);
    return (id && text.includes(id)) || (code && text.includes(code)) || (title.length >= 10 && text.includes(title));
  });
}

function inferProceduralStage(text, appealType) {
  if (/\bstf\b|supremo tribunal federal|primeira turma do supremo|segunda turma do supremo/.test(text)) return 'STF';
  if (/\bstj\b|superior tribunal de justica|turma do superior tribunal/.test(text)) return 'STJ';
  if (/segunda instancia|2a instancia|tribunal de justica|camara civel|camara criminal/.test(text)) return 'SEGUNDA_INSTANCIA';
  if (/primeira instancia|1a instancia/.test(text)) return 'PRIMEIRA_INSTANCIA';
  if (['RECURSO_EXTRAORDINARIO', 'AGRAVO_RECURSO_EXTRAORDINARIO'].includes(appealType)) return 'STF';
  if (['RECURSO_ESPECIAL', 'AGRAVO_RECURSO_ESPECIAL'].includes(appealType)) return 'STJ';
  if (['APELACAO', 'AGRAVO_INSTRUMENTO', 'AGRAVO_INTERNO'].includes(appealType)) return 'SEGUNDA_INSTANCIA';
  return 'PRIMEIRA_INSTANCIA';
}

function inferCourtName(prompt, stage) {
  const compact = String(prompt || '').replace(/\s+/g, ' ').trim();
  const explicit = compact.match(/(?:court_name|tribunal|orgao julgador)\s*[:=-]\s*([^.;\n]+)/i)?.[1]?.trim();
  if (explicit && explicit.length >= 3) return explicit;
  if (stage === 'STJ') return 'Superior Tribunal de Justiça';
  if (stage === 'STF') return 'Supremo Tribunal Federal';
  return undefined;
}

function looksLikeContinuation(text, appealType) {
  return Boolean(appealType) || /\bcontinuacao\b|\bcontinuidade\b|\bfase recursal\b|\brecurso da parte contraria\b/.test(text);
}

function referencedCaseIdCandidate(prompt) {
  return String(prompt || '').match(/\bcaso\s+([A-Z0-9][A-Z0-9_-]{3,})\b/)?.[1];
}

export function applyCaseProcessContract(model, prompt, caseCatalog = []) {
  const text = normalizeText(prompt);
  const appealType = inferAppealType(text);
  const parent = findMentionedCase(prompt, caseCatalog);
  const continuation = looksLikeContinuation(text, appealType) && Boolean(parent);
  const referencedId = referencedCaseIdCandidate(prompt);

  if (looksLikeContinuation(text, appealType) && referencedId && !parent) {
    throw new Error(`A fase anterior ${referencedId} não foi encontrada no acervo. Crie/publice a fase anterior ou confira o ID antes de gerar o recurso.`);
  }

  const proceduralStage = inferProceduralStage(text, appealType);
  const stageFloor = PROCEDURAL_STAGE_MIN_TIER[proceduralStage] || null;
  const appealTrigger = continuation ? (inferAppealTrigger(text) || 'ANY_RESULT') : undefined;
  const appealDeadlineDays = continuation ? (inferDeadlineDays(text) || 15) : undefined;

  return caseProcessSchema.parse({
    ...model,
    repercussionLevel: inferRepercussion(text),
    proceduralStage,
    courtName: inferCourtName(prompt, proceduralStage),
    processKey: continuation ? (parent.processKey || parent.id) : (model.processKey || model.id),
    appealOfCaseId: continuation ? parent.id : undefined,
    appealType: continuation ? (appealType || 'OUTRO') : undefined,
    appealTrigger,
    appealDeadlineDays,
    minCareerTier: higherCareerTier(model.minCareerTier, stageFloor),
  });
}

export function preserveCaseProcessContract(generated, current) {
  return caseProcessSchema.parse({
    ...generated,
    id: current.id,
    code: current.code,
    repercussionLevel: current.repercussionLevel || 'COMUM',
    proceduralStage: current.proceduralStage || 'PRIMEIRA_INSTANCIA',
    courtName: current.courtName,
    processKey: current.processKey || current.id,
    appealOfCaseId: current.appealOfCaseId,
    appealType: current.appealType,
    appealTrigger: current.appealTrigger,
    appealDeadlineDays: current.appealDeadlineDays,
    minCareerTier: current.minCareerTier,
    status: 'draft',
  });
}

export function buildCaseProcessGenerationPrompt(prompt, caseCatalog = []) {
  const catalog = caseCatalog.slice(-100).map((item) => ({
    id: item.id,
    code: item.code,
    title: item.title,
    processKey: item.processKey,
    proceduralStage: item.proceduralStage,
    repercussionLevel: item.repercussionLevel,
    minCareerTier: item.minCareerTier,
    status: item.status,
  }));

  return [
    prompt,
    'REGRAS DE CONTEXTO PROCESSUAL PARA A NARRATIVA:',
    '- XP e reputação pedidos são valores-base; não aumente recompensas por repercussão dentro do conteúdo gerado.',
    '- honorariosReward continua sendo definido normalmente pelo Admin.',
    '- Se o pedido for uma continuação/recurso, trate a narrativa como a mesma ação/processo em fase posterior, nunca como um novo litígio independente.',
    '- Em segunda instância, STJ ou STF, adapte fatos, objetivos, locais, estratégias e NPCs ao rito da fase recursal indicada.',
    catalog.length ? 'FASES EXISTENTES QUE PODEM SER CITADAS NO PEDIDO:' : '',
    catalog.length ? JSON.stringify(catalog) : '',
  ].filter(Boolean).join('\n\n');
}
