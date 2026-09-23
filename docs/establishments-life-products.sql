-- Rota da Justiça — loja de móveis e produtos de vida cotidiana
-- Atualiza apenas a constraint de tipos comerciais; gameplay de produtos usa JSON já existente.

begin;

alter table public.establishments
  drop constraint if exists establishments_business_type_check;

alter table public.establishments
  add constraint establishments_business_type_check
  check (business_type in (
    'IMOBILIARIA','HOTEL','POUSADA','LOCADORA','CONCESSIONARIA','LOJA_VEICULOS','LOJA_MOVEIS','ESCRITORIO',
    'RESTAURANTE','FARMACIA','MERCADO','POSTO','ACADEMIA','CLINICA','BANCO','SHOPPING','OUTRO'
  ));

commit;
