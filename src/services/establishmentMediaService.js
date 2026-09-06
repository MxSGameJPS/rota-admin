import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { generateImageWithDefaultProvider, getDefaultImageProviderInternal } from '@/services/ai/providerService';

const BUCKET = process.env.ROTA_ESTABLISHMENT_MEDIA_BUCKET?.trim() || 'establishment-media';
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function requireClient() {
  const client = getSupabaseAdmin();
  if (!client) throw new Error('Configure o Supabase antes de gerar mídia comercial.');
  return client;
}

function slugify(value) {
  return String(value || 'asset').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'asset';
}

function parseDataUri(source) {
  const match = String(source || '').match(/^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/i);
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error('Imagem gerada vazia ou acima de 12 MB.');
  return { bytes: new Uint8Array(buffer), mimeType: match[1].toLowerCase() };
}

async function fetchSource(source) {
  const inline = parseDataUri(source);
  if (inline) return inline;
  const url = new URL(source);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`Falha ao baixar imagem: HTTP ${response.status}.`);
    const mimeType = String(response.headers.get('content-type') || 'image/png').split(';')[0].trim().toLowerCase();
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) throw new Error(`Formato não suportado: ${mimeType}.`);
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) throw new Error('Imagem acima de 12 MB.');
    return { bytes: new Uint8Array(arrayBuffer), mimeType };
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureBucket() {
  const client = requireClient();
  const { error: createError } = await client.storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    fileSizeLimit: '12MB',
  });
  const message = String(createError?.message || '').toLowerCase();
  if (createError && !message.includes('already exists') && Number(createError?.statusCode || 0) !== 409) throw createError;
  return client;
}

function mediaPrompt(establishment, mediaType) {
  const city = establishment.city || {};
  const base = [
    'Crie uma imagem ORIGINAL para um estabelecimento FICTÍCIO do jogo brasileiro Rota da Justiça.',
    'Não use marcas reais, logotipos existentes, pessoas famosas, endereços reais exatos ou marcas d’água.',
    `Estabelecimento: ${establishment.name}. Tipo: ${establishment.business_type}.`,
    `Cidade/contexto: ${city.name || ''} - ${city.state_code || ''}, Brasil.`,
    `Descrição: ${establishment.description || ''}`,
    `Estilo visual: ${establishment.visual_style || 'profissional brasileiro contemporâneo'}.`,
    `Slogan apenas como referência conceitual, não precisa aparecer escrito: ${establishment.slogan || ''}.`,
  ];
  if (mediaType === 'BANNER_HORIZONTAL') base.push('Formato: banner publicitário horizontal 16:9, composição limpa, espaço visual para futura aplicação de texto pelo jogo, sem texto rasterizado obrigatório.');
  else if (mediaType === 'FACADE') base.push('Formato: fachada externa plausível do estabelecimento, vista frontal/3-4, ambiente urbano brasileiro, sem placas de marcas reais.');
  else if (mediaType === 'INTERIOR') base.push('Formato: fotografia/ilustração arquitetônica do interior principal do estabelecimento, coerente com o serviço prestado, sem pessoas identificáveis.');
  else if (mediaType === 'LOGO') base.push('Formato: símbolo/logotipo ORIGINAL, simples e legível, fundo limpo, sem copiar marcas existentes.');
  else base.push('Formato: imagem promocional institucional coerente com o estabelecimento.');
  return base.join('\n');
}

export async function hasEstablishmentImageGenerationConfigured() {
  try {
    const provider = await getDefaultImageProviderInternal();
    return Boolean(provider?.imageEnabled && provider?.imageModel && provider?.imageBaseUrl);
  } catch {
    return false;
  }
}

export async function generateEstablishmentMedia(establishmentId, mediaType) {
  const client = requireClient();
  const { data: establishment, error } = await client
    .from('establishments')
    .select('*,city:cities(*)')
    .eq('id', establishmentId)
    .single();
  if (error) throw error;

  const generated = await generateImageWithDefaultProvider({ prompt: mediaPrompt(establishment, mediaType), n: 1 });
  const source = await fetchSource(generated.source);
  const storage = await ensureBucket();
  const extension = source.mimeType === 'image/jpeg' ? 'jpg' : source.mimeType === 'image/webp' ? 'webp' : 'png';
  const path = `${slugify(establishment.slug)}/${slugify(mediaType)}-${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`;
  const { error: uploadError } = await storage.storage.from(BUCKET).upload(path, source.bytes, { contentType: source.mimeType, cacheControl: '31536000', upsert: false });
  if (uploadError) throw uploadError;
  const { data: publicData } = storage.storage.from(BUCKET).getPublicUrl(path);
  const url = publicData?.publicUrl || publicData?.publicURL;
  if (!url) throw new Error('O Storage não retornou URL pública da mídia.');

  const { data: row, error: insertError } = await client.from('establishment_media').insert({
    establishment_id: establishmentId,
    media_type: mediaType,
    source_type: 'AI',
    url,
    storage_path: path,
    alt_text: `${mediaType} de ${establishment.name}`,
    is_primary: mediaType === 'BANNER_HORIZONTAL' || mediaType === 'FACADE',
    metadata: {
      model: generated.model || '',
      revisedPrompt: generated.revisedPrompt || '',
      generationMs: generated.elapsedMs || null,
      generatedAt: new Date().toISOString(),
    },
  }).select('*').single();
  if (insertError) throw insertError;

  const patch = {};
  if (mediaType === 'LOGO') patch.logo_url = url;
  if (mediaType === 'BANNER_HORIZONTAL') patch.banner_url = url;
  if (mediaType === 'FACADE') patch.cover_image_url = url;
  if (Object.keys(patch).length) await client.from('establishments').update(patch).eq('id', establishmentId);
  return row;
}
