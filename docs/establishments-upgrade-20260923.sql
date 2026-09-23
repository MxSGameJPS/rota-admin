-- Rota da Justiça — upgrade consolidado do módulo de estabelecimentos
-- Use em bancos que JÁ possuem cities/establishments e foram criados antes
-- das mecânicas UNIVERSAL + produtos de vida cotidiana.
-- Idempotente: pode ser executado novamente sem apagar estabelecimentos existentes.

begin;

alter table public.establishments
  add column if not exists presence_scope text not null default 'CITY';

alter table public.establishments
  add column if not exists banner_url text;

update public.establishments
set presence_scope = 'CITY'
where presence_scope is null
   or presence_scope not in ('CITY', 'UNIVERSAL');

alter table public.establishments
  drop constraint if exists establishments_presence_scope_check;

alter table public.establishments
  add constraint establishments_presence_scope_check
  check (presence_scope in ('CITY', 'UNIVERSAL'));

alter table public.establishments
  drop constraint if exists establishments_business_type_check;

alter table public.establishments
  add constraint establishments_business_type_check
  check (business_type in (
    'IMOBILIARIA','HOTEL','POUSADA','LOCADORA','CONCESSIONARIA','LOJA_VEICULOS','LOJA_MOVEIS','ESCRITORIO',
    'RESTAURANTE','FARMACIA','MERCADO','POSTO','ACADEMIA','CLINICA','BANCO','SHOPPING','OUTRO'
  ));

alter table public.establishment_offers
  add column if not exists image_url text;

alter table public.establishment_offers
  add column if not exists gameplay_effects jsonb not null default '{}'::jsonb;

alter table public.establishment_offers
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists establishments_presence_scope_idx
  on public.establishments(presence_scope, status, is_active);

comment on column public.establishments.presence_scope is
  'CITY limita à cidade cadastrada; UNIVERSAL faz o estabelecimento aparecer em qualquer cidade-base do jogador.';

-- O Rota Admin usa service_role, mas o jogo usa a chave pública.
-- Garante leitura pública somente do conteúdo publicado/ativo.
grant select on table public.cities to anon, authenticated;
grant select on table public.establishments to anon, authenticated;
grant select on table public.establishment_offers to anon, authenticated;
grant select on table public.establishment_media to anon, authenticated;
grant select on table public.establishment_ad_slots to anon, authenticated;

alter table public.cities enable row level security;
alter table public.establishments enable row level security;
alter table public.establishment_offers enable row level security;
alter table public.establishment_media enable row level security;
alter table public.establishment_ad_slots enable row level security;

drop policy if exists "public_read_active_cities" on public.cities;
create policy "public_read_active_cities"
  on public.cities
  for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "public_read_published_establishments" on public.establishments;
create policy "public_read_published_establishments"
  on public.establishments
  for select
  to anon, authenticated
  using (status = 'published' and is_active = true);

drop policy if exists "public_read_published_establishment_offers" on public.establishment_offers;
create policy "public_read_published_establishment_offers"
  on public.establishment_offers
  for select
  to anon, authenticated
  using (
    is_available = true
    and exists (
      select 1
      from public.establishments e
      where e.id = establishment_offers.establishment_id
        and e.status = 'published'
        and e.is_active = true
    )
  );

drop policy if exists "public_read_published_establishment_media" on public.establishment_media;
create policy "public_read_published_establishment_media"
  on public.establishment_media
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.establishments e
      where e.id = establishment_media.establishment_id
        and e.status = 'published'
        and e.is_active = true
    )
  );

drop policy if exists "public_read_published_establishment_ad_slots" on public.establishment_ad_slots;
create policy "public_read_published_establishment_ad_slots"
  on public.establishment_ad_slots
  for select
  to anon, authenticated
  using (
    is_active = true
    and exists (
      select 1
      from public.establishments e
      where e.id = establishment_ad_slots.establishment_id
        and e.status = 'published'
        and e.is_active = true
    )
  );

commit;

-- Força o PostgREST/Supabase API a enxergar imediatamente as novas colunas.
notify pgrst, 'reload schema';
