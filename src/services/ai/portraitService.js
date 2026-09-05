import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  generateImageWithDefaultProvider,
  getDefaultImageProviderInternal,
} from '@/services/ai/providerService';

const PORTRAIT_BUCKET = process.env.ROTA_PORTRAIT_BUCKET?.trim() || 'character-portraits';
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const PORTRAIT_ATTEMPTS = Math.max(1, Math.min(4, Number(process.env.ROTA_PORTRAIT_ATTEMPTS || 3)));
let readyBucketKey = '';

function requireClient() {
  const client = getSupabaseAdmin();
  if (!client) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para salvar retratos.');
  return client;
}

function slugify(value) {
  return String(value || 'personagem')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'personagem';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isAlreadyExistsError(error) {
  const message = String(error?.message || error?.error || '').toLowerCase();
  return Number(error?.statusCode || error?.status) === 409
    || message.includes('already exists')
    || message.includes('duplicate');
}

function isRetryablePortraitError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return /http\s+(429|500|502|503|504)\b/.test(message)
    || message.includes('timeout')
    || message.includes('tempo limite')
    || message.includes('socket')
    || message.includes('econnreset')
    || message.includes('fetch failed')
    || message.includes('network')
    || message.includes('temporar')
    || message.includes('overloaded')
    || message.includes('rate limit')
    || message.includes('image_generation_call')
    || message.includes('without producing an image');
}

async function generatePortraitImage(prompt) {
  let lastError = null;
  for (let attempt = 1; attempt <= PORTRAIT_ATTEMPTS; attempt += 1) {
    try {
      const retryPrompt = attempt === 1
        ? prompt
        : `${prompt}\n\nIMPORTANTE: gere efetivamente a imagem solicitada agora. Não responda apenas em texto e não omita a chamada de geração de imagem.`;
      return await generateImageWithDefaultProvider({ prompt: retryPrompt, n: 1 });
    } catch (error) {
      lastError = error;
      if (!isRetryablePortraitError(error) || attempt === PORTRAIT_ATTEMPTS) throw error;
      await sleep(Math.min(5000, 900 * attempt));
    }
  }
  throw lastError || new Error('Falha desconhecida ao gerar retrato.');
}

async function ensurePortraitBucket() {
  const client = requireClient();
  const bucketKey = `${process.env.SUPABASE_URL || ''}:${PORTRAIT_BUCKET}`;
  if (readyBucketKey === bucketKey) return client;

  const { error: createError } = await client.storage.createBucket(PORTRAIT_BUCKET, {
    public: true,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    fileSizeLimit: '12MB',
  });
  if (createError && !isAlreadyExistsError(createError)) throw createError;

  const { error: updateError } = await client.storage.updateBucket(PORTRAIT_BUCKET, {
    public: true,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    fileSizeLimit: '12MB',
  });
  if (updateError) throw updateError;

  readyBucketKey = bucketKey;
  return client;
}

function extensionForMime(mimeType) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

function parseDataUri(source) {
  const match = String(source || '').match(/^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/i);
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) throw new Error('A imagem gerada retornou base64 vazio.');
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('A imagem gerada excede o limite de 12 MB.');
  return { bytes: new Uint8Array(buffer), mimeType: match[1].toLowerCase() };
}

async function fetchImageSource(source) {
  const dataUri = parseDataUri(source);
  if (dataUri) return dataUri;

  let url;
  try { url = new URL(source); } catch { throw new Error('A IA retornou uma origem de imagem inválida.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('A URL da imagem gerada deve usar http ou https.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`Falha ao baixar a imagem gerada: HTTP ${response.status}.`);
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_IMAGE_BYTES) throw new Error('A imagem gerada excede o limite de 12 MB.');
    const mimeType = String(response.headers.get('content-type') || 'image/png').split(';')[0].trim().toLowerCase();
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) throw new Error(`Formato de imagem não suportado: ${mimeType}.`);
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) throw new Error('A imagem gerada excede o limite de 12 MB.');
    return { bytes: new Uint8Array(arrayBuffer), mimeType };
  } finally {
    clearTimeout(timeout);
  }
}

export async function hasImageGenerationConfigured() {
  try {
    const provider = await getDefaultImageProviderInternal();
    return Boolean(provider?.imageEnabled && provider?.imageModel && provider?.imageBaseUrl);
  } catch {
    return false;
  }
}

