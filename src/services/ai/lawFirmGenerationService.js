import { generateWithDefaultProvider } from '@/services/ai/providerService';
import {
  LAW_FIRM_AI_INSTRUCTIONS,
  lawFirmSchema,
  normalizeLawFirmGeneratedInput,
} from '@/schemas/lawFirm';

const ATTEMPTS = 3;
const TIMEOUT_MS = 300000;

function parseJson(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('EMPTY_RESPONSE');
  const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(clean); } catch {}
  const first = clean.indexOf('{');
  const last = clean.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(clean.slice(first, last + 1)); } catch {}
  }
  throw new Error('INVALID_JSON');
}

function compactNpcCatalog(npcs) {
  return (npcs || []).slice(0, 120).map((npc) => ({
    slug: npc.slug,
    name: npc.name,
    roleType: npc.role_type,
    profession: npc.profession,
    specialization: npc.specialization,
    status: npc.status,
  }));
}

export async function generateLawFirmContract(prompt, existingNpcs = []) {
  const jsonSchema = zodSchemaJson();
  const catalog = compactNpcCatalog(existingNpcs);
  const systemPrompt = [
    'Você é o gerador oficial do módulo Escritórios do Rota da Justiça.',
    LAW_FIRM_AI_INSTRUCTIONS,
    catalog.length
      ? `NPCs persistentes já existentes. Reutilize apenas quando o briefing realmente apontar para um deles; nesse caso use npc:null:\n${JSON.stringify(catalog)}`
      : 'Não há catálogo de NPCs fornecido. Todo personagem nominal solicitado deve ser criado em members[].npc.',
    'JSON Schema obrigatório:',
    JSON.stringify(jsonSchema),
  ].join('\n\n');

  let lastError = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const suffix = attempt === 1 ? '' : [
        '',
        'A tentativa anterior não produziu JSON válido para o contrato.',
        'Gere novamente do zero, com textos mais curtos, mantendo todos os campos obrigatórios.',
        'Retorne somente um objeto JSON completo e fechado.',
      ].join('\n');
      const result = await generateWithDefaultProvider({
        prompt: `${prompt}${suffix}`,
        systemPrompt,
        timeoutMs: TIMEOUT_MS,
      });
      const parsed = parseJson(result.text);
      return lawFirmSchema.parse(normalizeLawFirmGeneratedInput(parsed));
    } catch (error) {
      lastError = error;
      const retryable = ['EMPTY_RESPONSE', 'INVALID_JSON'].includes(String(error?.message || ''))
        || String(error?.name || '').includes('Zod');
      if (!retryable || attempt === ATTEMPTS) break;
    }
  }

  throw new Error(`A IA não conseguiu gerar um escritório válido: ${lastError?.message || 'falha desconhecida'}`);
}

function zodSchemaJson() {
  // Zod 4 expõe toJSONSchema no próprio módulo/objeto em runtime.
  // Mantemos o require dinâmico fora do bundle do cliente porque este serviço é server-only.
  // eslint-disable-next-line global-require
  const { z } = require('zod');
  return z.toJSONSchema(lawFirmSchema);
}
