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

commit;

-- Força o PostgREST/Supabase API a enxergar imediatamente as novas colunas.
notify pgrst, 'reload schema';
