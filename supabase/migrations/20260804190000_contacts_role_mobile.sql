-- Flot Contact (Tools) : rôle du contact (Décisionnaire / Administratif / Conseil syndical,
-- ce dernier réservé aux syndics) + numéro de mobile distinct du fixe existant `telephone`.
alter table public.contacts
  add column if not exists role text,
  add column if not exists telephone_mobile text;

comment on column public.contacts.role is 'Décisionnaire | Administratif | Conseil syndical (syndics uniquement) — voir contact_principal, dérivé de role = Décisionnaire';
comment on column public.contacts.telephone_mobile is 'Mobile, distinct de contacts.telephone (fixe)';
