import { randomUUID } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  generateImageWithDefaultProvider,
  getDefaultImageProviderInternal,
} from '@/services/ai/providerService';

const BUCKET = process.env.ROTA_PORTRAIT_BUCKET?.trim() || 'character-portraits';
const MAX_BYTES = 12 * 1024 * 1024;
const ATTEMPTS = Math.max(2, Math.min(5, Number(process.env.ROTA_LAW_FIRM_PORTRAIT_ATTEMPTS || 4)));
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function supabase() {
  const client = getSupabaseAdmin();
  if (!client) throw new Error('Configure o Supabase para salvar retratos.');
  return client;
}

function slugify(value) {
  return String(value || 'npc').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'npc';
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function ensureBucket() {
  const client = supabase();
  const { error } = await client.storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    fileSizeLimit: '12MB',
  });
  const message = String(error?.message || '').toLowerCase();
  if (error && Number(error?.statusCode || error?.status || 0) !== 409 && !message.includes('already exists')) throw error;
  return client;
}

function parseDataUri(source) {
  const match = String(source || '').match(/^data:([^;]+);base64,([\s\S]+)$/i);
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_BYTES) throw new Error('Imagem gerada vazia ou acima de 12 MB.');
  return { buffer, mimeType: String(match[1]).toLowerCase() };
}

async function download(source) {
  const inline = parseDataUri(source);
  if (inline) return inline;
  const url = new URL(source);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`Falha ao baixar retrato: HTTP ${response.status}.`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_BYTES) throw new Error('Retrato vazio ou acima de 12 MB.');
    const mimeType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    return { buffer, mimeType };
  } finally {
    clearTimeout(timeout);
  }
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function inspectTransparentPng(buffer) {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { ok: false, reason: 'o arquivo não é PNG' };
  }

  let offset = 8;
  let width = 0; let height = 0; let bitDepth = 0; let colorType = -1; let interlace = 0;
  const idat = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) break;
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
      interlace = buffer[dataStart + 12];
    } else if (type === 'IDAT') idat.push(buffer.subarray(dataStart, dataEnd));
    else if (type === 'IEND') break;
    offset = dataEnd + 4;
  }

  if (!width || !height || bitDepth !== 8 || interlace !== 0 || ![4, 6].includes(colorType) || !idat.length) {
    return { ok: false, reason: 'o PNG não possui canal alpha 8-bit não entrelaçado verificável' };
  }

  const bytesPerPixel = colorType === 6 ? 4 : 2;
  const rowBytes = width * bytesPerPixel;
  let raw;
  try { raw = inflateSync(Buffer.concat(idat)); } catch { return { ok: false, reason: 'não foi possível validar o canal alpha do PNG' }; }
  if (raw.length < height * (rowBytes + 1)) return { ok: false, reason: 'dados PNG incompletos' };

  let previous = Buffer.alloc(rowBytes);
  let cursor = 0;
  let borderPixels = 0;
  let transparentBorderPixels = 0;
  let transparentPixels = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor]; cursor += 1;
    const encoded = raw.subarray(cursor, cursor + rowBytes); cursor += rowBytes;
    const row = Buffer.alloc(rowBytes);
    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = previous[x] || 0;
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] || 0 : 0;
      let value = encoded[x];
      if (filter === 1) value = (value + left) & 255;
      else if (filter === 2) value = (value + up) & 255;
      else if (filter === 3) value = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) value = (value + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) return { ok: false, reason: `filtro PNG não suportado: ${filter}` };
      row[x] = value;
    }

    const alphaOffset = bytesPerPixel - 1;
    for (let x = 0; x < width; x += 1) {
      const alpha = row[x * bytesPerPixel + alphaOffset];
      if (alpha < 250) transparentPixels += 1;
      const border = y < Math.max(2, Math.floor(height * 0.04))
        || y >= height - Math.max(2, Math.floor(height * 0.04))
        || x < Math.max(2, Math.floor(width * 0.04))
        || x >= width - Math.max(2, Math.floor(width * 0.04));
      if (border) {
        borderPixels += 1;
        if (alpha < 250) transparentBorderPixels += 1;
      }
    }
    previous = row;
  }

  const borderRatio = borderPixels ? transparentBorderPixels / borderPixels : 0;
  const transparentRatio = transparentPixels / (width * height);
  if (borderRatio < 0.35 || transparentRatio < 0.05) {
    return { ok: false, reason: 'o PNG possui alpha, mas o fundo não está suficientemente transparente' };
  }
  return { ok: true, width, height, borderRatio, transparentRatio };
}

