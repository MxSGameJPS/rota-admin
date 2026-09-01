import { getAIContract } from '@/schemas/contracts';
import { generateTemplate } from './templates';

export async function generateStructured(entityType, prompt) {
  const endpoint = process.env.AI_PROVIDER_ENDPOINT?.trim();
  const provider = process.env.AI_PROVIDER?.trim() || 'template';
  if (!endpoint || provider === 'template') return generateTemplate(entityType, prompt);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.AI_PROVIDER_TOKEN ? { Authorization: `Bearer ${process.env.AI_PROVIDER_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      prompt,
      contract: getAIContract(entityType),
      responseFormat: 'json',
    }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`AI provider respondeu ${response.status}.`);
  const payload = await response.json();
  return payload.data ?? payload;
}
