import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * LES CHIFFRES DE LA MAQUETTE DE MICHEL, ET RIEN QUE CE QUE LA BASE SAIT VRAIMENT.
 *
 * Il a envoyé l'écran du tableau de bord le 25/08/2026 : un bandeau « Marge générée », quatre tuiles
 * chiffrées, puis « Ma journée ». J'ai audité la base avant d'écrire une ligne de rendu, parce qu'un
 * tableau de bord de chiffres inventés est pire que pas de tableau de bord — c'est sur ces nombres
 * qu'un commercial décide de son après-midi.
 *
 * CE QUE L'AUDIT A DONNÉ (25/08/2026) :
 *
 * · `recommandations.marge_nette` est renseignée sur 1 608 lignes sur 1 708, et `date_cloture` sur
 *   1 706. La marge du mois est donc un vrai chiffre : 42 recommandations acceptées en août pour
 *   69 190 €, contre 26 et 69 769 € en juillet.
 * · `date_cloture` porte la date de l'affaire, pas un état : elle est remplie même sur des étapes
 *   ouvertes (38 Consultation, 15 Brouillon en août). C'est la CloseDate reprise de Salesforce. On
 *   croise donc TOUJOURS date_cloture AVEC l'étape Acceptée — sans quoi on compterait comme gagnée
 *   une affaire encore en consultation.
 * · `actions` EST VIDE — zéro ligne. « Ma journée » affichera donc un état vide, et c'est la vérité :
 *   la table se remplira quand les commerciaux créeront des actions. La structure existe et suffit
 *   (`date_prevue` est un timestamp, donc l'heure de la maquette est possible, et `priorite` existe).
 * · `signaux.gravite` est nulle PARTOUT : le badge « 3 prioritaires » de la maquette n'a aucune
 *   source. Il est remplacé par les signaux détectés depuis sept jours, qui eux existent.
 * · `opportunites` n'a AUCUNE colonne de montant. Le « montant du pipe » vient donc des
 *   recommandations ouvertes (`montant`), seul endroit où un montant d'affaire est stocké.
 * · `remunerations` est vide et `versions_recommandation.gain_estime_annuel` n'est renseignée sur
 *   aucune des 2 024 lignes : ni l'un ni l'autre ne peut alimenter quoi que ce soit.
 *
 * CE QUE JE N'AI PAS PU FAIRE, ET POURQUOI JE NE L'AI PAS DEVINÉ. Sa maquette découpe la marge en
 * « Commercial 60 % » et « Kiwee 40 % ». Deux colonnes existent — `commission_interne` et
 * `commission_nette`, étiquetée « Commission nette KiWee » ailleurs dans l'app — mais elles ne
 * peuvent pas produire ce partage : sur mars, commission_interne (154 315 €) est SUPÉRIEURE à
 * commission_nette (148 996 €), donc l'une n'est pas une part de l'autre ; et sur août les deux sont
 * nulles. Un camembert 60/40 bâti là-dessus serait un chiffre faux affiché avec autorité. Les trois
 * emplacements de son bandeau sont donc tenus par des grandeurs vérifiables — recommandations
 * acceptées, marge moyenne, taux d'acceptation — en attendant qu'il dise quelles colonnes portent son
 * partage.
 *
 * LES CHIFFRES SONT CEUX DE L'ÉQUIPE, PAS DU SEUL UTILISATEUR. C'est cohérent avec la règle de
 * Naoëlle du 14/08 (« tous les commerciaux voient tous les comptes »), et le sous-titre le dit. Seule
 * « Ma journée » est personnelle : ce sont les actions dont on est responsable.
 */

/** Premier jour du mois, décalé de `mois` mois, en ISO court. */
function debutDeMois(mois = 0): string {
  const d = new Date()
  return new Date(Date.UTC(d.getFullYear(), d.getMonth() + mois, 1)).toISOString().slice(0, 10)
}

function ilYAJours(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

/** Les identifiants d'une table de référence, par code. */
async function idsParCode(table: string): Promise<Record<string, string>> {
  const { data } = await supabase.from(table).select('id, code')
  const out: Record<string, string> = {}
  for (const r of (data ?? []) as { id: string; code: string }[]) out[r.code] = r.id
  return out
}

/** Somme d'une colonne numérique, en ignorant les lignes non renseignées. */
function somme(lignes: { [k: string]: unknown }[], colonne: string): number {
  let t = 0
  for (const l of lignes) {
    const v = l[colonne]
    if (typeof v === 'number') t += v
  }
  return t
}

export interface ChiffresTableauDeBord {
  /** Marge nette des recommandations acceptées dont l'affaire se clôt dans le mois courant. */
  margeMois: number
  margeMoisPrecedent: number
  /** Variation en points de pourcentage, `null` si le mois précédent est à zéro. */
  variationPct: number | null
  nbAcceptees: number
  nbAccepteesMoisPrecedent: number
  /** Marge moyenne par recommandation acceptée du mois. */
  margeMoyenne: number | null
  /** Acceptées ÷ décidées (acceptées + refusées + abandonnées) sur le mois. */
  tauxAcceptation: number | null
  nbRefusees: number
  nbAbandonnees: number

  signauxATraiter: number
  signauxRecents: number

  opportunitesActives: number
  opportunitesRecentes: number

  recosOuvertes: number
  recosAPresenter: number

  montantPipe: number
  /** Nombre de recommandations ouvertes dont le montant est renseigné — le pipe est partiel sinon. */
  pipeRenseigne: number
}

export function useChiffresTableauDeBord() {
  return useQuery({
    queryKey: ['tableau-de-bord', 'chiffres'],
    // Cinq minutes : ce sont des agrégats de gestion, pas un compteur temps réel.
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ChiffresTableauDeBord> => {
      const [etapes, statutsSignaux, statutsOpp] = await Promise.all([
        idsParCode('etapes_recommandation'),
        idsParCode('statuts_signaux'),
        idsParCode('statuts_opportunites'),
      ])

      const moisCourant = debutDeMois(0)
      const moisSuivant = debutDeMois(1)
      const moisPrecedent = debutDeMois(-1)

      const ouvertes = ['BROUILLON', 'CONSULTATION', 'OFFRES_RECUES', 'A_PRESENTER', 'PRESENTEE']
        .map((c) => etapes[c])
        .filter(Boolean)
      const nonClos = ['NOUVEAU', 'A_QUALIFIER'].map((c) => statutsSignaux[c]).filter(Boolean)
      const oppVivantes = ['NOUVELLE', 'EN_QUALIFICATION', 'COUVERTURE_MANDAT', 'PRETE_A_CONVERTIR']
        .map((c) => statutsOpp[c])
        .filter(Boolean)

      const acceptees = (debut: string, fin: string) =>
        supabase
          .from('recommandations')
          .select('marge_nette')
          .eq('actif', true)
          .eq('etape_id', etapes.ACCEPTEE)
          .gte('date_cloture', debut)
          .lt('date_cloture', fin)

      const compteEtape = (etape: string | undefined, debut?: string, fin?: string) => {
        let q = supabase
          .from('recommandations')
          .select('id', { count: 'exact', head: true })
          .eq('actif', true)
        if (etape) q = q.eq('etape_id', etape)
        if (debut) q = q.gte('date_cloture', debut)
        if (fin) q = q.lt('date_cloture', fin)
        return q
      }

      const [
        rMois,
        rPrecedent,
        rRefusees,
        rAbandonnees,
        rPipe,
        rAPresenter,
        rSignaux,
        rSignauxRecents,
        rOpp,
        rOppRecentes,
      ] = await Promise.all([
        acceptees(moisCourant, moisSuivant),
        acceptees(moisPrecedent, moisCourant),
        compteEtape(etapes.REFUSEE, moisCourant, moisSuivant),
        compteEtape(etapes.ABANDONNEE, moisCourant, moisSuivant),
        // Le pipe se somme sur les lignes : PostgREST ne fait pas de SUM, et 114 lignes d'une seule
        // colonne coûtent moins qu'une vue à créer et à faire appliquer.
        supabase.from('recommandations').select('montant').eq('actif', true).in('etape_id', ouvertes),
        compteEtape(etapes.A_PRESENTER),
        supabase.from('signaux').select('id', { count: 'exact', head: true }).eq('actif', true).in('statut_id', nonClos),
        supabase
          .from('signaux')
          .select('id', { count: 'exact', head: true })
          .eq('actif', true)
          .gte('date_detection', ilYAJours(7)),
        supabase
          .from('opportunites')
          .select('id', { count: 'exact', head: true })
          .eq('actif', true)
          .in('statut_id', oppVivantes),
        supabase
          .from('opportunites')
          .select('id', { count: 'exact', head: true })
          .eq('actif', true)
          .gte('date_creation', ilYAJours(7)),
      ])

      const lignesMois = (rMois.data ?? []) as { marge_nette: number | null }[]
      const lignesPrecedent = (rPrecedent.data ?? []) as { marge_nette: number | null }[]
      const lignesPipe = (rPipe.data ?? []) as { montant: number | null }[]

      const margeMois = somme(lignesMois, 'marge_nette')
      const margeMoisPrecedent = somme(lignesPrecedent, 'marge_nette')
      const nbAcceptees = lignesMois.length
      const nbRefusees = rRefusees.count ?? 0
      const nbAbandonnees = rAbandonnees.count ?? 0
      const decidees = nbAcceptees + nbRefusees + nbAbandonnees

      return {
        margeMois,
        margeMoisPrecedent,
        variationPct:
          margeMoisPrecedent > 0 ? ((margeMois - margeMoisPrecedent) / margeMoisPrecedent) * 100 : null,
        nbAcceptees,
        nbAccepteesMoisPrecedent: lignesPrecedent.length,
        margeMoyenne: nbAcceptees > 0 ? margeMois / nbAcceptees : null,
        tauxAcceptation: decidees > 0 ? (nbAcceptees / decidees) * 100 : null,
        nbRefusees,
        nbAbandonnees,
        signauxATraiter: rSignaux.count ?? 0,
        signauxRecents: rSignauxRecents.count ?? 0,
        opportunitesActives: rOpp.count ?? 0,
        opportunitesRecentes: rOppRecentes.count ?? 0,
        recosOuvertes: lignesPipe.length,
        recosAPresenter: rAPresenter.count ?? 0,
        montantPipe: somme(lignesPipe, 'montant'),
        pipeRenseigne: lignesPipe.filter((l) => l.montant != null).length,
      }
    },
  })
}

export interface ActionDuJour {
  id: string
  titre: string
  /** Heure locale « 09:30 », ou null si l'action est datée sans heure. */
  heure: string | null
  datePrevue: string
  type: string | null
  statut: string | null
  /** Le client ou le site concerné — le « Maison Oria · Visioconférence » de la maquette. */
  contexte: string | null
  /** Vrai dans l'heure qui vient : c'est le badge « Dans 45 min ». */
  imminente: boolean
  minutesAvant: number | null
}

/**
 * LES ACTIONS DU JOUR DE L'UTILISATEUR CONNECTÉ.
 *
 * `date_prevue` est un timestamp, donc l'heure de la maquette sort de la base et n'est pas inventée.
 * Une action datée à minuit pile est traitée comme une action SANS heure : c'est ce qu'un import
 * produit, et afficher « 00:00 » ferait croire à un rendez-vous nocturne.
 */
export function useActionsDuJour(profilId: string | null | undefined) {
  return useQuery({
    queryKey: ['tableau-de-bord', 'journee', profilId],
    enabled: !!profilId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<ActionDuJour[]> => {
      const d = new Date()
      const debut = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
      const fin = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString()

      const { data } = await supabase
        .from('actions')
        .select(
          'id, titre, date_prevue, priorite, type_action:types_actions(libelle), statut:statuts_actions(code, libelle), contact:contacts(prenom, nom), site:sites(nom)',
        )
        .eq('actif', true)
        .eq('responsable_profil_id', profilId)
        .is('date_realisation', null)
        .gte('date_prevue', debut)
        .lt('date_prevue', fin)
        .order('date_prevue')

      type Ligne = {
        id: string
        titre: string | null
        date_prevue: string
        type_action: { libelle: string } | null
        statut: { code: string; libelle: string } | null
        contact: { prenom: string | null; nom: string | null } | null
        site: { nom: string | null } | null
      }

      const maintenant = Date.now()

      return ((data ?? []) as unknown as Ligne[]).map((a) => {
        const quand = new Date(a.date_prevue)
        const minuit = quand.getHours() === 0 && quand.getMinutes() === 0
        const contexte =
          [a.contact?.prenom, a.contact?.nom].filter(Boolean).join(' ') || a.site?.nom || null
        const minutes = Math.round((quand.getTime() - maintenant) / 60_000)
        return {
          id: a.id,
          titre: a.titre || a.type_action?.libelle || 'Action',
          heure: minuit
            ? null
            : quand.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          datePrevue: a.date_prevue,
          type: a.type_action?.libelle ?? null,
          statut: a.statut?.libelle ?? null,
          contexte: [contexte, a.type_action?.libelle].filter(Boolean).join(' · ') || null,
          imminente: !minuit && minutes > 0 && minutes <= 60,
          minutesAvant: minuit ? null : minutes,
        }
      })
    },
  })
}
