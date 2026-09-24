-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- UN DEAL GAGNÉ SE CRIE DANS LE BON CANAL
-- ════════════════════════════════════════════════════════════════════════════════════════════════
--
-- William, 24/09/2026 : « une fois qu'une opportunité est clôturée (Acceptée), un message de
-- félicitation doit être envoyé dans le canal Slack "deals-gagnés". Le plus important est de savoir
-- qui a signé (le propriétaire de la recommandation) ainsi que le champ montant. »
--
-- `parametres_slack` porte déjà trois modules — compte, contrat, mandat — chacun avec son canal et
-- son interrupteur. Le quatrième suit la même mécanique : rien de neuf à inventer, une ligne de
-- plus, et l'écran Paramètres sait déjà la piloter.
--
-- ══ DÉSACTIVÉ À L'ARRIVÉE, ET C'EST VOULU ══
--
-- La ligne naît sans canal et à `false`. Publier dans un canal que personne n'a choisi, c'est
-- écrire au hasard dans un espace de travail entier. William désignera « deals-gagnés » dans
-- Paramètres → Slack, et l'interrupteur s'allumera à ce moment-là. `api/slack/notify` refuse déjà
-- poliment (`skipped`) tant que l'un des deux manque.

insert into parametres_slack (module, channel_id, channel_name, enabled)
values ('deal', null, null, false)
on conflict (module) do nothing;
