import { getAIContract } from '@/schemas/contracts';
import { generateTemplate } from './templates';
import { generateWithDefaultProvider } from '@/services/ai/providerService';

function buildCaseNpcRules(context = {}) {
  const publishedNpcs = Array.isArray(context.publishedNpcs) ? context.publishedNpcs : [];
  return [
    'REGRA CRÍTICA SOBRE NPCs EM CASOS:',
    '- Um caso NÃO cria NPCs persistentes. NPCs persistentes são criados e publicados separadamente no módulo de NPCs.',
    '- Cliente, réu, testemunhas, familiares, empregados, vizinhos e outros personagens próprios daquele caso devem permanecer dentro do conteúdo do caso e NÃO devem ser colocados em content.npcAssignments.',
    '- Por padrão, content.npcAssignments deve ser [].',
    '- Use npcAssignments somente quando o caso realmente precisar de um NPC persistente já existente no universo, por exemplo juiz, desembargador, promotor, advogado anterior ou outro personagem recorrente.',
    '- Quando usar npcAssignments, use SOMENTE npcSlug existente no catálogo publicado abaixo. Nunca invente nomes, slugs ou NPCs.',
    '- Se o briefing exigir obrigatoriamente um NPC persistente/processual e nenhum NPC publicado abaixo for compatível, NÃO improvise. Retorne exatamente um JSON no formato {"__reject":"Explique qual NPC precisa existir antes deste caso ser criado."}.',
    'CATÁLOGO DE NPCs PUBLICADOS DISPONÍVEIS:',
    JSON.stringify(publishedNpcs),
  ].join('\n');
}

function buildSystemPrompt(contract, entityType, context) {
  const extraRules = entityType === 'case' ? buildCaseNpcRules(context) : '';
  return [
    'Você é o gerador de conteúdo oficial do Rota da Justiça.',
    'Retorne SOMENTE JSON válido. Não use markdown, comentários ou texto fora do JSON.',
    'Obedeça integralmente ao JSON Schema fornecido, exceto pelo formato especial __reject explicitamente autorizado nas regras de NPC de casos.',
    contract.instructions,
    extraRules,
    'JSON Schema obrigatório:',
    JSON.stringify(contract.jsonSchema),
  ].filter(Boolean).join('\n\n');
}

function parseStructuredText(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('O provedor retornou uma resposta vazia.');

  const withoutFence = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {}

  const first = withoutFence.indexOf('{');
  const last = withoutFence.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(withoutFence.slice(first, last + 1)); } catch {}
  }

  throw new Error('A IA respondeu, mas não retornou um JSON válido compatível com o Rota.');
}

export async function generateStructured(entityType, prompt, context = {}) {
  const contract = getAIContract(entityType);
  try {
    const result = await generateWithDefaultProvider({
      prompt,
      systemPrompt: buildSystemPrompt(contract, entityType, context),
    });
    const parsed = parseStructuredText(result.text);
    if (entityType === 'case' && typeof parsed?.__reject === 'string') {
      throw new Error(`Caso não criado: ${parsed.__reject}`);
    }
    return parsed;
  } catch (error) {
    if (String(error?.message || '').includes('Nenhum provedor de IA ativo')) {
      return generateTemplate(entityType, prompt);
    }
    throw error;
  }
}
