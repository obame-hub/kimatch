import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * ══ LES OFFRES DU JOUR ══
 *
 * William, 10/09/2026 : une section sous les cinq cartes, avec un tableau en trois sous-parties et
 * deux totaux à droite.
 *
 * ── LES TROIS SECTIONS ──
 *
 *   EN_RETARD    version actuelle « Disponible »,      date souhaitée < aujourd'hui
 *   A_ENVOYER    version actuelle « Disponible »,      date souhaitée = aujourd'hui
 *   EN_ATTENTE   version actuelle « En construction », date souhaitée = aujourd'hui
 *
 * `date_souhaitee` est la date à laquelle le commercial attend l'offre du service pricing —
 * William me l'a corrigé, je l'avais prise pour la date de début de fourniture. C'est un délai
 * INTERNE, d'où le sens des trois sections : ce qui a dépassé la date promise, ce qui est promis
 * pour aujourd'hui, et ce que le pricing doit encore rendre.
 *
 * ── DEUX APPELS, PARCE QUE DEUX PÉRIMÈTRES ──
 *
 * Le tableau ne montre que le jour. Les deux cartes mesurent tout autre chose : le pipe ouvert
 * court sur TOUTES mes recommandations ouvertes, le montant signé sur celles acceptées
 * aujourd'hui. Les déduire des lignes du tableau donnerait des totaux qui ne parlent que du
 * tableau, et qui bougeraient au moindre tri.
 *
 * ── LE FILTRE PAR UTILISATEUR EST EN BASE, PAS ICI ──
 *
 * Les deux fonctions lisent `auth.uid()`. Un filtre passé depuis le navigateur se change dans la
 * console ; celui-ci ne se contourne pas.
 */

export type SectionOffre = 'EN_RETARD' | 'A_ENVOYER' | 'EN_ATTENTE'

export interface LigneOffre {
  section: SectionOffre
  recommandation_id: string
  nom: string
  type_energie: string | null
  numero_version: number | null
  montant_estime: number | null
  date_souhaitee: string | null
  contact_id: string | null
  contact_nom: string | null
  compte_id: string | null
  compte_nom: string | null
}

/**
 * ══ LES DEUX MONTANTS DE LA TUILE D'ARGENT ══
 *
 * William, 11/09/2026 : « le pipe ouvert […] uniquement les recommandations avec en propriétaire
 * l'utilisateur qui affiche le dashboard, et uniquement au statut "En décision". Ça s'appellerait
 * désormais Pipe en décision. »
 *
 * LES DEUX SE MESURENT EN `montant` DEPUIS LE 24/09/2026 — le « Montant de l'affaire » de
 * l'encadré vert de la fiche. William, à qui je demandais d'arbitrer entre les deux colonnes :
 * « quel est le champ dans recommandation qui apparaît dans un encadré vert ? c'est celui-là
 * que je veux partout. » Ils lisaient jusque-là `marge_nette_coeff`, qui dit autre chose : sur
 * les 282 acceptées de 2026, la marge fait 763 576,15 € et le montant 442 845,33 €. Voir la
 * migration 20260924120000.
 * L'ancien pipe lisait `versions_recommandation.gain_estime_annuel` — une colonne NULLE sur les
 * 1 565 versions actuelles de la base. Il affichait donc 0,00 € à tout le monde, et un zéro se lit
 * comme « je n'ai rien en cours », jamais comme « la colonne est vide ».
 *
 * LE PÉRIMÈTRE EST CELUI DE LA PAGE RECOMMANDATIONS, à la lettre : `colonne_travail` vaut
 * `EN_DECISION`. Ce n'est pas la même chose que « la version actuelle est en décision » — un
 * dossier dont le contrat est parti à la signature bascule en « En cours de contractualisation »,
 * et il n'a plus sa place dans une espérance puisque le client a dit oui. Quatre dossiers séparent
 * les deux définitions. Voir la migration `20260911130000`.
 */
export interface TotauxOffres {
  /** La somme des marges nettes de mes études actuellement chez le client. */
  pipeEnDecision: number
  /** Combien d'études composent cette somme — voir la migration : deux chiffres voisins doivent
   *  parler du même ensemble. */
  nbEnDecision: number
  montantSigne: number
}

/** Le fond de teint des deux crochets : une fonction absente ne doit pas blanchir la page. */
function absente(message: string): boolean {
  return /does not exist|schema cache|404/i.test(message)
}

export function useOffresDuJour() {
  const queryClient = useQueryClient()

  const requete = useQuery({
    queryKey: ['offres-du-jour'],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async (): Promise<LigneOffre[]> => {
      const { data, error } = await supabase.rpc('lister_offres_du_jour')
      if (error) {
        if (absente(error.message)) return []
        throw new Error(error.message)
      }
      return (data ?? []) as LigneOffre[]
    },
  })

  /**
   * ══ LE TEMPS RÉEL ══
   *
   * Une version qui passe de « En construction » à « Disponible » change de section sous les yeux,
   * et une étude envoyée quitte le tableau. Sans cela, un commercial qui laisse sa page ouverte la
   * matinée verrait une liste périmée — exactement ce que la rangée de cartes évite déjà.
   *
   * ON RECOMPTE PLUTÔT QUE DE LIRE L'ÉVÉNEMENT : sa charge utile ne porte que les colonnes brutes
   * de la version, ni le statut lisible, ni le compte, ni le contact.
   */
  useEffect(() => {
    const rafraichir = () => {
      void queryClient.invalidateQueries({ queryKey: ['offres-du-jour'] })
      // Sans période : React Query invalide alors les quatre variantes d'un coup.
      void queryClient.invalidateQueries({ queryKey: ['totaux-offres'] })
    }
    const canal = supabase
      .channel('offres-du-jour')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'versions_recommandation' }, rafraichir)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recommandations' }, rafraichir)
      .subscribe()

    return () => { void supabase.removeChannel(canal) }
  }, [queryClient])

  return requete
}

