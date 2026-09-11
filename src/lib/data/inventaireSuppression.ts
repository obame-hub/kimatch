import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * ══ CE QU'UNE SUPPRESSION VA VRAIMENT EMPORTER ══
 *
 * Naoëlle, 07/09/2026, après que Guillaume a supprimé un compte : « il faudrait que quand on
 * supprime un compte et n'importe quel objet, on ait une pop-up qui montre tous les objets liés qui
 * vont être supprimés. »
 *
 * ══ POURQUOI CE FICHIER EXISTE : LA POPUP DISAIT LE CONTRAIRE DE LA VÉRITÉ ══
 *
 * Le texte affiché avant ce jour, mot pour mot : « Cette action est irréversible. Les sites,
 * contacts et contrats rattachés NE SERONT PAS SUPPRIMÉS mais perdront leur lien à ce compte. »
 *
 * Les trois affirmations sont fausses. Relevé dans le schéma le 07/09/2026 : `contacts.compte_id`,
 * `sites.compte_id` et `mandats.compte_id` sont tous en `on delete cascade`, et la cascade continue
 * sur six niveaux — les sites emportent les compteurs, les compteurs emportent les consommations,
 * les liens de recommandation, les offres et leurs prix par point de livraison. Une trentaine de
 * tables au total.
 *
 * Une phrase rassurante devant une action destructrice est pire que pas de phrase du tout : elle
 * fait cliquer.
 *
 * ══ TROIS RÉGIMES, ET ILS NE SE RESSEMBLENT PAS ══
 *
 *   DÉTRUIT   `cascade` — la ligne disparaît. C'est irréversible et il n'existe aucune trace :
 *             `historiques_entites` est vide et le déclencheur d'audit ne couvre que l'insertion
 *             et la modification.
 *   DÉTACHÉ   `set null` — la ligne survit mais perd son lien, donc n'apparaît plus sur aucune
 *             fiche. Elle n'est pas perdue, elle est introuvable, ce qui se voit encore moins.
 *   BLOQUE    `restrict` / `no action` — Postgres refuse la suppression. Une recommandation
 *             protège ainsi son compte, et c'est le seul garde-fou existant aujourd'hui.
 *
 * La popup doit distinguer les trois, sinon elle ment à son tour : annoncer « 4 interactions
 * supprimées » quand elles sont détachées est un mensonge dans l'autre sens.
 *
 * ══ POURQUOI DÉCLARÉ À LA MAIN PLUTÔT QUE LU DANS LE SCHÉMA ══
 *
 * Postgres connaît l'arbre exact, et une fonction en base le rendrait sans risque d'oubli. Mais
 * cela demande une migration, donc une intervention manuelle sur la production, alors que ce
 * correctif est urgent : cette liste-ci se déploie au push. Elle porte donc ce qu'un utilisateur a
 * besoin de voir — pas les 30 tables techniques, mais les objets qu'il reconnaît.
 *
 * SI ON AJOUTE UNE TABLE LIÉE, IL FAUT L'AJOUTER ICI. C'est le défaut de la méthode, assumé : voir
 * `verifier-cascades.sql` dans supabase/verifications, qui compare cette liste au schéma réel.
 */

/** Ce que devient une famille d'objets liés quand on supprime le parent. */
export type Regime = 'detruit' | 'detache' | 'bloque'

export interface LigneInventaire {
  /** Le nom que l'utilisateur reconnaît, au singulier. Le pluriel est déduit. */
  libelle: string
  nombre: number
  regime: Regime
  /** Précision affichée sous la ligne quand elle aide — ce que la destruction emporte à son tour. */
  detail?: string
}

export interface Inventaire {
  lignes: LigneInventaire[]
  detruits: number
  detaches: number
  /** Non vide ⇒ Postgres refusera. Autant le dire avant le clic que montrer une erreur après. */
  bloquants: LigneInventaire[]
}