function appearance(profile = {}) {
  return [
    profile.genderPresentation && `apresentação: ${profile.genderPresentation}`,
    profile.ageRange && `idade aparente: ${profile.ageRange}`,
    profile.skinTone && `tom de pele: ${profile.skinTone}`,
    profile.hair && `cabelo: ${profile.hair}`,
    profile.clothing && `roupa: ${profile.clothing}`,
    profile.expression && `expressão: ${profile.expression}`,
    profile.notes && `detalhes: ${profile.notes}`,
  ].filter(Boolean).join('; ');
}

export function buildLawFirmNpcPortraitPrompt({ firm, npc, officeTitle }) {
  return [
    'Crie um personagem ORIGINAL em PNG com FUNDO TOTALMENTE TRANSPARENTE para o jogo brasileiro Rota da Justiça.',
    'REQUISITO TÉCNICO OBRIGATÓRIO: PNG RGBA com canal alpha real. Não use fundo branco, preto, cinza, degradê, cenário, moldura ou sombra opaca ocupando o fundo.',
    'O contorno externo do personagem deve terminar diretamente em transparência. As bordas/cantos da imagem precisam permanecer transparentes.',
    'Composição: busto ou meio corpo, personagem centralizado, leitura clara em interface de videogame, sem texto, sem letras, sem logotipos e sem marca d’água.',
    'Estilo: ilustração 2D semi-realista de alta qualidade, consistente com um jogo narrativo jurídico.',
    'Não represente pessoa real conhecida nem celebridade.',
    'DIVERSIDADE OBRIGATÓRIA: identidade facial própria; varie idade aparente, formato do rosto, cabelo, pele, acessórios discretos e postura. Não reutilize arquétipo facial de outros personagens.',
    `Escritório fictício: ${firm.name}.`,
    `Personagem: ${npc.name}. Cargo no escritório: ${officeTitle}.`,
    `Profissão: ${npc.profession}. Especialização: ${npc.specialization}.`,
    appearance(npc.appearanceProfile) ? `Perfil visual obrigatório: ${appearance(npc.appearanceProfile)}.` : '',
    npc.professionalProfile?.background ? `Contexto profissional: ${npc.professionalProfile.background}` : '',
    'ENTREGUE SOMENTE A IMAGEM. O FUNDO PRECISA SER TRANSPARENTE DE VERDADE.',
  ].filter(Boolean).join('\n');
}

export async function hasLawFirmPortraitProvider() {
  try {
    const provider = await getDefaultImageProviderInternal();
    return Boolean(provider?.imageEnabled && provider?.imageModel && provider?.imageBaseUrl);
  } catch { return false; }
}

export async function generateAndStoreLawFirmPortrait({ firm, npc, officeTitle }) {
  let lastReason = 'imagem inválida';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const prompt = [
      buildLawFirmNpcPortraitPrompt({ firm, npc, officeTitle }),
      attempt > 1 ? `TENTATIVA ${attempt}: a imagem anterior foi rejeitada porque ${lastReason}. Corrija isso obrigatoriamente.` : '',
    ].filter(Boolean).join('\n\n');

    const generated = await generateImageWithDefaultProvider({ prompt, n: 1 });
    const downloaded = await download(generated.source);
    const inspection = inspectTransparentPng(downloaded.buffer);
    if (!inspection.ok) {
      lastReason = inspection.reason;
      if (attempt < ATTEMPTS) await sleep(Math.min(4000, 650 * attempt));
      continue;
    }

    const storage = await ensureBucket();
    const storagePath = `law-firms/${slugify(firm.slug)}/${slugify(npc.slug)}-${Date.now()}-${randomUUID().slice(0, 8)}.png`;
    const { error } = await storage.storage.from(BUCKET).upload(storagePath, downloaded.buffer, {
      contentType: 'image/png', cacheControl: '31536000', upsert: false,
    });
    if (error) throw error;
    const { data } = storage.storage.from(BUCKET).getPublicUrl(storagePath);
    const url = data?.publicUrl || data?.publicURL || '';
    if (!url) throw new Error('O Storage não retornou URL pública do retrato.');

    return {
      portraitSrc: url,
      portraitStoragePath: storagePath,
      portraitStatus: 'READY',
      portraitModel: generated.model || '',
      portraitGeneratedAt: new Date().toISOString(),
      portraitMimeType: 'image/png',
      portraitTransparentBackground: true,
      portrait: {
        url,
        storagePath,
        format: 'png',
        mimeType: 'image/png',
        transparentBackground: true,
        status: 'READY',
        model: generated.model || '',
        generatedAt: new Date().toISOString(),
        alphaValidation: {
          borderRatio: Number(inspection.borderRatio.toFixed(4)),
          transparentRatio: Number(inspection.transparentRatio.toFixed(4)),
        },
      },
    };
  }
  throw new Error(`Não foi possível gerar PNG com fundo transparente para ${npc.name} após ${ATTEMPTS} tentativas: ${lastReason}.`);
}
