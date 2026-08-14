-- ============================================================================================
-- Santé de la session DocuSign : de quoi savoir si elle va tomber, et le dire à l'utilisateur
-- ============================================================================================
-- Retour de William (14/08/2026) sur son expérience de Tools : « les sessions DocuSign avaient
-- tendance à crasher, il fallait se reconnecter tous les jours, c'est ingérable » et « si le compte
-- s'est déconnecté, il faut absolument qu'on le voie en très gros ».
--
-- La vue exposait `expire_le`, qui est l'expiration de l'ACCESS token — huit heures. Inutilisable
-- pour prévenir : elle serait « expirée » chaque nuit alors que la session est parfaitement saine,
-- l'access token étant rafraîchi tout seul au premier envoi.
--
-- Ce qui détermine réellement la survie d'une session, c'est le REFRESH token : trente jours chez
-- DocuSign, remis à zéro à chaque rafraîchissement. Comme date_modification est mise à jour à
-- chacun d'eux, elle date le dernier renouvellement — d'où refresh_expire_le.
--
-- Le seuil d'alerte est à sept jours restants : assez tôt pour que quelqu'un qui ne se connecte
-- qu'une fois par semaine voie l'avertissement avant la coupure, assez tard pour ne pas afficher un
-- bandeau permanent.
-- ============================================================================================

begin;

drop view if exists public.docusign_connexions;

create view public.docusign_connexions with (security_invoker = false) as
  select profil_id,
         docusign_email,
         docusign_nom,
         account_id,
         account_nom,
         expire_le,
         date_creation,
         date_modification,
         -- Trente jours après le dernier rafraîchissement : au-delà, DocuSign refuse le refresh
         -- token et il faut réautoriser.
         (date_modification + interval '30 days') as refresh_expire_le,
         (date_modification + interval '30 days') < now() as expiree,
         (date_modification + interval '23 days') < now() as bientot_expiree
    from public.docusign_sessions
   where profil_id = auth.uid();

grant select on public.docusign_connexions to authenticated;

comment on view public.docusign_connexions is
  'Etat de la connexion DocuSign de l''utilisateur courant, sans les jetons. refresh_expire_le dit quand la session mourra si personne ne l''utilise.';

commit;
