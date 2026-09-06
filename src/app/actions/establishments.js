'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  archiveEstablishment,
  createCity,
  createManualEstablishment,
  createOffer,
  generateEstablishmentDraft,
  publishEstablishment,
  updateEstablishment,
} from '@/services/establishmentService';
import { generateEstablishmentMedia } from '@/services/establishmentMediaService';

function checked(formData, key) {
  return formData.get(key) === 'on' || formData.get(key) === 'true';
}

function fail(route, error) {
  redirect(`${route}?error=${encodeURIComponent(error?.message || String(error) || 'Falha inesperada.')}`);
}

export async function createCityAction(formData) {
  try {
    await createCity({
      name: formData.get('name'),
      stateCode: formData.get('stateCode'),
      stateName: formData.get('stateName'),
      region: formData.get('region'),
      countryCode: 'BR',
      countryName: 'Brasil',
    });
    revalidatePath('/establishments');
    redirect('/establishments?cityCreated=1');
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail('/establishments', error);
  }
}

export async function generateEstablishmentAction(formData) {
  try {
    const cityId = String(formData.get('cityId') || '').trim();
    const prompt = String(formData.get('prompt') || '').trim();
    if (!cityId) throw new Error('Escolha a cidade do estabelecimento.');
    const created = await generateEstablishmentDraft(cityId, prompt);
    revalidatePath('/establishments');
    redirect(`/establishments/${created.id}?generated=1`);
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail('/establishments', error);
  }
}

export async function createManualEstablishmentAction(formData) {
  try {
    const created = await createManualEstablishment({
      cityId: String(formData.get('cityId') || '').trim(),
      name: formData.get('name'),
      slug: formData.get('slug'),
      businessType: String(formData.get('businessType') || ''),
      description: formData.get('description'),
      district: formData.get('district'),
      isFictional: true,
    });
    revalidatePath('/establishments');
    redirect(`/establishments/${created.id}?created=1`);
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail('/establishments', error);
  }
}

export async function updateEstablishmentAction(id, formData) {
  const route = `/establishments/${id}`;
  try {
    await updateEstablishment(id, {
      name: formData.get('name'),
      slug: formData.get('slug'),
      businessType: String(formData.get('businessType') || ''),
      subcategory: formData.get('subcategory'),
      description: formData.get('description'),
      slogan: formData.get('slogan'),
      district: formData.get('district'),
      streetName: formData.get('streetName'),
      numberReference: formData.get('numberReference'),
      locationNotes: formData.get('locationNotes'),
      phone: formData.get('phone'),
      whatsapp: formData.get('whatsapp'),
      email: formData.get('email'),
      website: formData.get('website'),
      instagram: formData.get('instagram'),
      priceRange: formData.get('priceRange'),
      visualStyle: formData.get('visualStyle'),
      gameUseType: String(formData.get('gameUseType') || 'MIXED'),
      isFictional: checked(formData, 'isFictional'),
      isSponsored: checked(formData, 'isSponsored'),
      sponsorName: formData.get('sponsorName'),
      sponsorContractRef: formData.get('sponsorContractRef'),
      isVisitable: checked(formData, 'isVisitable'),
      isActive: checked(formData, 'isActive'),
      allowBillboardAds: checked(formData, 'allowBillboardAds'),
      allowInteriorAds: checked(formData, 'allowInteriorAds'),
      allowMapHighlight: checked(formData, 'allowMapHighlight'),
      allowSponsoredTag: checked(formData, 'allowSponsoredTag'),
    });
    revalidatePath(route);
    revalidatePath('/establishments');
    redirect(`${route}?saved=1`);
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail(route, error);
  }
}

export async function publishEstablishmentAction(id) {
  const route = `/establishments/${id}`;
  try {
    await publishEstablishment(id);
    revalidatePath(route);
    revalidatePath('/establishments');
    redirect(`${route}?published=1`);
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail(route, error);
  }
}

export async function archiveEstablishmentAction(id) {
  try {
    await archiveEstablishment(id);
    revalidatePath('/establishments');
    redirect('/establishments?archived=1');
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail(`/establishments/${id}`, error);
  }
}

export async function createOfferAction(id, formData) {
  const route = `/establishments/${id}`;
  try {
    await createOffer(id, {
      title: formData.get('title'),
      offerType: String(formData.get('offerType') || ''),
      description: formData.get('description'),
      price: formData.get('price'),
      periodType: String(formData.get('periodType') || 'ONE_TIME'),
    });
    revalidatePath(route);
    redirect(`${route}?offerCreated=1`);
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail(route, error);
  }
}

export async function generateEstablishmentMediaAction(id, mediaType) {
  const route = `/establishments/${id}`;
  try {
    await generateEstablishmentMedia(id, mediaType);
    revalidatePath(route);
    redirect(`${route}?mediaGenerated=${encodeURIComponent(mediaType)}`);
  } catch (error) {
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    fail(route, error);
  }
}
