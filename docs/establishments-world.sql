-- Rota da Justiça — cidades, estabelecimentos persistentes e inventário publicitário
-- Aplicar no mesmo projeto Supabase usado pelo Rota Admin e pelo game.
-- Idempotente: pode ser executado novamente com segurança.

begin;

create extension if not exists pgcrypto;

create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  state_code text not null,
  state_name text not null,
  country_code text not null default 'BR',
  country_name text not null default 'Brasil',
  region text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cities_state_code_check check (char_length(state_code) = 2),
  constraint cities_country_code_check check (char_length(country_code) = 2)
);

create table if not exists public.establishments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  business_type text not null,
  subcategory text,
  description text not null,
  slogan text,
  city_id uuid not null references public.cities(id) on update cascade on delete restrict,
  district text,
  street_name text,
  number_reference text,
  zip_code text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  location_notes text,
  phone text,
  whatsapp text,
  email text,
  website text,
  instagram text,
  opening_hours jsonb not null default '{}'::jsonb,
  price_range text,
  visual_style text not null default 'Identidade visual a definir no Rota Admin.',
  brand_colors jsonb not null default '[]'::jsonb,
  logo_url text,
  banner_url text,
  cover_image_url text,
  game_use_type text not null default 'MIXED',
  is_fictional boolean not null default true,
  is_sponsored boolean not null default false,
  sponsor_name text,
  sponsor_contract_ref text,
  sponsorship_starts_at timestamptz,
  sponsorship_ends_at timestamptz,
  is_visitable boolean not null default true,
  is_active boolean not null default true,
  allow_billboard_ads boolean not null default true,
  allow_interior_ads boolean not null default true,
  allow_map_highlight boolean not null default true,
  allow_sponsored_tag boolean not null default true,
  status text not null default 'draft',
  version integer not null default 1,
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint establishments_business_type_check check (business_type in (
    'IMOBILIARIA','HOTEL','POUSADA','LOCADORA','CONCESSIONARIA','LOJA_VEICULOS','ESCRITORIO',
    'RESTAURANTE','FARMACIA','MERCADO','POSTO','ACADEMIA','CLINICA','BANCO','SHOPPING','OUTRO'
  )),
  constraint establishments_game_use_type_check check (game_use_type in ('MAP_ONLY','SERVICE_PROVIDER','VISITABLE','MIXED')),
  constraint establishments_status_check check (status in ('draft','published','archived')),
  constraint establishments_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint establishments_longitude_check check (longitude is null or longitude between -180 and 180),
  constraint establishments_sponsorship_dates_check check (
    sponsorship_starts_at is null or sponsorship_ends_at is null or sponsorship_ends_at >= sponsorship_starts_at
  ),
  constraint establishments_sponsor_consistency_check check (
    is_sponsored = false or sponsor_name is not null
  )
);

create table if not exists public.establishment_offers (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on update cascade on delete cascade,
  title text not null,
  offer_type text not null,
  description text not null,
  price numeric(12,2),
  period_type text not null default 'ONE_TIME',
  is_available boolean not null default true,
  sort_order integer not null default 0,
  image_url text,
  gameplay_effects jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint establishment_offers_type_check check (offer_type in ('ALUGUEL','VENDA','HOSPEDAGEM','LOCACAO_VEICULO','SERVICO','OUTRO')),
  constraint establishment_offers_period_check check (period_type in ('NONE','HOUR','DAY','MONTH','ONE_TIME')),
  constraint establishment_offers_price_check check (price is null or price >= 0)
);

create table if not exists public.establishment_media (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on update cascade on delete cascade,
  media_type text not null,
  source_type text not null default 'AI',
  url text not null,
  storage_path text,
  alt_text text,
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint establishment_media_type_check check (media_type in ('LOGO','BANNER_HORIZONTAL','BANNER_VERTICAL','FACADE','INTERIOR','GALLERY','PROMO')),
  constraint establishment_media_source_check check (source_type in ('AI','UPLOAD','SPONSOR'))
);

