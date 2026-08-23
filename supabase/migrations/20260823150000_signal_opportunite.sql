-- Le signal qui ouvre l'opportunité, dans son propre champ.
--
-- MICHEL, 23/08/2026 : « Pour lancer une opportunité il nous faut au minimum : un signal et un
-- contact. » Le signal devient donc un prérequis DUR de création, et non plus une information de
-- contexte.
--
-- POURQUOI UNE COLONNE PLUTÔT QUE LE COMMENTAIRE. La conversion d'une piste écrivait le signal dans
-- `commentaire`, et le contrôle de prérequis se contentait de « il y a un commentaire, donc il y a un
-- signal ». C'est exactement le raccourci qu'il faut éviter : n'importe quelle note libre validait le
-- prérequis. Avec un champ dédié, « y a-t-il un signal » se répond par oui ou non.
--
-- DEUX FAÇONS DE PORTER LE SIGNAL, ET C'EST VOULU. `signal_id` pointe un signal enregistré (la table
-- `signaux` en compte 864, onze types) ; `signal_libelle` porte celui que le commercial constate sans
-- qu'il soit enregistré — « échéance connue à moins de 2 ans », « demande explicite du client »,
-- « marché favorable », « potentiel d'optimisation TURPE ». L'un ou l'autre suffit.
--
-- PAS DE SCORE. Michel, le même jour : « je ne préfère pas utiliser le concept de score pour le
-- moment, ça va nous embrouiller — je préfère qu'on gère des scores un peu plus tard, avec de
-- l'historique ». La colonne `score_maturite` reste donc en place mais inutilisée, et la maturité se
-- lit à la validité des objets : un signal, un contact, un compte, des compteurs sous mandat, un
-- accord.

begin;

alter table public.opportunites add column if not exists signal_libelle text;

comment on column public.opportunites.signal_libelle is
  'Signal positif constate sans etre enregistre dans `signaux`. Prerequis de creation (Michel, 23/08/2026) : signal + contact au minimum. Alternative a `signal_id`, l''un ou l''autre suffit.';

commit;
