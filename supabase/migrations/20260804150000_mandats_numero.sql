-- Demande de William (04/08/2026) : afficher un numero de mandat lisible
-- (ex. "Mandat 000099") pour faciliter les verifications manuelles d'Agathe/Erwan.
create sequence if not exists public.mandats_numero_seq;

alter table public.mandats add column if not exists numero integer;

-- Backfill des mandats deja migres, dans l'ordre chronologique de creation.
with ordered as (
  select id, row_number() over (order by date_creation, id) as rn
  from public.mandats
  where numero is null
)
update public.mandats m
set numero = ordered.rn
from ordered
where ordered.id = m.id;

select setval('public.mandats_numero_seq', coalesce((select max(numero) from public.mandats), 0));

alter table public.mandats alter column numero set default nextval('public.mandats_numero_seq');
alter table public.mandats alter column numero set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mandats_numero_unique') then
    alter table public.mandats add constraint mandats_numero_unique unique (numero);
  end if;
end $$;
