-- Diagnóstico do módulo de estabelecimentos do Rota da Justiça
-- Somente leitura. Mostra se o projeto atual possui as tabelas/colunas exigidas.

select
  to_regclass('public.cities') as cities,
  to_regclass('public.establishments') as establishments,
  to_regclass('public.establishment_offers') as establishment_offers,
  to_regclass('public.establishment_media') as establishment_media,
  to_regclass('public.establishment_ad_slots') as establishment_ad_slots;

select
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'establishments' and column_name in ('presence_scope','banner_url','business_type','status','is_active'))
    or
    (table_name = 'establishment_offers' and column_name in ('image_url','gameplay_effects','metadata'))
  )
order by table_name, column_name;

select
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.establishments'::regclass
  and conname in ('establishments_presence_scope_check','establishments_business_type_check')
order by conname;


-- Permissões efetivas das roles usadas pelo jogo.
select
  has_table_privilege('anon', 'public.cities', 'select') as anon_cities,
  has_table_privilege('anon', 'public.establishments', 'select') as anon_establishments,
  has_table_privilege('anon', 'public.establishment_offers', 'select') as anon_offers,
  has_table_privilege('authenticated', 'public.cities', 'select') as authenticated_cities,
  has_table_privilege('authenticated', 'public.establishments', 'select') as authenticated_establishments,
  has_table_privilege('authenticated', 'public.establishment_offers', 'select') as authenticated_offers;

-- O Hotel Oásis, se existir, deve aparecer aqui como published/active.
select
  e.id,
  e.name,
  e.slug,
  e.status,
  e.is_active,
  e.presence_scope,
  c.name as city_name,
  c.state_code
from public.establishments e
left join public.cities c on c.id = e.city_id
where lower(e.slug) = 'hotel-oasis'
   or lower(e.name) = 'hotel oásis'
   or lower(e.name) = 'hotel oasis';
