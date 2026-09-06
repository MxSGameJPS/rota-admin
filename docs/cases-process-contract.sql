-- Rota da Justiça — contrato de repercussão, instância e continuidade processual
-- Aplicar no mesmo projeto Supabase usado pelo Rota Admin e pelo game.
-- Migration idempotente: pode ser executada novamente caso uma tentativa anterior tenha falhado.

begin;

alter table public.cases
  add column if not exists repercussion_level text,
  add column if not exists procedural_stage text,
  add column if not exists court_name text,
  add column if not exists process_key text,
  add column if not exists appeal_of_case_id text,
  add column if not exists appeal_type text,
  add column if not exists appeal_trigger text,
  add column if not exists appeal_deadline_days integer;

-- Os campos abaixo são opcionais no contrato novo. Alguns bancos legados já possuíam
-- essas colunas com NOT NULL/defaults; removemos essas restrições antes do backfill.
alter table public.cases
  alter column court_name drop not null,
  alter column appeal_of_case_id drop not null,
  alter column appeal_type drop not null,
  alter column appeal_trigger drop not null,
  alter column appeal_deadline_days drop not null;

alter table public.cases
  alter column court_name drop default,
  alter column appeal_of_case_id drop default,
  alter column appeal_type drop default,
  alter column appeal_trigger drop default,
  alter column appeal_deadline_days drop default;

-- Normaliza strings vazias de tentativas anteriores/edições manuais.
update public.cases
set
  court_name = nullif(btrim(court_name), ''),
  process_key = nullif(btrim(process_key), ''),
  appeal_of_case_id = nullif(btrim(appeal_of_case_id), ''),
  appeal_type = nullif(btrim(appeal_type), ''),
  appeal_trigger = nullif(btrim(appeal_trigger), '');

-- Casos legados recebem os valores neutros do novo contrato.
update public.cases
set repercussion_level = 'COMUM'
where repercussion_level is null
   or btrim(repercussion_level) = ''
   or repercussion_level not in ('COMUM', 'RELEVANTE', 'GRANDE_REPERCUSSAO', 'NACIONAL');

update public.cases
set procedural_stage = 'PRIMEIRA_INSTANCIA'
where procedural_stage is null
   or btrim(procedural_stage) = ''
   or procedural_stage not in ('PRIMEIRA_INSTANCIA', 'SEGUNDA_INSTANCIA', 'STJ', 'STF');

update public.cases
set process_key = id
where process_key is null or btrim(process_key) = '';

-- Um caso sem fase anterior não pode carregar metadados de recurso isolados.
-- Isso limpa resíduos de versões antigas sem alterar casos que têm vínculo válido.
update public.cases
set
  appeal_type = null,
  appeal_trigger = null,
  appeal_deadline_days = null
where appeal_of_case_id is null
  and (
    appeal_type is not null
    or appeal_trigger is not null
    or appeal_deadline_days is not null
  );

-- Self-reference ou referência para um caso inexistente não forma uma cadeia processual válida.
-- Como essas linhas não possuem uma fase anterior utilizável, voltam a ser casos independentes.
update public.cases as child
set
  process_key = child.id,
  appeal_of_case_id = null,
  appeal_type = null,
  appeal_trigger = null,
  appeal_deadline_days = null
where child.appeal_of_case_id is not null
  and (
    child.appeal_of_case_id = child.id
    or not exists (
      select 1
      from public.cases as parent
      where parent.id = child.appeal_of_case_id
    )
  );

-- Para vínculos reais já existentes, mantém o mesmo process_key da fase anterior e
-- completa apenas os campos obrigatórios que estiverem ausentes/inválidos.
update public.cases as child
set
  process_key = parent.process_key,
  appeal_type = case
    when child.appeal_type in (
      'APELACAO',
      'AGRAVO_INSTRUMENTO',
      'AGRAVO_INTERNO',
      'RECURSO_ESPECIAL',
      'RECURSO_EXTRAORDINARIO',
      'AGRAVO_RECURSO_ESPECIAL',
      'AGRAVO_RECURSO_EXTRAORDINARIO',
      'OUTRO'
    ) then child.appeal_type
    else 'OUTRO'
  end,
  appeal_trigger = case
    when child.appeal_trigger in ('PLAYER_LOSS', 'PLAYER_WIN_OPPONENT_APPEALS', 'ANY_RESULT')
      then child.appeal_trigger
    else 'PLAYER_LOSS'
  end,
  appeal_deadline_days = case
    when child.appeal_deadline_days is not null and child.appeal_deadline_days > 0
      then child.appeal_deadline_days
    else 15
  end
from public.cases as parent
where child.appeal_of_case_id = parent.id
  and child.id <> parent.id;

