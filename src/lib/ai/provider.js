import { getAIContract } from '@/schemas/contracts';
import { generateTemplate } from './templates';
import { generateWithDefaultProvider } from '@/services/ai/providerService';

function buildSystemPrompt(contract) {
  return [
    'Você é o gerador de conteúdo oficial do Rota da Justiça.',
    'Retorne SOMENTE JSON válido. Não use markdown, comentários ou texto fora do JSON.',
    'Obedeça integralmente ao JSON Schema fornecido.',
    contract.instructions,
    'JSON Schema obrigatório:',
    JSON.stringify(contract.jsonSchema),
  ].join('\n\n');
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

export async function generateStructured(entityType, prompt) {
  const contract = getAIContract(entityType);
  try {
    const result = await generateWithDefaultProvider({
      prompt,
      systemPrompt: buildSystemPrompt(contract),
    });
    return parseStructuredText(result.text);
  } catch (error) {
    if (String(error?.message || '').includes('Nenhum provedor de IA ativo')) {
      return generateTemplate(entityType, prompt);
    }
    throw error;
  }
}
