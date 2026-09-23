-- Rota da Justiça — escopo universal de estabelecimentos
-- Execute em bancos que já possuem docs/establishments-world.sql.

begin;

alter table public.establishments
  add column if not exists presence_scope text not null default 'CITY';

alter table public.establishments
  drop constraint if exists establishments_presence_scope_check;

alter table public.establishments
  add constraint establishments_presence_scope_check
  check (presence_scope in ('CITY', 'UNIVERSAL'));

update public.establishments
set presence_scope = 'CITY'
where presence_scope is null
   or presence_scope not in ('CITY', 'UNIVERSAL');

create index if not exists establishments_presence_scope_idx
  on public.establishments(presence_scope, status, is_active);

comment on column public.establishments.presence_scope is
  'CITY limita à cidade cadastrada; UNIVERSAL faz o estabelecimento aparecer em qualquer cidade-base do jogador.';

commit;
