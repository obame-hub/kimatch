-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LE COMPLÉMENT D'ADRESSE D'UN COMPTEUR
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 01/10/2026 : l'adresse du bloc « Le lieu » se lit sur quatre lignes — n° et rue, complément
-- (masqué si vide), code postal et ville, département. Le complément (bâtiment, escalier, lieu-dit…)
-- n'avait pas de champ : il finissait collé à la rue, ou nulle part.
alter table public.compteurs add column if not exists complement_adresse text;
comment on column public.compteurs.complement_adresse is
  'Complement d''adresse du point de consommation (batiment, escalier, lieu-dit...). Facultatif.';
