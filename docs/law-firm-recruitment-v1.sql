-- Rota da Justiça — Recruitment V1 / tipos oficiais de proposta
-- Execute no Supabase somente depois de revisar se existem propostas legadas INITIAL/RECRUITMENT.

begin;

-- Os tipos INITIAL e RECRUITMENT ficaram ambíguos no contrato novo. Não fazemos
-- conversão automática para não alterar a origem histórica de uma proposta já existente.
do $$
begin
  if exists (
    select 1
    from public.career_law_firm_offers
    where offer_type in ('INITIAL', 'RECRUITMENT')
  ) then
    raise exception using
      message = 'Existem propostas legadas com offer_type INITIAL ou RECRUITMENT.',
      hint = 'Revise essas linhas e converta conscientemente para POST_OAB, CONTINUITY, HEADHUNTING ou POST_TERMINATION antes de executar novamente.';
  end if;
end $$;

alter table public.career_law_firm_offers
  drop constraint if exists career_law_firm_offer_type_valid;

alter table public.career_law_firm_offers
  add constraint career_law_firm_offer_type_valid
  check (
    offer_type in (
      'POST_OAB',
      'CONTINUITY',
      'HEADHUNTING',
      'APPLICATION_APPROVED',
      'POST_TERMINATION',
      'COUNTEROFFER',
      'RETURN'
    )
  );

-- Idempotência no banco: o motor não pode deixar duas propostas pendentes
-- equivalentes para a mesma carreira, escritório, cargo e origem.
create unique index if not exists idx_law_firm_offers_unique_pending_origin
  on public.career_law_firm_offers (career_id, law_firm_id, role_id, offer_type)
  where status = 'PENDING';

comment on column public.career_law_firm_offers.offer_type is
  'Recruitment V1: POST_OAB, CONTINUITY, HEADHUNTING, APPLICATION_APPROVED, POST_TERMINATION, COUNTEROFFER ou RETURN.';

commit;