/** Les objets que Kimatch sait supprimer depuis une fiche. */
export type TypeObjet = 'compte' | 'site' | 'compteur' | 'contact' | 'contrat' | 'mandat' | 'recommandation' | 'opportunite'

/** Un comptage, sans ramener les lignes : `head: true` ne transfère que le total. */
async function compter(table: string, colonne: string, valeur: string | string[]): Promise<number> {
  if (Array.isArray(valeur) && valeur.length === 0) return 0
  let r = supabase.from(table).select('id', { count: 'exact', head: true })
  r = Array.isArray(valeur) ? r.in(colonne, valeur) : r.eq(colonne, valeur)
  const { count, error } = await r
  // UN COMPTAGE QUI ÉCHOUE NE VAUT PAS ZÉRO. Rendre 0 ferait afficher « rien ne sera supprimé »
  // sur une table qu'on n'a pas pu lire — exactement le mensonge qu'on corrige.
  if (error) throw new Error(`Impossible de compter ${table} : ${error.message}`)
  return count ?? 0
}

/**
 * ══ LES DIX LIENS D'UNE INTERACTION ══
 *
 * `interactions_contexte_check` exige qu'au moins un soit rempli. Et les dix clés étrangères
 * correspondantes sont en `set null`. Les deux règles se contredisent quand une interaction n'a
 * qu'UN seul lien : le vider viole la contrainte, et la suppression échoue.
 */
const LIENS_INTERACTION = [
  'compte_id', 'contact_id', 'site_id', 'signal_id', 'mandat_id', 'recommandation_id',
  'version_recommandation_id', 'action_id', 'opportunite_id', 'suivi_contrat_id', 'piste_id',
] as const

/**
 * ══ LES INTERACTIONS QUI EMPÊCHENT LA SUPPRESSION ══
 *
 * Constaté à l'écran le 07/09/2026 sur le compte « S D G I DES E T PRALOGNAN LA VANOISE » :
 * la fenêtre annonçait « 19 interactions seront conservées mais perdront leur lien », et la
 * suppression échouait sur `new row for relation "interactions" violates check constraint
 * "interactions_contexte_check"`.
 *
 * LES DEUX RÈGLES DU SCHÉMA SE CONTREDISENT. `interactions.compte_id` est en `set null` : supprimer
 * le compte doit vider la colonne. Mais `interactions_contexte_check` exige qu'une interaction garde
 * au moins un rattachement. Une interaction dont le compte était le SEUL lien ne peut donc ni
 * survivre détachée, ni être supprimée : elle bloque.
 *
 * MESURÉ : 928 interactions sur 480 comptes sont dans ce cas. Ce n'est pas un cas limite, c'est un
 * compte sur six.
 *
 * ══ ELLES NE BLOQUENT PLUS : ELLES PARTENT (migration 20260907240000) ══
 *
 * Naoëlle a tranché le 07/09/2026 : « une interaction dont le seul lien est un compte qu'on supprime
 * volontairement n'a plus de raison d'exister. » Un déclencheur BEFORE DELETE les supprime donc avec
 * leur objet, avant que la contrainte ne puisse s'y opposer — et elles rejoignent la corbeille avec
 * lui, dans la même transaction, donc une restauration les ramène toutes ensemble.
 *
 * Elles sont donc comptées dans les DÉTRUITES, et nommées séparément des autres interactions : la
 * distinction compte pour le lecteur, puisque les unes disparaissent et les autres se détachent.
 */
async function interactionsBloquantes(colonne: string, valeur: string | string[]): Promise<number> {
  if (Array.isArray(valeur) && valeur.length === 0) return 0
  let r = supabase.from('interactions').select('id', { count: 'exact', head: true })
  r = Array.isArray(valeur) ? r.in(colonne, valeur) : r.eq(colonne, valeur)
  // Tous les autres liens à null : c'est ce qui fait de celui-ci le seul.
  for (const lien of LIENS_INTERACTION) {
    if (lien !== colonne) r = r.is(lien, null)
  }
  const { count, error } = await r
  if (error) throw new Error(`Impossible de compter les interactions bloquantes : ${error.message}`)
  return count ?? 0
}

