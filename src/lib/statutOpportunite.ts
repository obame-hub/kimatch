import type { Opportunite } from '@/types/domain'

/**
 * ══ LA RÈGLE DU PALIER D'UNE OPPORTUNITÉ, SANS RIEN AUTOUR ══
 *
 * Elle vivait dans `data/opportunites.ts`, au milieu des requêtes — donc impossible à charger sans
 * ouvrir aussi un client Supabase. Isolée ici, elle se teste seule, et surtout elle se CONFRONTE à sa
 * jumelle en base, `fn_statut_opportunite_calcule` : depuis le 28/09/2026 c'est la base qui écrit le
 * statut, et les deux doivent donner le même palier sur chaque opportunité.
 *
 * SI TU CHANGES L'UNE, CHANGE L'AUTRE, puis relance `scripts/.essai-statut-opportunite.mts` : il
 * compare les deux sur toute la production et nomme chaque désaccord.
 */

/** Un mandat, réduit à ce qu'il faut pour dire s'il couvre un périmètre. */
export interface MandatPourCouverture {
  statut: string
  compte_id: string | null
  compteur_ids: string[]
}

/**
 * Les six prérequis, dans l'ordre où Michel les énumère : « un signal positif, un contact, un compte
 * et des compteurs avec des mandats, un accord ».
 *
 * LE MANDAT SE VÉRIFIE CONTRE LE PÉRIMÈTRE, pas dans l'absolu. C'est l'apport de la maquette : un
 * mandat actif qui ne couvre pas l'immeuble visé ne sert à rien, et c'est le cas courant chez un
 * syndic qui apporte un nouvel immeuble.
 */
// Generique : la fonction n'a besoin que de trois champs, mais elle RENVOIE le mandat retenu, et
// l'appelant veut le sien en entier (sa reference, sa date de fin). Le type se propage donc.
export function prerequisOpportunite<T extends MandatPourCouverture>(o: Opportunite, mandats: T[]) {
  const actifs = mandats.filter((m) => m.statut === 'ACTIF' && m.compte_id === o.compte_id)
  const couvertsParMandat = new Set(actifs.flatMap((m) => m.compteur_ids))
  const manquantsDuMandat = o.compteur_ids.filter((c) => !couvertsParMandat.has(c))
  // Un périmètre vide n'est pas « couvert » : il n'y a rien à couvrir, et la conversion attend
  // d'abord qu'on lui donne un périmètre.
  const mandatCouvre = o.compteur_ids.length > 0 && manquantsDuMandat.length === 0 && actifs.length > 0

  const liste = [
    { cle: 'signal', libelle: 'Un signal positif identifié', ok: Boolean(o.signal_id || o.signal_libelle) },
    { cle: 'contact', libelle: 'Un contact identifié', ok: Boolean(o.contact_id) },
    { cle: 'compte', libelle: 'Un compte identifié', ok: Boolean(o.compte_id) },
    { cle: 'perimetre', libelle: 'Au moins un site ou point de livraison', ok: o.site_ids.length + o.compteur_ids.length > 0 },
    { cle: 'mandat', libelle: 'Un mandat actif couvrant le périmètre', ok: mandatCouvre },
    { cle: 'accord', libelle: 'L’accord du client pour lancer une recommandation', ok: o.accord_client },
  ]

  return {
    liste,
    manquants: liste.filter((p) => !p.ok),
    mandatCouvre,
    mandat: actifs[0] ?? null,
    couverts: o.compteur_ids.filter((c) => couvertsParMandat.has(c)),
    manquantsDuMandat,
  }
}

/**
 * Le palier du pipeline, déduit des objets réunis — plus ce qu'il reste à faire, en une phrase.
 */
