import { getSupabaseAdmin } from '@/lib/supabase/server';
import { AD_SLOT_TYPES } from '@/schemas/establishment';

function requireClient() {
  const client = getSupabaseAdmin();
  if (!client) throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.');
  return client;
}

export async function createEstablishmentAdSlot(establishmentId, input) {
  const client = requireClient();
  const slotType = String(input.slotType || '').trim();
  const placementKey = String(input.placementKey || '').trim();
  const description = String(input.description || '').trim();

  if (!AD_SLOT_TYPES.includes(slotType)) throw new Error('Tipo de slot publicitário inválido.');
  if (placementKey.length < 2) throw new Error('Informe uma chave de posicionamento para o slot.');
  if (description.length < 5) throw new Error('Descreva onde a publicidade aparecerá no jogo.');

  const suggestedPrice = String(input.suggestedPrice ?? '').trim() === '' ? null : Number(input.suggestedPrice);
  if (suggestedPrice != null && (!Number.isFinite(suggestedPrice) || suggestedPrice < 0)) throw new Error('Preço sugerido inválido.');

  const width = String(input.width ?? '').trim() === '' ? null : Number(input.width);
  const height = String(input.height ?? '').trim() === '' ? null : Number(input.height);
  if (width != null && (!Number.isInteger(width) || width <= 0)) throw new Error('Largura inválida.');
  if (height != null && (!Number.isInteger(height) || height <= 0)) throw new Error('Altura inválida.');

  const { data, error } = await client.from('establishment_ad_slots').insert({
    establishment_id: establishmentId,
    slot_type: slotType,
    placement_key: placementKey,
    description,
    width,
    height,
    is_active: true,
    pricing_model: 'NEGOTIATED',
    suggested_price: suggestedPrice,
    metadata: { createdManually: true },
  }).select('*').single();

  if (error) throw error;
  return data;
}
