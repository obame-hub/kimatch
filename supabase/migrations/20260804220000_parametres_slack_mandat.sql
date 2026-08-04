-- Flot Mandat : nouveau module de notification Slack "mandat" (signature + synchro GRD auto),
-- au même titre que "compte"/"contrat" déjà en place. Désactivé par défaut, à activer et
-- configurer (canal) depuis Paramètres > Notifications Slack.
insert into public.parametres_slack (module, channel_id, channel_name, enabled)
values ('mandat', null, null, false)
on conflict (module) do nothing;
