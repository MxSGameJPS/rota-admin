import { getSupabaseAdmin } from '@/lib/supabase/server';
import { generateWithDefaultProvider } from '@/services/ai/providerService';
import {
  AD_SLOT_TYPES,
  BUSINESS_TYPES,
  ESTABLISHMENT_GENERATED_SCHEMA_JSON,
  GAME_USE_TYPES,
  OFFER_TYPES,
  PERIOD_TYPES,
  establishmentGeneratedSchema,
  normalizeSlug,
} from '@/schemas/establishment';

const AI_ATTEMPTS = 3;
const AI_TIMEOUT_MS = 300000;

function requireClient() {
  const client = getSupabaseAdmin();
  if (!client) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.');
  return client;
}

function isMissingWorldTables(error) {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return ['cities', 'establishments', 'establishment_offers', 'establishment_media', 'establishment_ad_slots']
    .some((table) => message.includes(table));
}

function worldStorageError(error) {
  if (isMissingWorldTables(error)) {
    throw new Error('O banco ainda não recebeu o módulo de cidades e estabelecimentos. Aplique docs/establishments-world.sql no Supabase do Rota.');
  }
  throw error;
}

function parseJson(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!raw) throw new Error('EMPTY_RESPONSE');
  try { return JSON.parse(raw); } catch {}
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(raw.slice(first, last + 1)); } catch {}
  }
  throw new Error('INVALID_JSON');
}

async function generateStructuredEstablishment(city, prompt) {
  const systemPrompt = [
    'Você cria estabelecimentos persistentes para o universo do jogo brasileiro Rota da Justiça.',
    'O estabelecimento NÃO pertence a um caso específico. Ele existe permanentemente na cidade e pode ser reutilizado em gameplay, economia, viagens, imóveis, veículos e publicidade in-game.',
    'Neste momento, salvo instrução expressa em contrário, trate marca, endereço, telefone, site e pessoas como FICTÍCIOS. Nunca invente parceria real, CNPJ, endereço exato real ou alegação de patrocínio.',
    'Crie uma marca plausível e local, com identidade visual própria. Os serviços devem ser úteis ao gameplay.',
    'Para imobiliária, priorize locação/venda de imóveis e salas comerciais. Para hotéis/pousadas, hospedagem e salas. Para locadoras/lojas de veículos, locação ou venda de veículos conforme o tipo.',
    'Inclua adSlots coerentes, pois no futuro locais poderão receber publicidade ou tornar-se patrocinados.',
    'Retorne SOMENTE JSON válido, sem markdown ou texto externo.',
    `Cidade obrigatória: ${city.name} - ${city.state_code}/${city.country_code}.`,
    'JSON Schema obrigatório:',
    JSON.stringify(ESTABLISHMENT_GENERATED_SCHEMA_JSON),
  ].join('\n\n');

  let lastError = null;
  for (let attempt = 0; attempt < AI_ATTEMPTS; attempt += 1) {
    try {
      const retry = attempt === 0 ? '' : '\n\nA resposta anterior falhou. Gere novamente de forma mais curta, mantendo todos os campos e somente JSON válido.';
      const result = await generateWithDefaultProvider({
        systemPrompt: systemPrompt + retry,
        prompt,
        timeoutMs: AI_TIMEOUT_MS,
      });
      return establishmentGeneratedSchema.parse(parseJson(result.text));
    } catch (error) {
      lastError = error;
      if (!['EMPTY_RESPONSE', 'INVALID_JSON'].includes(String(error?.message || '')) && error?.name !== 'ZodError') throw error;
    }
  }
  throw new Error(`A IA não conseguiu gerar um estabelecimento válido após ${AI_ATTEMPTS} tentativas: ${lastError?.message || 'resposta inválida'}.`);
}

export async function listCities() {
  const client = getSupabaseAdmin();
  if (!client) return [];
  const { data, error } = await client.from('cities').select('*').order('state_code').order('name');
  if (error) {
    if (isMissingWorldTables(error)) return [];
    throw error;
  }
  return data || [];
}

export async function listEstablishments() {
  const client = getSupabaseAdmin();
  if (!client) return [];
  const { data, error } = await client
    .from('establishments')
    .select('id,slug,name,business_type,subcategory,status,is_active,is_fictional,is_sponsored,game_use_type,version,updated_at,city:cities(id,name,state_code)')
    .order('created_at', { ascending: false });
  if (error) {
    if (isMissingWorldTables(error)) return [];
    throw error;
  }
  return data || [];
}

