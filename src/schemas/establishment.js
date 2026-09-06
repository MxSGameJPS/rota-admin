import { z } from 'zod';

export const BUSINESS_TYPES = [
  'IMOBILIARIA',
  'HOTEL',
  'POUSADA',
  'LOCADORA',
  'CONCESSIONARIA',
  'LOJA_VEICULOS',
  'ESCRITORIO',
  'RESTAURANTE',
  'FARMACIA',
  'MERCADO',
  'POSTO',
  'ACADEMIA',
  'CLINICA',
  'BANCO',
  'SHOPPING',
  'OUTRO',
];

export const GAME_USE_TYPES = ['MAP_ONLY', 'SERVICE_PROVIDER', 'VISITABLE', 'MIXED'];
export const OFFER_TYPES = ['ALUGUEL', 'VENDA', 'HOSPEDAGEM', 'LOCACAO_VEICULO', 'SERVICO', 'OUTRO'];
export const PERIOD_TYPES = ['NONE', 'HOUR', 'DAY', 'MONTH', 'ONE_TIME'];
export const MEDIA_TYPES = ['LOGO', 'BANNER_HORIZONTAL', 'BANNER_VERTICAL', 'FACADE', 'INTERIOR', 'GALLERY', 'PROMO'];
export const AD_SLOT_TYPES = ['BILLBOARD', 'INTERIOR', 'MAP_HIGHLIGHT', 'LOADING_BANNER', 'LISTING_SPOTLIGHT', 'FACADE_SIGN'];

const businessTypeSchema = z.enum(BUSINESS_TYPES);
const gameUseTypeSchema = z.enum(GAME_USE_TYPES);
const offerTypeSchema = z.enum(OFFER_TYPES);
const periodTypeSchema = z.enum(PERIOD_TYPES);

export const establishmentGeneratedSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(120).regex(/^[a-z0-9-]+$/),
  businessType: businessTypeSchema,
  subcategory: z.string().max(120).default(''),
  description: z.string().min(20).max(1600),
  slogan: z.string().max(180).default(''),
  district: z.string().max(120).default('Centro'),
  streetName: z.string().max(180).default(''),
  numberReference: z.string().max(40).default(''),
  locationNotes: z.string().max(500).default(''),
  phone: z.string().max(40).default(''),
  whatsapp: z.string().max(40).default(''),
  email: z.string().max(160).default(''),
  website: z.string().max(240).default(''),
  instagram: z.string().max(160).default(''),
  openingHours: z.record(z.string(), z.string()).default({}),
  priceRange: z.string().max(60).default(''),
  visualStyle: z.string().min(5).max(500),
  brandColors: z.array(z.string().min(3).max(30)).min(1).max(6),
  gameUseType: gameUseTypeSchema.default('MIXED'),
  services: z.array(z.object({
    title: z.string().min(3).max(140),
    offerType: offerTypeSchema,
    description: z.string().min(8).max(600),
    price: z.number().min(0).nullable().default(null),
    periodType: periodTypeSchema.default('ONE_TIME'),
    gameplayEffects: z.record(z.string(), z.unknown()).default({}),
  })).min(1).max(12),
  adSlots: z.array(z.object({
    slotType: z.enum(AD_SLOT_TYPES),
    placementKey: z.string().min(2).max(120),
    description: z.string().min(5).max(300),
  })).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const ESTABLISHMENT_GENERATED_SCHEMA_JSON = z.toJSONSchema(establishmentGeneratedSchema);

export function normalizeSlug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 110);
}
