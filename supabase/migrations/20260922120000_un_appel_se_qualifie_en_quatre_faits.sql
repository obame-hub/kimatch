-- ════════════════════════════════════════════════════════════════════════════════════════════
-- CE QU'UN APPEL APPREND, ET QUE PERSONNE D'AUTRE NE SAIT
-- ════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 22/09/2026, sur la fenêtre d'appel du sprint : « c'est là qu'il va falloir intégrer les
-- informations permettant d'enrichir l'appel ».
--
-- `qualification` EXISTAIT DÉJÀ — humain, répondeur, serveur vocal, pas de réponse. Elle répond à
-- « qui a décroché ». Il manquait les trois faits qui suivent, et qui n'ont de sens que si un
-- humain était au bout du fil :
--
--   · À QUI on a parlé : le contact de la fiche, ou quelqu'un d'autre — et alors qui.
--   · CE QUE ÇA VALAIT : l'aura, de 1 (très négatif) à 5 (très positif).
--   · CE QUE ÇA DONNE : l'issue, qui décide de la suite.
--
-- ══ POURQUOI DES COLONNES ET NON UN `jsonb` ══
--
-- Ces quatre faits seront lus par des compteurs, des filtres et un jour un tableau de bord : « les
-- appels d'aura 4 et 5 de la semaine », « combien de refus clairs ce mois-ci ». Un `jsonb` rendrait
-- chacune de ces questions coûteuse et non indexable, pour la seule économie d'une migration.
--
-- ══ LES CONTRAINTES SONT DANS LA BASE, PAS SEULEMENT DANS L'ÉCRAN ══
--
-- `qualification` porte déjà un `check` depuis sa création. Les trois nouvelles colonnes suivent la
-- même règle : un écran peut se tromper, un import peut arriver par un autre chemin, et une valeur
-- hors liste ne se découvre qu'au moment où un graphique affiche une barre « null ».

alter table public.appels_en_cours
  add column if not exists interlocuteur text,
  add column if not exists interlocuteur_nom text,
  add column if not exists aura smallint,
  add column if not exists issue text;

comment on column public.appels_en_cours.interlocuteur is
  'CONTACT quand on a eu la personne de la fiche, AUTRE sinon — voir interlocuteur_nom.';
comment on column public.appels_en_cours.interlocuteur_nom is
  'Qui était au bout du fil quand ce n''est pas le contact renseigné. Texte libre : on ne sait pas d''avance.';
comment on column public.appels_en_cours.aura is
  'De 1 (très négatif) à 5 (très positif). N''a de sens qu''avec qualification = HUMAIN.';
comment on column public.appels_en_cours.issue is
  'Ce que l''appel donne : INTERESSE, FACTURES, INDIFFERENT, PAS_LE_BON_MOMENT, REFUS, DEJA_RENEGOCIE.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appels_en_cours_interlocuteur_check') then
    alter table public.appels_en_cours
      add constraint appels_en_cours_interlocuteur_check
      check (interlocuteur is null or interlocuteur in ('CONTACT', 'AUTRE'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'appels_en_cours_aura_check') then
    alter table public.appels_en_cours
      add constraint appels_en_cours_aura_check
      check (aura is null or aura between 1 and 5);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'appels_en_cours_issue_check') then
    alter table public.appels_en_cours
      add constraint appels_en_cours_issue_check
      check (issue is null or issue in (
        'INTERESSE', 'FACTURES', 'INDIFFERENT', 'PAS_LE_BON_MOMENT', 'REFUS', 'DEJA_RENEGOCIE'
      ));
  end if;
end $$;

-- L'INDEX SERT LA QUESTION QU'ON POSERA : « mes appels aboutis de la semaine, par issue ». Partiel,
-- parce que 75 % des lignes n'ont pas d'issue et n'en auront jamais — un répondeur n'en a pas.
create index if not exists idx_appels_en_cours_issue
  on public.appels_en_cours (profil_id, demarre_le desc)
  where issue is not null;