export function statutDerive(o: Opportunite, mandats: MandatPourCouverture[]) {
  const { liste } = prerequisOpportunite(o, mandats)
  const ok = (cle: string) => liste.find((p) => p.cle === cle)?.ok ?? false

  /* ══ CONVERTIE QUAND TOUT LE PÉRIMÈTRE EST PLACÉ, ET PAS AVANT ══

     Cette règle disait : « une opportunité qui a produit AU MOINS UNE recommandation a abouti,
     quoi qu'il manque par ailleurs ». Sur un périmètre de quatre compteurs dont deux seulement
     étaient partis en recommandation, Kimatch affichait « Convertie » — et plus rien ne rappelait
     qu'il en restait deux.

     Michel, 11/09/2026 : « à la fin il faut que tous les compteurs soient dans une ou des
     recommandations, ou sinon que j'aie fait exprès d'écarter un compteur ». La conversion est
     donc un ÉTAT DU PÉRIMÈTRE, pas un compteur de recommandations : chaque compteur finit placé
     ou écarté, et tant qu'il en reste un, le travail n'est pas fini.

     Le reste se dit en clair — « 2 compteurs sur 4 encore à placer » — parce qu'une opportunité
     bloquée à mi-conversion sans explication est exactement ce qu'on vient de corriger. */
  const perimetre = o.compteur_ids
  const traites = new Set([...(o.compteurs_places ?? []), ...(o.compteurs_ecartes ?? [])])
  const restants = perimetre.filter((c) => !traites.has(c))

  if (o.recommandation_ids.length > 0 && restants.length === 0) {
    return { code: 'CONVERTIE', libelle: 'Convertie', tache: 'Recommandations créées.' }
  }
  if (o.recommandation_ids.length > 0) {
    /* CONVERSION COMMENCÉE, PAS FINIE. Elle reste au palier « Prête à convertir » : le travail qui
       reste est bien une conversion à terminer, et non une qualification à reprendre. */
    return {
      code: 'PRETE_A_CONVERTIR',
      libelle: 'Prête à convertir',
      tache: `Conversion en cours — ${restants.length} compteur${restants.length > 1 ? 's' : ''} sur ${perimetre.length} encore à placer.`,
    }
  }
  // « Abandonnée — fermée avec un motif ». Une qualification finale autre que CONVERTIE ferme le
  // dossier : perdue, non qualifiée, reportée ou annulée.
  if (o.qualification_fin && o.qualification_fin !== 'CONVERTIE') {
    return {
      code: 'ABANDONNEE',
      libelle: 'Abandonnée',
      tache: o.motif_cloture ? o.motif_cloture : 'Fermée sans motif renseigné.',
    }
  }
  /* ══ UNE OPPORTUNITÉ NÉE D'UNE PISTE NE PASSE PAS PAR « NOUVELLE » ══

     William, 28/09/2026 : « une opportunité passe directement en Couverture mandat à partir du
     moment où elle est créée avec des compteurs liés. Autrement elle reste En qualification. »

     LA CONVERSION EST LE SIGNAL POSITIF : on vient de raccrocher avec cette personne. Exiger en plus
     un signal saisi à la main la laissait « Nouvelle » — ce qui ne décrivait rien de vrai. Le
     périmètre décide donc seul : des compteurs, et il reste le mandat à obtenir ; aucun, et il
     reste à les rattacher. Le mandat, lui, se vérifie comme pour toutes les autres : s'il couvre
     déjà le périmètre, l'opportunité est prête à convertir.

     MÊME RÈGLE EN BASE, dans `fn_statut_opportunite_calcule` — voir l'en-tête de ce fichier. */
  if (o.origine === 'PISTE') {
    if (o.compteur_ids.length === 0) {
      return { code: 'EN_QUALIFICATION', libelle: 'En qualification', tache: 'Rattacher les compteurs du périmètre.' }
    }
    if (!ok('mandat')) {
      return { code: 'COUVERTURE_MANDAT', libelle: 'Couverture mandat', tache: 'Obtenir un mandat couvrant le périmètre.' }
    }
    return {
      code: 'PRETE_A_CONVERTIR',
      libelle: 'Prête à convertir',
      tache: !ok('accord') ? 'Obtenir l’accord du client.' : 'Lancer la recommandation.',
    }
  }
  // « Nouvelle — issue d'un signal validé » : elle vient d'arriver, rien n'a encore été rassemblé.
  // Ce qui la distingue d'« En qualification », c'est qu'aucun périmètre n'a été touché — c'est le
  // premier geste du commercial, et le seul qui se lise dans les données.
  if (!ok('signal') || !ok('contact')) {
    return {
      code: 'NOUVELLE',
      libelle: 'Nouvelle',
      tache: !ok('signal') && !ok('contact')
        ? 'Identifier le signal et le contact.'
        : !ok('signal') ? 'Identifier le signal positif.' : 'Identifier le contact.',
    }
  }
  if (!ok('compte') || !ok('perimetre')) {
    return {
      code: !ok('perimetre') && !ok('compte') ? 'NOUVELLE' : 'EN_QUALIFICATION',
      libelle: !ok('perimetre') && !ok('compte') ? 'Nouvelle' : 'En qualification',
      tache: !ok('compte') ? 'Confirmer le compte, c’est-à-dire l’organisation.' : 'Rattacher un site ou un point de livraison.',
    }
  }
  // « Couverture mandat — vérifier chaque site du périmètre ». Michel : « le mandat n'est obligatoire
  // que si le compteur n'est pas couvert par un mandat ».
  if (!ok('mandat')) {
    return {
      code: 'COUVERTURE_MANDAT',
      libelle: 'Couverture mandat',
      tache: 'Obtenir un mandat couvrant le périmètre.',
    }
  }
  // « Prête à convertir — données et conditions réunies ». Reste l'accord du client, puis la
  // recommandation à lancer : deux tâches, un seul palier.
  return {
    code: 'PRETE_A_CONVERTIR',
    libelle: 'Prête à convertir',
    tache: !ok('accord') ? 'Obtenir l’accord du client.' : 'Lancer la recommandation.',
  }
}
