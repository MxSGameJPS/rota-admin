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