/**
 * ══ LES DEUX FILTRES DU MONTANT SIGNÉ ══
 *
 * William, 15/09/2026 pour la période, 24/09/2026 pour la portée : « ajoute un autre filtre à côté :
 * Moi + Global. Le "Moi" est sélectionné par défaut […] Au clic sur Global, c'est TOUTES les
 * recommandations acceptées qui sont comptabilisées. Les filtres doivent être cumulables. »
 *
 * ILS SE CROISENT, ILS NE SE REMPLACENT PAS : une période ET une portée, quatre combinaisons de
 * deux par trois. C'est pourquoi ce sont deux groupes de segments distincts et non six boutons.
 *
 * LES PÉRIODES SONT EN COURS et non glissantes — du 1er du mois à aujourd'hui, pas les trente
 * derniers jours. C'est la lecture d'un commercial : les objectifs se tiennent au mois et à l'année.
 * Voir les migrations 20260915140000 et 20260924091000.
 *
 * ══ LE TRIMESTRE A ÉTÉ RETIRÉ LE 24/09/2026 ══
 *
 * William : « supprime le filtre Trimestre, garde juste Jour + Mois + Année. » Le retirer d'ici
 * suffit à ramener au défaut ceux qui l'avaient en mémoire : la relecture du `localStorage` vérifie
 * la valeur contre cette liste. La fonction en base continue de l'accepter — une valeur périmée
 * dans un navigateur ne doit pas blanchir un tableau de bord.
 */
export const PERIODES_MONTANT = ['JOUR', 'MOIS', 'ANNEE'] as const
export type PeriodeMontant = (typeof PERIODES_MONTANT)[number]

/** Mes affaires, ou celles de toute l'équipe. */
export const PORTEES_MONTANT = ['MOI', 'GLOBAL'] as const
export type PorteeMontant = (typeof PORTEES_MONTANT)[number]

/** « Moi » par défaut : un commercial ouvre son tableau de bord pour voir SON chiffre. */
export const DEFAUT_PORTEE: PorteeMontant = 'MOI'

export const LIBELLE_PORTEE: Record<PorteeMontant, string> = { MOI: 'Moi', GLOBAL: 'Global' }

/**
 * CE QU'ON VOIT EN ARRIVANT, TANT QU'ON N'A RIEN CHOISI.
 *
 * William, 15/09/2026 : « mets Mois par défaut ». La tuile affichait la journée, et une journée
 * sans signature — le cas de la plupart des jours — montre 0,00 € à l'ouverture du tableau de bord.
 * Le mois en cours dit quelque chose tous les jours du mois.
 *
 * Le choix de chacun reste retenu par son navigateur : ce défaut ne s'applique qu'à la première
 * visite, ou quand le stockage local est refusé.
 */
export const DEFAUT_PERIODE: PeriodeMontant = 'MOIS'

/** L'intitulé sous le montant : il doit dire la période ET la portée, sinon le chiffre est ambigu. */
export const LIBELLE_PERIODE: Record<PeriodeMontant, { onglet: string; quand: string }> = {
  JOUR: { onglet: 'Jour', quand: 'aujourd’hui' },
  MOIS: { onglet: 'Mois', quand: 'ce mois-ci' },
  ANNEE: { onglet: 'Année', quand: 'cette année' },
}

/**
 * La phrase sous le montant.
 *
 * ELLE CHANGE AVEC LA PORTÉE, et c'est le point : « mes affaires acceptées ce mois-ci » sous un
 * chiffre qui compte celles de toute l'équipe ferait croire à chacun qu'il a signé le total du
 * cabinet. Le chiffre ne se défend pas tout seul, la phrase doit le qualifier.
 */
export function phraseMontant(periode: PeriodeMontant, portee: PorteeMontant): string {
  const qui = portee === 'GLOBAL' ? 'toutes les affaires acceptées' : 'mes affaires acceptées'
  return `${qui} ${LIBELLE_PERIODE[periode].quand}`
}

export function useTotauxOffres(periode: PeriodeMontant = DEFAUT_PERIODE, portee: PorteeMontant = DEFAUT_PORTEE) {
  const requete = useQuery({
    // LES DEUX FILTRES ENTRENT DANS LA CLÉ : sans eux, passer de « Mois » à « Année » rendrait le
    // montant du mois depuis le cache, et l'écran annoncerait l'année en montrant autre chose.
    queryKey: ['totaux-offres', periode, portee],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
    // Le montant précédent reste affiché pendant que le nouveau arrive : sans cela, chaque clic
    // ferait clignoter un squelette gris sur un chiffre qu'on vient de lire.
    placeholderData: (precedent) => precedent,
    queryFn: async (): Promise<TotauxOffres> => {
      const { data, error } = await supabase.rpc('compter_totaux_offres', { p_periode: periode, p_portee: portee })
      if (error) {
        if (absente(error.message)) return { pipeEnDecision: 0, nbEnDecision: 0, montantSigne: 0 }
        throw new Error(error.message)
      }
      const l = (Array.isArray(data) ? data[0] : data) as Record<string, number> | null
      return {
        pipeEnDecision: Number(l?.pipe_en_decision ?? 0),
        nbEnDecision: Number(l?.nb_en_decision ?? 0),
        montantSigne: Number(l?.montant_signe ?? 0),
      }
    },
  })

  return requete
}