alter table public.cases
  alter column repercussion_level set default 'COMUM',
  alter column repercussion_level set not null,
  alter column procedural_stage set default 'PRIMEIRA_INSTANCIA',
  alter column procedural_stage set not null,
  alter column process_key set not null;

alter table public.cases drop constraint if exists cases_repercussion_level_check;
alter table public.cases add constraint cases_repercussion_level_check
  check (repercussion_level in ('COMUM', 'RELEVANTE', 'GRANDE_REPERCUSSAO', 'NACIONAL'));

alter table public.cases drop constraint if exists cases_procedural_stage_check;
alter table public.cases add constraint cases_procedural_stage_check
  check (procedural_stage in ('PRIMEIRA_INSTANCIA', 'SEGUNDA_INSTANCIA', 'STJ', 'STF'));

alter table public.cases drop constraint if exists cases_appeal_type_check;
alter table public.cases add constraint cases_appeal_type_check
  check (
    appeal_type is null or appeal_type in (
      'APELACAO',
      'AGRAVO_INSTRUMENTO',
      'AGRAVO_INTERNO',
      'RECURSO_ESPECIAL',
      'RECURSO_EXTRAORDINARIO',
      'AGRAVO_RECURSO_ESPECIAL',
      'AGRAVO_RECURSO_EXTRAORDINARIO',
      'OUTRO'
    )
  );

alter table public.cases drop constraint if exists cases_appeal_trigger_check;
alter table public.cases add constraint cases_appeal_trigger_check
  check (appeal_trigger is null or appeal_trigger in ('PLAYER_LOSS', 'PLAYER_WIN_OPPONENT_APPEALS', 'ANY_RESULT'));

alter table public.cases drop constraint if exists cases_appeal_deadline_days_check;
alter table public.cases add constraint cases_appeal_deadline_days_check
  check (appeal_deadline_days is null or appeal_deadline_days > 0);

alter table public.cases drop constraint if exists cases_appeal_fields_consistency_check;
alter table public.cases add constraint cases_appeal_fields_consistency_check
  check (
    (
      appeal_of_case_id is null
      and appeal_type is null
      and appeal_trigger is null
      and appeal_deadline_days is null
    )
    or
    (
      appeal_of_case_id is not null
      and appeal_of_case_id <> id
      and appeal_type is not null
      and appeal_trigger is not null
      and appeal_deadline_days is not null
    )
  );

alter table public.cases drop constraint if exists cases_appeal_of_case_id_fkey;
alter table public.cases add constraint cases_appeal_of_case_id_fkey
  foreign key (appeal_of_case_id)
  references public.cases(id)
  on update cascade
  on delete restrict;

create index if not exists cases_process_key_idx on public.cases(process_key);
create index if not exists cases_appeal_of_case_id_idx on public.cases(appeal_of_case_id) where appeal_of_case_id is not null;
create index if not exists cases_procedural_stage_idx on public.cases(procedural_stage);
create index if not exists cases_repercussion_level_idx on public.cases(repercussion_level);

create or replace function public.validate_case_process_link()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent_process_key text;
begin
  if new.appeal_of_case_id is null then
    return new;
  end if;

  select c.process_key
    into parent_process_key
  from public.cases as c
  where c.id = new.appeal_of_case_id;

  if not found then
    raise exception 'Fase anterior não encontrada: %', new.appeal_of_case_id;
  end if;

  if parent_process_key is distinct from new.process_key then
    raise exception 'Continuação % deve manter process_key % da fase anterior %, mas recebeu %',
      new.id, parent_process_key, new.appeal_of_case_id, new.process_key;
  end if;

  return new;
end;
$$;

revoke all on function public.validate_case_process_link() from public;
grant execute on function public.validate_case_process_link() to service_role;

drop trigger if exists trg_validate_case_process_link on public.cases;
create trigger trg_validate_case_process_link
before insert or update of process_key, appeal_of_case_id, appeal_type, appeal_trigger, appeal_deadline_days
on public.cases
for each row
execute function public.validate_case_process_link();

comment on column public.cases.repercussion_level is 'COMUM, RELEVANTE, GRANDE_REPERCUSSAO ou NACIONAL. O game aplica multiplicador sobre xp_reward e bônus adicional de reputação.';
comment on column public.cases.procedural_stage is 'PRIMEIRA_INSTANCIA, SEGUNDA_INSTANCIA, STJ ou STF.';
comment on column public.cases.process_key is 'Identificador lógico compartilhado por todas as fases do mesmo processo.';
comment on column public.cases.appeal_of_case_id is 'ID da fase imediatamente anterior do mesmo processo.';
comment on column public.cases.appeal_trigger is 'PLAYER_LOSS, PLAYER_WIN_OPPONENT_APPEALS ou ANY_RESULT.';

commit;
