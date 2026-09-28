-- Même règle que la migration précédente, pour le déclencheur posé le 26/09/2026 : un rouage n'est
-- appelable par personne. Il se déclenche à la création d'une requête, et c'est tout.
revoke execute on function public.fn_notifier_nouvelle_requete() from public, anon, authenticated;