export async function getEstablishment(id) {
  const client = requireClient();
  const [{ data: establishment, error }, offers, media, adSlots] = await Promise.all([
    client.from('establishments').select('*,city:cities(*)').eq('id', id).single(),
    client.from('establishment_offers').select('*').eq('establishment_id', id).order('sort_order'),
    client.from('establishment_media').select('*').eq('establishment_id', id).order('created_at'),
    client.from('establishment_ad_slots').select('*').eq('establishment_id', id).order('created_at'),
  ]);
  if (error) worldStorageError(error);
  if (offers.error) worldStorageError(offers.error);
  if (media.error) worldStorageError(media.error);
  if (adSlots.error) worldStorageError(adSlots.error);
  return {
    ...establishment,
    offers: offers.data || [],
    media: media.data || [],
    adSlots: adSlots.data || [],
  };
}

export async function createCity(input) {
  const client = requireClient();
  const name = String(input.name || '').trim();
  const stateCode = String(input.stateCode || '').trim().toUpperCase();
  if (name.length < 2) throw new Error('Informe o nome da cidade.');
  if (stateCode.length !== 2) throw new Error('Informe a UF com 2 letras.');
  const slug = normalizeSlug(input.slug || `${name}-${stateCode}`);
  const { data, error } = await client.from('cities').insert({
    slug,
    name,
    state_code: stateCode,
    state_name: String(input.stateName || '').trim() || stateCode,
    country_code: String(input.countryCode || 'BR').trim().toUpperCase(),
    country_name: String(input.countryName || 'Brasil').trim(),
    region: String(input.region || '').trim() || null,
    is_active: true,
    metadata: {},
  }).select('*').single();
  if (error) worldStorageError(error);
  return data;
}

async function insertGeneratedChildren(client, establishmentId, generated) {
  if (generated.services?.length) {
    const rows = generated.services.map((offer, index) => ({
      establishment_id: establishmentId,
      title: offer.title,
      offer_type: offer.offerType,
      description: offer.description,
      price: offer.price,
      period_type: offer.periodType,
      is_available: true,
      sort_order: index,
      gameplay_effects: offer.gameplayEffects || {},
      metadata: { generatedByAi: true },
    }));
    const { error } = await client.from('establishment_offers').insert(rows);
    if (error) throw error;
  }

  if (generated.adSlots?.length) {
    const rows = generated.adSlots.map((slot) => ({
      establishment_id: establishmentId,
      slot_type: slot.slotType,
      placement_key: slot.placementKey,
      description: slot.description,
      is_active: true,
      pricing_model: 'NEGOTIATED',
      metadata: { generatedByAi: true },
    }));
    const { error } = await client.from('establishment_ad_slots').insert(rows);
    if (error) throw error;
  }
}

export async function generateEstablishmentDraft(cityId, prompt) {
  const client = requireClient();
  const { data: city, error: cityError } = await client.from('cities').select('*').eq('id', cityId).single();
  if (cityError) worldStorageError(cityError);
  if (String(prompt || '').trim().length < 10) throw new Error('Descreva melhor o estabelecimento que deseja criar.');

  const generated = await generateStructuredEstablishment(city, String(prompt).trim());
  const desiredSlug = normalizeSlug(generated.slug || generated.name);
  const slug = `${desiredSlug}-${normalizeSlug(city.name)}`.slice(0, 120);
  const { data, error } = await client.from('establishments').insert({
    slug,
    name: generated.name,
    business_type: generated.businessType,
    subcategory: generated.subcategory || null,
    description: generated.description,
    slogan: generated.slogan || null,
    city_id: city.id,
    district: generated.district || null,
    street_name: generated.streetName || null,
    number_reference: generated.numberReference || null,
    location_notes: generated.locationNotes || null,
    phone: generated.phone || null,
    whatsapp: generated.whatsapp || null,
    email: generated.email || null,
    website: generated.website || null,
    instagram: generated.instagram || null,
    opening_hours: generated.openingHours || {},
    price_range: generated.priceRange || null,
    visual_style: generated.visualStyle,
    brand_colors: generated.brandColors || [],
    game_use_type: generated.gameUseType,
    is_fictional: true,
    is_sponsored: false,
    is_visitable: generated.gameUseType !== 'MAP_ONLY',
    is_active: true,
    status: 'draft',
    metadata: {
      ...(generated.metadata || {}),
      generatedByAi: true,
      generationPrompt: String(prompt).trim(),
      generatedAt: new Date().toISOString(),
    },
  }).select('*').single();
  if (error) worldStorageError(error);

  try {
    await insertGeneratedChildren(client, data.id, generated);
  } catch (childError) {
    await client.from('establishments').delete().eq('id', data.id);
    worldStorageError(childError);
  }
  return data;
}