export async function storeGeneratedPortrait({ source, folder, slug }) {
  const client = await ensurePortraitBucket();
  const image = await fetchImageSource(source);
  const extension = extensionForMime(image.mimeType);
  const safeFolder = String(folder || 'misc').split('/').map(slugify).filter(Boolean).join('/');
  const fileName = `${slugify(slug)}-${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`;
  const storagePath = `${safeFolder}/${fileName}`;

  const { error } = await client.storage.from(PORTRAIT_BUCKET).upload(storagePath, image.bytes, {
    contentType: image.mimeType,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw error;

  const { data } = client.storage.from(PORTRAIT_BUCKET).getPublicUrl(storagePath);
  const publicUrl = data?.publicUrl || data?.publicURL || '';
  if (!publicUrl) throw new Error('O Storage não retornou a URL pública do retrato.');

  return {
    portraitSrc: publicUrl,
    portraitStoragePath: storagePath,
    portraitMimeType: image.mimeType,
    portraitGeneratedAt: new Date().toISOString(),
  };
}

export async function generateAndStorePortrait({ prompt, folder, slug }) {
  const generated = await generatePortraitImage(prompt);
  const stored = await storeGeneratedPortrait({ source: generated.source, folder, slug });
  return {
    ...stored,
    portraitModel: generated.model,
    portraitRevisedPrompt: generated.revisedPrompt || '',
    portraitGenerationMs: generated.elapsedMs,
  };
}

function appearanceText(profile = {}) {
  return [
    profile.genderPresentation && `apresentação: ${profile.genderPresentation}`,
    profile.ageRange && `faixa etária: ${profile.ageRange}`,
    profile.skinTone && `pele: ${profile.skinTone}`,
    profile.hair && `cabelo: ${profile.hair}`,
    profile.clothing && `vestimenta: ${profile.clothing}`,
    profile.expression && `expressão: ${profile.expression}`,
    profile.notes && `detalhes: ${profile.notes}`,
  ].filter(Boolean).join('; ');
}

export function buildNpcPortraitPrompt(npc) {
  const appearance = npc?.metadata?.appearanceProfile && typeof npc.metadata.appearanceProfile === 'object'
    ? npc.metadata.appearanceProfile
    : {};
  return [
    'Crie um retrato ORIGINAL para um personagem fictício do jogo brasileiro Rota da Justiça.',
    'Estilo visual: ilustração 2D semi-realista de alta qualidade, busto/meio corpo, leitura clara em interface de videogame, iluminação cinematográfica discreta.',
    'Composição: personagem centralizado, olhar natural, sem texto, sem letras, sem logotipos, sem marca d’água. Preferir fundo transparente ou recorte limpo e neutro.',
    'O personagem NÃO deve parecer uma pessoa real conhecida. Evite aparência de fotografia de celebridade.',
    'DIVERSIDADE: crie identidade facial própria e memorável. Não reutilize o mesmo arquétipo facial de outros personagens; varie idade aparente, formato do rosto, cabelo, pele, acessórios discretos e postura de forma coerente com a profissão.',
    `Nome fictício: ${npc.name}.`,
    `Função: ${npc.profession}. Especialização: ${npc.specialization}. Jurisdição/contexto: ${npc.jurisdiction || 'Brasil'}.`,
    appearanceText(appearance) ? `Perfil visual definido: ${appearanceText(appearance)}.` : '',
    npc?.professionalProfile?.background ? `Contexto profissional: ${npc.professionalProfile.background}` : '',
    'A imagem será usada como retrato de diálogo do personagem no jogo.',
  ].filter(Boolean).join('\n');
}

export function buildCaseCharacterPortraitPrompt({ caseData, location, character }) {
  return [
    'Crie um retrato ORIGINAL para um personagem fictício específico de um caso do jogo brasileiro Rota da Justiça.',
    'Estilo visual: ilustração 2D semi-realista de alta qualidade, busto/meio corpo, consistente com um jogo narrativo jurídico, iluminação cinematográfica discreta.',
    'Composição: personagem centralizado, sem texto, sem letras, sem logotipos, sem marca d’água. Preferir fundo transparente ou recorte limpo e neutro.',
    'Não represente celebridades nem pessoas reais identificáveis.',
    'DIVERSIDADE: este personagem precisa ter rosto, idade aparente, cabelo, traços, tom de pele, expressão e postura próprios; não deve parecer apenas outro personagem do jogo com roupa diferente.',
    `Caso: ${caseData.title}. Área jurídica: ${caseData.area}.`,
    `Local em que aparece: ${location.name}.`,
    `Nome fictício: ${character.name}. Papel no caso: ${character.role}.`,
    appearanceText(character.appearanceProfile || {}) ? `Perfil visual obrigatório: ${appearanceText(character.appearanceProfile || {})}.` : '',
    `Contexto de fala: ${character.initialDialogue}`,
    'A imagem será exibida ao jogador enquanto conversa com esta pessoa.',
  ].filter(Boolean).join('\n');
}
