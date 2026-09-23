-- Rota da Justiça — liberar leitura segura do mundo comercial para o jogo
-- Pode ser executado em banco já existente. Não apaga nem altera estabelecimentos.

begin;

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

notify pgrst, 'reload schema';