export async function createManualEstablishment(input) {
  const client = requireClient();
  const name = String(input.name || '').trim();
  if (name.length < 2) throw new Error('Informe o nome do estabelecimento.');
  if (!BUSINESS_TYPES.includes(input.businessType)) throw new Error('Tipo de estabelecimento inválido.');
  const slug = normalizeSlug(input.slug || name);
  const { data, error } = await client.from('establishments').insert({
    slug,
    name,
    business_type: input.businessType,
    description: String(input.description || `${name} é um estabelecimento disponível no universo do Rota da Justiça.`).trim(),
    city_id: input.cityId,
    district: String(input.district || '').trim() || null,
    visual_style: 'Identidade visual a definir no Rota Admin.',
    brand_colors: [],
    game_use_type: 'MIXED',
    is_fictional: input.isFictional !== false,
    is_sponsored: false,
    is_visitable: true,
    is_active: true,
    status: 'draft',
    metadata: { createdManually: true },
  }).select('*').single();
  if (error) worldStorageError(error);
  return data;
}

export async function updateEstablishment(id, input) {
  const client = requireClient();
  if (input.businessType && !BUSINESS_TYPES.includes(input.businessType)) throw new Error('Tipo inválido.');
  if (input.gameUseType && !GAME_USE_TYPES.includes(input.gameUseType)) throw new Error('Uso no game inválido.');
  const patch = {
    name: String(input.name || '').trim(),
    slug: normalizeSlug(input.slug || input.name),
    business_type: input.businessType,
    subcategory: String(input.subcategory || '').trim() || null,
    description: String(input.description || '').trim(),
    slogan: String(input.slogan || '').trim() || null,
    district: String(input.district || '').trim() || null,
    street_name: String(input.streetName || '').trim() || null,
    number_reference: String(input.numberReference || '').trim() || null,
    location_notes: String(input.locationNotes || '').trim() || null,
    phone: String(input.phone || '').trim() || null,
    whatsapp: String(input.whatsapp || '').trim() || null,
    email: String(input.email || '').trim() || null,
    website: String(input.website || '').trim() || null,
    instagram: String(input.instagram || '').trim() || null,
    price_range: String(input.priceRange || '').trim() || null,
    visual_style: String(input.visualStyle || '').trim(),
    game_use_type: input.gameUseType,
    is_fictional: Boolean(input.isFictional),
    is_sponsored: Boolean(input.isSponsored),
    sponsor_name: String(input.sponsorName || '').trim() || null,
    sponsor_contract_ref: String(input.sponsorContractRef || '').trim() || null,
    is_visitable: Boolean(input.isVisitable),
    is_active: Boolean(input.isActive),
    allow_billboard_ads: Boolean(input.allowBillboardAds),
    allow_interior_ads: Boolean(input.allowInteriorAds),
    allow_map_highlight: Boolean(input.allowMapHighlight),
    allow_sponsored_tag: Boolean(input.allowSponsoredTag),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client.from('establishments').update(patch).eq('id', id).select('*').single();
  if (error) worldStorageError(error);
  return data;
}

export async function publishEstablishment(id) {
  const client = requireClient();
  const { data: current, error: readError } = await client.from('establishments').select('version').eq('id', id).single();
  if (readError) worldStorageError(readError);
  const { data, error } = await client.from('establishments').update({
    status: 'published',
    is_active: true,
    version: Number(current.version || 1) + 1,
    published_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id).select('*').single();
  if (error) worldStorageError(error);
  return data;
}

export async function createOffer(establishmentId, input) {
  const client = requireClient();
  if (!OFFER_TYPES.includes(input.offerType)) throw new Error('Tipo de oferta inválido.');
  if (!PERIOD_TYPES.includes(input.periodType)) throw new Error('Período inválido.');
  const price = String(input.price ?? '').trim() === '' ? null : Number(input.price);
  if (price != null && (!Number.isFinite(price) || price < 0)) throw new Error('Preço inválido.');
  const { data, error } = await client.from('establishment_offers').insert({
    establishment_id: establishmentId,
    title: String(input.title || '').trim(),
    offer_type: input.offerType,
    description: String(input.description || '').trim(),
    price,
    period_type: input.periodType,
    is_available: true,
    gameplay_effects: {},
    metadata: {},
  }).select('*').single();
  if (error) worldStorageError(error);
  return data;
}

export async function archiveEstablishment(id) {
  const client = requireClient();
  const { error } = await client.from('establishments').update({ status: 'archived', is_active: false, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) worldStorageError(error);
}

export { AD_SLOT_TYPES, BUSINESS_TYPES, GAME_USE_TYPES, OFFER_TYPES, PERIOD_TYPES };
