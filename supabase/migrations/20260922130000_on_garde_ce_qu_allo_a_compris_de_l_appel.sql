-- ════════════════════════════════════════════════════════════════════════════════════════════
-- CE QU'ALLÔ A COMPRIS DE L'APPEL, ET QU'ON JETAIT
-- ════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 22/09/2026, en corrigeant mon premier modèle de score : « le plus important est ce
-- qu'il y a dans cette réponse. Car s'il répond à un mail en nous disant qu'on l'emmerde et qu'il
-- ne veut plus jamais nous parler, impossible de lui accorder +30. »
--
-- Il a raison, et sa remarque a fait chercher au bon endroit : ALLÔ CLASSE DÉJÀ LE CONTENU de
-- chaque appel. Chaque `call.completed` porte des étiquettes — `interested`, `not_interested`,
-- `to_call_back`, `follow_up_later`, `meeting_booked` — produites par leur modèle à partir de la
-- transcription. Relevé sur leur API le 22/09/2026, sur 9 726 appels sortants :
--
--     « réponse du destinataire négative »        → not_interested
--     « Rendez-vous fixé au 29 pour finaliser »   → meeting_booked, follow_up_later
--     « Echange sur contrats et validation »      → interested
--
-- NOTRE WEBHOOK LES IGNORAIT. Il gardait le résultat technique (`ANSWERED`, `VOICEMAIL`), la durée
-- et le résumé, mais pas la seule donnée qui dise si l'échange s'est bien ou mal passé. C'est
-- exactement le signal qui manquait au score de santé de la relation.
--
-- ══ POURQUOI UN TABLEAU DE TEXTE ET NON UNE TABLE DE LIAISON ══
--
-- Un appel porte zéro à trois étiquettes, prises dans une liste courte que NOUS NE CONTRÔLONS PAS :
-- Allô peut en ajouter demain sans nous prévenir. Une table de référence exigerait d'y insérer
-- toute valeur inconnue avant de pouvoir écrire l'appel — donc de faire échouer un webhook sur une
-- étiquette nouvelle. Un `text[]` accepte ce qui vient, et l'écran décide de ce qu'il en fait.
--
-- ON NE TRADUIT PAS À L'ÉCRITURE : les valeurs sont stockées telles qu'Allô les envoie. Traduire à
-- l'entrée rendrait impossible de distinguer une étiquette inconnue d'une étiquette mal traduite,
-- et interdirait de réinterpréter l'historique le jour où le barème change.

alter table public.interactions
  add column if not exists etiquettes_allo text[];

alter table public.appels_en_cours
  add column if not exists etiquettes_allo text[];

comment on column public.interactions.etiquettes_allo is
  'Les étiquettes de contenu produites par Allô (interested, not_interested, to_call_back, follow_up_later, meeting_booked). Stockées telles quelles — voir la migration du 22/09/2026.';
comment on column public.appels_en_cours.etiquettes_allo is
  'Idem, sur la carte d''appel : le webhook les écrit dès `call.completed`.';

-- L'INDEX SERT LA QUESTION DU SCORE : « les échanges à teneur connue de ce contact ». `gin` parce
-- qu'on interroge l'APPARTENANCE à un tableau (`etiquettes_allo && array['interested']`), ce qu'un
-- index classique ne sait pas faire.
create index if not exists idx_interactions_etiquettes_allo
  on public.interactions using gin (etiquettes_allo)
  where etiquettes_allo is not null;
