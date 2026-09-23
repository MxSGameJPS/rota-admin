-- Rota da Justiça — feed público controlado de estabelecimentos do game
-- Retorna somente conteúdo publicado/ativo da cidade pedida + universais.
-- SECURITY DEFINER permite ler o catálogo interno sem expor tabelas privadas
-- ou depender de joins RLS feitos diretamente pela chave anon do jogo.

begin;

create or replace function public.get_game_establishments(
  p_city text,
  p_state text
)
returns table (
  id uuid,
  city_id uuid,
  slug text,
  name text,
  business_type text,
  subcategory text,
  description text,
  slogan text,
  district text,
  street_name text,
  number_reference text,
  latitude numeric,
  longitude numeric,
  price_range text,
  game_use_type text,
  presence_scope text,
  is_sponsored boolean,
  sponsor_name text,
  is_visitable boolean,
  allow_map_highlight boolean,
  logo_url text,
  banner_url text,
  cover_image_url text,
  city_name text,
  state_code text,
  offers jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.city_id,
    e.slug,
    e.name,
    e.business_type,
    e.subcategory,
    e.description,
    e.slogan,
    e.district,
    e.street_name,
    e.number_reference,
    e.latitude,
    e.longitude,
    e.price_range,
    e.game_use_type,
    e.presence_scope,
    e.is_sponsored,
    e.sponsor_name,
    e.is_visitable,
    e.allow_map_highlight,
    e.logo_url,
    e.banner_url,
    e.cover_image_url,
    c.name as city_name,
    c.state_code,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', o.id,
            'establishment_id', o.establishment_id,
            'title', o.title,
            'offer_type', o.offer_type,
            'description', o.description,
            'price', o.price,
            'period_type', o.period_type,
            'image_url', o.image_url,
            'is_available', o.is_available,
            'sort_order', o.sort_order,
            'gameplay_effects', o.gameplay_effects
          )
          order by o.sort_order asc, o.created_at asc
        )
        from public.establishment_offers o
        where o.establishment_id = e.id
          and o.is_available = true
      ),
      '[]'::jsonb
    ) as offers
  from public.establishments e
  join public.cities c on c.id = e.city_id
  where e.status = 'published'
    and e.is_active = true
    and c.is_active = true
    and (
      e.presence_scope = 'UNIVERSAL'
      or (
        lower(trim(c.name)) = lower(trim(p_city))
        and upper(trim(c.state_code)) = upper(trim(p_state))
      )
    )
  order by e.is_sponsored desc, e.name asc;
$$;

revoke all on function public.get_game_establishments(text, text) from public;
grant execute on function public.get_game_establishments(text, text) to anon, authenticated;

commit;

notify pgrst, 'reload schema';