/**
 * Les identifiants des sites d'un compte.
 *
 * IL N'EN RESTE QU'UN USAGE : compter les signaux, seuls à ne pendre qu'au site (`signaux.site_id`
 * est `not null` et n'a pas d'équivalent sur le compte). Tout le reste — compteurs, contrats — se
 * compte désormais directement par `compte_id`, depuis que l'objet site a disparu de l'application.
 */
async function sitesDuCompte(compteId: string): Promise<string[]> {
  const { data, error } = await supabase.from('sites').select('id').eq('compte_id', compteId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((s) => s.id as string)
}

/** Les compteurs d'un compte, par le lien direct — celui que suit la cascade. */
async function compteursDuCompte(compteId: string): Promise<string[]> {
  const { data, error } = await supabase.from('compteurs').select('id').eq('compte_id', compteId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((c) => c.id as string)
}

async function compteursDesSites(siteIds: string[]): Promise<string[]> {
  if (siteIds.length === 0) return []
  const { data, error } = await supabase.from('compteurs').select('id').in('site_id', siteIds)
  if (error) throw new Error(error.message)
  return (data ?? []).map((c) => c.id as string)
}

/* ════════════════════════════════════ L'INVENTAIRE PAR OBJET ════════════════════════════════════ */

async function inventaireCompte(id: string): Promise<LigneInventaire[]> {
  /* ══ ON COMPTE PAR LE COMPTE, PLUS PAR LE SITE ══
     Naoëlle, 10/09/2026 : la fenêtre annonçait « 6 contrats » puis la base refusait. Elle les
     comptait par `site_id` — le chemin de l'objet site, disparu de l'application le matin même —
     alors que la cascade passe par `compte_id`. Deux chemins, deux nombres, et celui qu'on
     affichait n'était pas celui qui s'appliquait. */
  const siteIds = await sitesDuCompte(id)
  const compteurIds = await compteursDuCompte(id)

  const [contacts, mandats, contratsSites, signaux, consommations, interactions,
    interactionsSeules, opportunites, pistes, requetes, recommandations, acces] = await Promise.all([
    compter('contacts', 'compte_id', id),
    compter('mandats', 'compte_id', id),
    compter('contrats', 'compte_id', id),
    compter('signaux', 'site_id', siteIds),
    compter('consommations', 'compteur_id', compteurIds),
    compter('interactions', 'compte_id', id),
    interactionsBloquantes('compte_id', id),
    compter('opportunites', 'compte_id', id),
    compter('pistes', 'compte_id', id),
    compter('requetes', 'compte_id', id),
    // RESTRICT : celui-là ne se supprime pas, il refuse.
    compter('recommandations', 'compte_id', id),
    compter('perimetres_acces', 'compte_id', id),
  ])

  /* ══ CE COMPTE EST-IL CITÉ COMME FOURNISSEUR CHEZ LES AUTRES ? ══

     Audit du 10/09/2026 (`npm run suppressions`) : la suppression d'un compte échouait encore sur
     `contrats_fournisseur_compte_id_fkey`, avec le même message opaque que celui qui avait bloqué
     Guillaume le matin. Sauf qu'ici le refus est JUSTE — un compte fournisseur est cité sur les
     contrats de dizaines de clients, et l'effacer les mutilerait tous.

     Ce qui était faux, ce n'était pas la règle, c'était le silence. On compte donc ces renvois et
     on les annonce AVANT le clic, avec le geste qui débloque. */
  const [contratsFournis, compteursFournis, recosFournies, optimisations] = await Promise.all([
    compter('contrats', 'fournisseur_compte_id', id),
    compter('compteurs', 'fournisseur_actuel_compte_id', id),
    compter('recommandations', 'fournisseur_compte_id', id),
    compter('optimisations_fournisseurs', 'fournisseur_compte_id', id),
  ])
  const commeFournisseur = contratsFournis + compteursFournis + recosFournies + optimisations

  return [
    { libelle: 'recommandation', nombre: recommandations, regime: 'bloque',
      detail: 'Une recommandation interdit la suppression du compte. Il faut la supprimer d’abord, ou renoncer.' },
    { libelle: 'objet d’un autre client qui cite ce compte comme fournisseur', nombre: commeFournisseur,
      regime: 'bloque',
      detail: commeFournisseur > 0
        ? `Ce compte est un fournisseur : ${contratsFournis} contrat(s), ${compteursFournis} compteur(s), `
          + `${recosFournies} recommandation(s) et ${optimisations} optimisation(s) le désignent, chez d’autres `
          + 'clients. Les supprimer les mutilerait — Kimatch refuse.'
        : undefined },
    /* ELLES PARTENT AVEC LE COMPTE : c'est leur seul rattachement, et une interaction sans aucun
       lien est refusée par la base. Le déclencheur de 20260907240000 les supprime avant que la
       contrainte ne puisse s'y opposer. */
    { libelle: 'interaction rattachée à ce seul compte', nombre: interactionsSeules, regime: 'detruit',
      detail: 'Elles n’ont aucun autre rattachement : elles partent avec le compte, et se retrouvent dans la corbeille.' },
    { libelle: 'contact', nombre: contacts, regime: 'detruit' },
    /* PLUS DE LIGNE « SITE ». L'objet n'existe plus pour personne : l'annoncer dans une fenêtre de
       suppression obligerait à expliquer ce qu'il est avant d'expliquer qu'il part. Les lignes du
       site — ses compteurs, ses contrats, ses signaux — sont comptées chacune pour elle-même. */
    { libelle: 'compteur', nombre: compteurIds.length, regime: 'detruit',
      detail: compteurIds.length > 0 ? 'avec leurs relevés et leurs contrats' : undefined },
    { libelle: 'contrat', nombre: contratsSites, regime: 'detruit' },
    { libelle: 'mandat', nombre: mandats, regime: 'detruit' },
    { libelle: 'signal', nombre: signaux, regime: 'detruit' },
    { libelle: 'relevé de consommation', nombre: consommations, regime: 'detruit' },
    { libelle: 'partage d’accès', nombre: acces, regime: 'detruit' },
    // Celles qui ont un AUTRE rattachement se détachent vraiment : on retire les bloquantes du
    // compte, sinon la même ligne apparaîtrait dans les deux listes.
    { libelle: 'interaction', nombre: Math.max(0, interactions - interactionsSeules), regime: 'detache' },
    { libelle: 'opportunité', nombre: opportunites, regime: 'detache' },
    { libelle: 'piste', nombre: pistes, regime: 'detache' },
    { libelle: 'requête', nombre: requetes, regime: 'detache' },
  ]
}

async function inventaireSite(id: string): Promise<LigneInventaire[]> {
  const compteurIds = await compteursDesSites([id])
  const [contrats, signaux, consommations, interactions, interactionsSeules, requetes, contactsLies] =
    await Promise.all([
      compter('contrats', 'site_id', id),
      compter('signaux', 'site_id', id),
      compter('consommations', 'compteur_id', compteurIds),
      compter('interactions', 'site_id', id),
      interactionsBloquantes('site_id', id),
      compter('requetes', 'site_id', id),
      compter('contacts_sites', 'site_id', id),
    ])
  return [
    { libelle: 'compteur', nombre: compteurIds.length, regime: 'detruit',
      detail: compteurIds.length > 0 ? 'avec leurs relevés et leurs liens d’offre' : undefined },
    { libelle: 'contrat', nombre: contrats, regime: 'detruit' },
    { libelle: 'signal', nombre: signaux, regime: 'detruit' },
    { libelle: 'relevé de consommation', nombre: consommations, regime: 'detruit' },
    { libelle: 'contact rattaché à ce site', nombre: contactsLies, regime: 'detruit',
      detail: contactsLies > 0 ? 'seul le rattachement disparaît, pas le contact' : undefined },
    { libelle: 'interaction rattachée à ce seul site', nombre: interactionsSeules, regime: 'detruit',
      detail: 'Elles n’ont aucun autre rattachement : elles partent avec lui, et se retrouvent dans la corbeille.' },
    { libelle: 'interaction', nombre: Math.max(0, interactions - interactionsSeules), regime: 'detache' },
    { libelle: 'requête', nombre: requetes, regime: 'detache' },
  ]
}

async function inventaireCompteur(id: string): Promise<LigneInventaire[]> {
  const [consommations, contrats, recos, versions, opportunites, signaux, requetes, mandats] = await Promise.all([
    compter('consommations', 'compteur_id', id),
    compter('contrats_compteurs', 'compteur_id', id),
    compter('recommandations_compteurs', 'compteur_id', id),
    compter('versions_recommandation_compteurs', 'compteur_id', id),
    compter('opportunites_compteurs', 'compteur_id', id),
    compter('signaux', 'compteur_id', id),
    compter('requetes', 'compteur_id', id),
    compter('mandats_compteurs', 'compteur_id', id),
  ])
  return [
    /* ══ LE MANDAT BLOQUE, ET LA FENÊTRE NE LE DISAIT PAS ══
       `mandats_compteurs.compteur_id` est la SEULE clé étrangère vers `compteurs` en
       `on delete restrict` : les dix autres sont en cascade ou en set null. Postgres refuse donc
       la suppression, et l'inventaire ne comptait pas cette table — la fenêtre annonçait
       tranquillement ce qui allait disparaître, puis l'utilisateur recevait une erreur brute.
       Mesuré le 07/09/2026 : 2 214 compteurs sur 7 919 sont sous mandat, soit plus d'un sur
       quatre. Même famille de défaut que les 928 interactions bloquantes du matin, trouvée en
       relisant les cascades pour le déplacement de compteur. */
    { libelle: 'rattachement à un mandat', nombre: mandats, regime: 'bloque',
      detail: mandats > 0
        ? 'Un mandat est signé : Kimatch refuse de supprimer un compteur qu’il couvre. Retirez-le du mandat, ou déplacez le compteur.'
        : undefined },
    { libelle: 'relevé de consommation', nombre: consommations, regime: 'detruit' },
    { libelle: 'rattachement à un contrat', nombre: contrats, regime: 'detruit',
      detail: contrats > 0 ? 'avec les tarifs saisis dessus' : undefined },
    { libelle: 'présence dans une recommandation', nombre: recos, regime: 'detruit' },
    { libelle: 'présence dans une version de cotation', nombre: versions, regime: 'detruit',
      detail: versions > 0 ? 'avec les prix et marges saisis par offre' : undefined },
    { libelle: 'présence dans une opportunité', nombre: opportunites, regime: 'detruit' },
    { libelle: 'signal', nombre: signaux, regime: 'detruit' },
    { libelle: 'requête', nombre: requetes, regime: 'detache' },
  ]
}

async function inventaireContact(id: string): Promise<LigneInventaire[]> {
  const [comptesLies, sitesLies, interactions, interactionsSeules, actions, opportunites, requetes, signaux, pistes] =
    await Promise.all([
      compter('contacts_comptes', 'contact_id', id),
      compter('contacts_sites', 'contact_id', id),
      compter('interactions', 'contact_id', id),
      interactionsBloquantes('contact_id', id),
      compter('actions', 'contact_id', id),
      compter('opportunites', 'contact_id', id),
      compter('requetes', 'contact_id', id),
      compter('signaux', 'contact_id', id),
      compter('pistes', 'contact_id', id),
    ])

  /* ══ LES RÔLES QU'IL TENAIT ══

     Jusqu'au 10/09/2026 ces six liens étaient en `no action` : ils BLOQUAIENT la suppression, sans
     que la fenêtre en dise un mot. Ils se vident désormais (migration 20260910300000) — l'objet
     survit, il ne nomme plus personne. Mais se vider n'est pas rien : sur le contact le plus chargé
     de la base, ce sont 366 compteurs et contrats qui perdent leur référent. On l'annonce. */
  const [responsable, conseil, signataireContrat, pricing, signataireReco, versionContact] =
    await Promise.all([
      compter('compteurs', 'responsable_contact_id', id),
      compter('compteurs', 'contact_conseil_syndical_id', id),
      compter('contrats', 'contact_signataire_id', id),
      compter('contrats', 'interlocuteur_pricing_contact_id', id),
      compter('recommandations', 'contact_signataire_id', id),
      compter('versions_recommandation', 'contact_id', id),
    ])

  return [
    { libelle: 'compteur dont il est le responsable', nombre: responsable, regime: 'detache',
      detail: responsable > 0 ? 'le compteur reste, il n’aura plus de responsable' : undefined },
    { libelle: 'compteur dont il est le conseil syndical', nombre: conseil, regime: 'detache' },
    { libelle: 'contrat dont il est le signataire', nombre: signataireContrat, regime: 'detache',
      detail: signataireContrat > 0 ? 'le contrat reste, la case signataire se vide' : undefined },
    { libelle: 'contrat dont il est l’interlocuteur pricing', nombre: pricing, regime: 'detache' },
    { libelle: 'recommandation dont il est le signataire', nombre: signataireReco, regime: 'detache' },
    { libelle: 'version de cotation à son nom', nombre: versionContact, regime: 'detache' },
    { libelle: 'rattachement à un compte', nombre: comptesLies, regime: 'detruit',
      detail: comptesLies > 0 ? 'le compte lui-même n’est pas touché' : undefined },
    { libelle: 'rattachement à un site', nombre: sitesLies, regime: 'detruit' },
    { libelle: 'interaction rattachée à ce seul contact', nombre: interactionsSeules, regime: 'detruit',
      detail: 'Elles n’ont aucun autre rattachement : elles partent avec lui, et se retrouvent dans la corbeille.' },
    { libelle: 'interaction', nombre: Math.max(0, interactions - interactionsSeules), regime: 'detache' },
    { libelle: 'tâche', nombre: actions, regime: 'detache' },
    { libelle: 'opportunité', nombre: opportunites, regime: 'detache' },
    { libelle: 'requête', nombre: requetes, regime: 'detache' },
    { libelle: 'signal', nombre: signaux, regime: 'detache' },
    { libelle: 'piste', nombre: pistes, regime: 'detache' },
  ]
}

async function inventaireContrat(id: string): Promise<LigneInventaire[]> {
  const [compteurs, suivis, remunerations, requetes, signaux] = await Promise.all([
    compter('contrats_compteurs', 'contrat_id', id),
    compter('suivis_contrats', 'contrat_id', id),
    compter('remunerations', 'contrat_id', id),
    compter('requetes', 'contrat_id', id),
    compter('signaux', 'contrat_id', id),
  ])
  return [
    { libelle: 'point de livraison rattaché', nombre: compteurs, regime: 'detruit',
      detail: compteurs > 0 ? 'avec les tarifs saisis dessus ; les compteurs eux-mêmes restent' : undefined },
    { libelle: 'suivi', nombre: suivis, regime: 'detache' },
    { libelle: 'rémunération', nombre: remunerations, regime: 'detache' },
    { libelle: 'requête', nombre: requetes, regime: 'detache' },
    { libelle: 'signal', nombre: signaux, regime: 'detache' },
  ]
}

async function inventaireMandat(id: string): Promise<LigneInventaire[]> {
  const [compteurs, courtiers, recos, actions, interactions, interactionsSeules] = await Promise.all([
    compter('mandats_compteurs', 'mandat_id', id),
    compter('mandats_courtiers', 'mandat_id', id),
    compter('recommandations_mandats', 'mandat_id', id),
    compter('actions', 'mandat_id', id),
    compter('interactions', 'mandat_id', id),
    interactionsBloquantes('mandat_id', id),
  ])
  return [
    { libelle: 'point de livraison mandaté', nombre: compteurs, regime: 'detruit',
      detail: compteurs > 0 ? 'le compteur lui-même reste' : undefined },
    { libelle: 'courtier rattaché', nombre: courtiers, regime: 'detruit' },
    { libelle: 'lien à une recommandation', nombre: recos, regime: 'detruit' },
    { libelle: 'tâche', nombre: actions, regime: 'detruit' },
    { libelle: 'interaction rattachée à ce seul mandat', nombre: interactionsSeules, regime: 'detruit',
      detail: 'Elles n’ont aucun autre rattachement : elles partent avec lui, et se retrouvent dans la corbeille.' },
    { libelle: 'interaction', nombre: Math.max(0, interactions - interactionsSeules), regime: 'detache' },
  ]
}

async function inventaireRecommandation(id: string): Promise<LigneInventaire[]> {
  const [compteurs, mandats, objectifs, sites, contrats, suivis, remunerations, interactions, interactionsSeules, partages] =
    await Promise.all([
      compter('recommandations_compteurs', 'recommandation_id', id),
      compter('recommandations_mandats', 'recommandation_id', id),
      compter('recommandations_objectifs', 'recommandation_id', id),
      compter('recommandations_sites', 'recommandation_id', id),
      compter('contrats', 'recommandation_id', id),
      compter('suivis_contrats', 'recommandation_id', id),
      compter('remunerations', 'recommandation_id', id),
      compter('interactions', 'recommandation_id', id),
      interactionsBloquantes('recommandation_id', id),
      compter('partages_etude_client', 'recommandation_id', id),
    ])
  return [
    { libelle: 'point de livraison au périmètre', nombre: compteurs, regime: 'detruit' },
    { libelle: 'lien à un mandat', nombre: mandats, regime: 'detruit' },
    { libelle: 'objectif', nombre: objectifs, regime: 'detruit' },
    { libelle: 'site au périmètre', nombre: sites, regime: 'detruit' },
    { libelle: 'partage de l’étude client', nombre: partages, regime: 'detruit' },
    { libelle: 'contrat issu de cette recommandation', nombre: contrats, regime: 'detache' },
    { libelle: 'suivi de contrat', nombre: suivis, regime: 'detache' },
    { libelle: 'rémunération', nombre: remunerations, regime: 'detache' },
    { libelle: 'interaction rattachée à cette seule recommandation', nombre: interactionsSeules, regime: 'detruit',
      detail: 'Elles n’ont aucun autre rattachement : elles partent avec lui, et se retrouvent dans la corbeille.' },
    { libelle: 'interaction', nombre: Math.max(0, interactions - interactionsSeules), regime: 'detache' },
  ]
}

/**
 * Ce qu'emporte la suppression d'une opportunité.
 *
 * RELEVÉ DANS LE SCHÉMA LE 10/09/2026, pas deviné : deux liens en `cascade`
 * (`opportunites_compteurs`, `opportunites_sites`) et quatre en `set null` (`actions`,
 * `interactions`, `pistes`, `recommandations`). Aucune contrainte bloquante — une opportunité se
 * supprime toujours, même convertie.
 *
 * LA RECOMMANDATION DÉTACHÉE EST LE CAS QUI COMPTE. Elle survit, mais elle perd le lien qui la
 * rattachait à l'opportunité d'origine : l'opportunité disparaît de la fiche, et surtout
 * `recommandation_ids` étant ce qui fait avancer le palier d'une opportunité, plus rien ne dira
 * d'où venait l'affaire. C'est le genre de perte qui ne se voit pas le jour même.
 *
 * LA PISTE AUSSI, et elle revient alors à l'état « non convertie » du point de vue de l'écran de
 * prospection : elle réapparaîtra dans les listes de pistes à traiter.
 */
async function inventaireOpportunite(id: string): Promise<LigneInventaire[]> {
  const [compteurs, sites, actions, recos, pistes, interactions, interactionsSeules] = await Promise.all([
    compter('opportunites_compteurs', 'opportunite_id', id),
    compter('opportunites_sites', 'opportunite_id', id),
    compter('actions', 'opportunite_id', id),
    compter('recommandations', 'opportunite_id', id),
    compter('pistes', 'opportunite_id', id),
    compter('interactions', 'opportunite_id', id),
    interactionsBloquantes('opportunite_id', id),
  ])
  return [
    { libelle: 'point de livraison au périmètre', nombre: compteurs, regime: 'detruit',
      detail: compteurs > 0 ? 'le compteur lui-même reste' : undefined },
    { libelle: 'immeuble au périmètre', nombre: sites, regime: 'detruit' },
    { libelle: 'recommandation issue de cette opportunité', nombre: recos, regime: 'detache',
      detail: recos > 0 ? 'elle survit, mais on ne saura plus d’où elle vient' : undefined },
    { libelle: 'piste convertie en cette opportunité', nombre: pistes, regime: 'detache',
      detail: pistes > 0 ? 'elle repassera pour non convertie dans la prospection' : undefined },
    { libelle: 'tâche', nombre: actions, regime: 'detache' },
    { libelle: 'interaction rattachée à cette seule opportunité', nombre: interactionsSeules, regime: 'detruit',
      detail: 'Elles n’ont aucun autre rattachement : elles partent avec elle, et se retrouvent dans la corbeille.' },
    { libelle: 'interaction', nombre: Math.max(0, interactions - interactionsSeules), regime: 'detache' },
  ]
}

const INVENTAIRES: Record<TypeObjet, (id: string) => Promise<LigneInventaire[]>> = {
  compte: inventaireCompte,
  site: inventaireSite,
  compteur: inventaireCompteur,
  contact: inventaireContact,
  contrat: inventaireContrat,
  mandat: inventaireMandat,
  recommandation: inventaireRecommandation,
  opportunite: inventaireOpportunite,
}

/**
 * L'inventaire de ce que la suppression de cet objet va emporter.
 *
 * `enabled` sur l'ouverture de la popup et non sur le montage : compter coûte une dizaine de
 * requêtes, inutile de les lancer sur chaque fiche ouverte au cas où quelqu'un cliquerait.
 */
export function useInventaireSuppression(type: TypeObjet, id: string | undefined, actif: boolean) {
  return useQuery({
    queryKey: ['inventaire-suppression', type, id],
    enabled: actif && Boolean(id),
    // Il doit refléter l'état au moment du clic, pas celui d'il y a cinq minutes.
    staleTime: 0,
    gcTime: 0,
    queryFn: async (): Promise<Inventaire> => {
      const lignes = (await INVENTAIRES[type](id!)).filter((l) => l.nombre > 0)
      return {
        lignes,
        detruits: lignes.filter((l) => l.regime === 'detruit').reduce((t, l) => t + l.nombre, 0),
        detaches: lignes.filter((l) => l.regime === 'detache').reduce((t, l) => t + l.nombre, 0),
        bloquants: lignes.filter((l) => l.regime === 'bloque'),
      }
    },
  })
}

/** « 3 contacts », « 1 site » — le pluriel sans y penser à chaque appel. */
export function pluriel(n: number, libelle: string): string {
  if (n <= 1) return `${n} ${libelle}`
  // Les libellés composés se pluralisent sur leur premier mot : « 2 relevés de consommation ».
  const [tete, ...reste] = libelle.split(' ')
  const teteAuPluriel = /(x|s)$/.test(tete) ? tete : `${tete}s`
  return `${n} ${[teteAuPluriel, ...reste].join(' ')}`
}