create table if not exists public.establishment_ad_slots (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on update cascade on delete cascade,
  slot_type text not null,
  placement_key text not null,
  description text not null,
  width integer,
  height integer,
  is_active boolean not null default true,
  pricing_model text not null default 'NEGOTIATED',
  suggested_price numeric(12,2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint establishment_ad_slots_type_check check (slot_type in ('BILLBOARD','INTERIOR','MAP_HIGHLIGHT','LOADING_BANNER','LISTING_SPOTLIGHT','FACADE_SIGN')),
  constraint establishment_ad_slots_price_check check (suggested_price is null or suggested_price >= 0),
  unique(establishment_id, placement_key)
);

create index if not exists cities_state_name_idx on public.cities(state_code, name);
create index if not exists establishments_city_idx on public.establishments(city_id);
create index if not exists establishments_city_type_idx on public.establishments(city_id, business_type);
create index if not exists establishments_publication_idx on public.establishments(status, is_active, city_id);
create index if not exists establishments_sponsored_idx on public.establishments(is_sponsored, is_active) where is_sponsored = true;
create index if not exists establishment_offers_establishment_idx on public.establishment_offers(establishment_id, is_available);
create index if not exists establishment_media_establishment_idx on public.establishment_media(establishment_id, media_type);
create index if not exists establishment_ad_slots_establishment_idx on public.establishment_ad_slots(establishment_id, is_active);

create or replace function public.touch_world_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_world_updated_at() from public;
grant execute on function public.touch_world_updated_at() to service_role;

drop trigger if exists trg_cities_updated_at on public.cities;
create trigger trg_cities_updated_at before update on public.cities for each row execute function public.touch_world_updated_at();

drop trigger if exists trg_establishments_updated_at on public.establishments;
create trigger trg_establishments_updated_at before update on public.establishments for each row execute function public.touch_world_updated_at();

drop trigger if exists trg_establishment_offers_updated_at on public.establishment_offers;
create trigger trg_establishment_offers_updated_at before update on public.establishment_offers for each row execute function public.touch_world_updated_at();

drop trigger if exists trg_establishment_ad_slots_updated_at on public.establishment_ad_slots;
create trigger trg_establishment_ad_slots_updated_at before update on public.establishment_ad_slots for each row execute function public.touch_world_updated_at();

-- Leitura pública restrita ao conteúdo efetivamente publicado/ativo.
alter table public.cities enable row level security;
alter table public.establishments enable row level security;
alter table public.establishment_offers enable row level security;
alter table public.establishment_media enable row level security;
alter table public.establishment_ad_slots enable row level security;

drop policy if exists "public_read_active_cities" on public.cities;
create policy "public_read_active_cities" on public.cities for select to anon, authenticated using (is_active = true);

drop policy if exists "public_read_published_establishments" on public.establishments;
create policy "public_read_published_establishments" on public.establishments for select to anon, authenticated using (status = 'published' and is_active = true);

drop policy if exists "public_read_published_establishment_offers" on public.establishment_offers;
create policy "public_read_published_establishment_offers" on public.establishment_offers for select to anon, authenticated using (
  is_available = true and exists (
    select 1 from public.establishments e
    where e.id = establishment_offers.establishment_id and e.status = 'published' and e.is_active = true
  )
);

drop policy if exists "public_read_published_establishment_media" on public.establishment_media;
create policy "public_read_published_establishment_media" on public.establishment_media for select to anon, authenticated using (
  exists (
    select 1 from public.establishments e
    where e.id = establishment_media.establishment_id and e.status = 'published' and e.is_active = true
  )
);

drop policy if exists "public_read_published_establishment_ad_slots" on public.establishment_ad_slots;
create policy "public_read_published_establishment_ad_slots" on public.establishment_ad_slots for select to anon, authenticated using (
  is_active = true and exists (
    select 1 from public.establishments e
    where e.id = establishment_ad_slots.establishment_id and e.status = 'published' and e.is_active = true
  )
);

comment on table public.cities is 'Cidades persistentes do universo do Rota da Justiça.';
comment on table public.establishments is 'Empresas e pontos comerciais persistentes, fictícios ou reais/patrocinados.';
comment on column public.establishments.is_fictional is 'True para marcas inventadas pelo jogo/IA; false quando representar estabelecimento real autorizado.';
comment on column public.establishments.is_sponsored is 'True apenas quando houver relação comercial/patrocínio real cadastrado pelo administrador.';
comment on table public.establishment_offers is 'Produtos/serviços jogáveis: aluguel de salas, hospedagem, veículos, serviços e vendas.';
comment on table public.establishment_ad_slots is 'Inventário de mídia in-game preparado para monetização futura.';

commit;
