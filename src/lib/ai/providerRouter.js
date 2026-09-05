import { generateStructured as generateLegacyStructured } from './provider';
import { generateCaseMicroStructured } from './caseMicroPipeline';

export async function generateStructured(entityType, prompt, context = {}) {
  if (entityType === 'case') {
    return generateCaseMicroStructured(prompt, context);
  }
  return generateLegacyStructured(entityType, prompt, context);
}
