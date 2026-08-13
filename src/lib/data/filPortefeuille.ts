import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchMonPortefeuille } from '@/lib/data/visibility'

/**
 * Fil d'actualité du portefeuille — cahier des charges de William (11/08/2026) : « un fil de ce
 * qui se passe d'intéressant sur le portefeuille du commercial. Toutes les modifications ne sont
 * pas bonnes à faire apparaître. »
 *
 * La source est `historique_modifications` (28 768 lignes), mais elle est très majoritairement
 * remplie par la migration Salesforce : latitude, longitude, id_salesforce, compte_id… Ce bruit
 * n'a aucun intérêt métier. On liste donc explicitement les champs qui racontent quelque chose,
 * plutôt que d'exclure le bruit — une liste blanche vieillit mieux qu'une liste noire, car un
 * nouveau champ technique n'apparaîtra jamais par accident dans le fil.
 */

type Categorie = 'mandat' | 'contrat' | 'opportunite' | 'compte'

interface RegleChamp {
  categorie: Categorie
  /** Libellé affiché. `avant`/`apres` sont les valeurs brutes de l'historique. */
  libelle: (avant: string | null, apres: string | null) => string
  /** Vrai quand l'évolution est une bonne nouvelle (signature, score qui monte). */
  favorable?: (avant: string | null, apres: string | null) => boolean
}

/** Un score Ellipro qui monte est une bonne nouvelle, qui descend un signal de vigilance. */
function compareNombres(avant: string | null, apres: string | null): number {
  const a = Number(avant)
  const b = Number(apres)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return b - a
}

const REGLES: Record<string, RegleChamp> = {
  // ── Mandats : le cœur du fil, et le plus gros volume réel ──────────────────────────────
  'mandats.date_signature': {
    categorie: 'mandat',
    libelle: (_a, apres) => (apres ? 'Mandat signé' : 'Signature du mandat annulée'),
    favorable: (_a, apres) => !!apres,
  },
  'mandats.statut_id': { categorie: 'mandat', libelle: () => 'Statut du mandat modifié' },
  'mandats.date_envoi': {
    categorie: 'mandat',
    libelle: (_a, apres) => (apres ? 'Mandat envoyé à la signature' : 'Envoi du mandat annulé'),
  },

  // ── Contrats ──────────────────────────────────────────────────────────────────────────
  'contrats.statut_id': { categorie: 'contrat', libelle: () => 'Statut du contrat modifié' },
  'contrats.date_signature': {
    categorie: 'contrat',
    libelle: (_a, apres) => (apres ? 'Contrat signé' : 'Signature du contrat annulée'),
    favorable: (_a, apres) => !!apres,
  },
  'contrats.prix_molecule_eur_mwh': {
    categorie: 'contrat',
    libelle: (avant, apres) => `Prix révisé : ${avant ?? '—'} → ${apres ?? '—'} €/MWh`,
    // Un prix d'achat qui baisse est favorable pour le client.
    favorable: (avant, apres) => compareNombres(avant, apres) < 0,
  },
  'contrats.type_prix': {
    categorie: 'contrat',
    libelle: (avant, apres) => `Type de prix : ${avant ?? '—'} → ${apres ?? '—'}`,
  },

  // ── Opportunités ──────────────────────────────────────────────────────────────────────
  'recommandations.etape_id': { categorie: 'opportunite', libelle: () => 'Étape de l’opportunité modifiée' },
  'recommandations.marge_nette': {
    categorie: 'opportunite',
    libelle: (avant, apres) => `Marge nette : ${avant ?? '—'} → ${apres ?? '—'} €`,
    favorable: (avant, apres) => compareNombres(avant, apres) > 0,
  },
  'recommandations.marge_brute': {
    categorie: 'opportunite',
    libelle: (avant, apres) => `Marge brute : ${avant ?? '—'} → ${apres ?? '—'} €`,
    favorable: (avant, apres) => compareNombres(avant, apres) > 0,
  },

  // ── Comptes : santé financière ─────────────────────────────────────────────────────────
  'comptes.score_ellipro': {
    categorie: 'compte',
    libelle: (avant, apres) => `Score Ellipro : ${avant ?? '—'} → ${apres ?? '—'}`,
    favorable: (avant, apres) => compareNombres(avant, apres) > 0,
  },
  'comptes.score_ellipro_scale': {
    categorie: 'compte',
    libelle: (avant, apres) => `Notation Ellipro : ${avant ?? '—'} → ${apres ?? '—'}`,
  },
  'comptes.limite_ellipro': {
    categorie: 'compte',
    libelle: (avant, apres) => `Encours conseillé : ${avant ?? '—'} → ${apres ?? '—'} €`,
    favorable: (avant, apres) => compareNombres(avant, apres) > 0,
  },
  'comptes.segment': {
    categorie: 'compte',
    libelle: (avant, apres) => `Segment : ${avant ?? '—'} → ${apres ?? '—'}`,
  },
}

export interface EvenementFil {
  id: string
  categorie: Categorie
  /** Nom de l'objet concerné — compte, site ou libellé de l'opportunité. */
  entite: string
  libelle: string
  /** Bonne nouvelle (vert), vigilance (ambre), ou neutre. */
  ton: 'favorable' | 'vigilance' | 'neutre'
  quand: string
  /** Fiche à ouvrir au clic, quand on sait la construire. */
  to: string | null
}

interface Ligne {
  id: string
  table_nom: string
  ligne_id: string
  champ: string
  ancienne_valeur: string | null
  nouvelle_valeur: string | null
  date_modification: string
}

/** Résout les noms lisibles d'un lot d'identifiants, table par table. */
async function nommer(table: string, ids: string[]): Promise<Map<string, { nom: string; compteId: string | null }>> {
  const carte = new Map<string, { nom: string; compteId: string | null }>()
  if (ids.length === 0) return carte

  const requetes: Record<string, { select: string; nom: (r: Record<string, unknown>) => string }> = {
    comptes: { select: 'id, nom', nom: (r) => String(r.nom ?? '') },
    mandats: { select: 'id, compte_id, compte:comptes(nom)', nom: (r) => String((r.compte as { nom?: string } | null)?.nom ?? 'Mandat') },
    contrats: { select: 'id, compte_id, compte:comptes!contrats_compte_id_fkey(nom)', nom: (r) => String((r.compte as { nom?: string } | null)?.nom ?? 'Contrat') },
    recommandations: { select: 'id, compte_id, titre', nom: (r) => String(r.titre ?? 'Opportunité') },
  }
  const conf = requetes[table]
  if (!conf) return carte

  // Par lots de 150 : le fil retient jusqu'à 400 évolutions, et passer 400 identifiants dans un
  // `in()` fait une URL de 15 ko — au-delà de ce que PostgREST accepte. La requête échouerait
  // entièrement et le fil s'afficherait vide, sans erreur visible.
  const LOT = 150
  for (let i = 0; i < ids.length; i += LOT) {
    const { data, error } = await supabase.from(table).select(conf.select).in('id', ids.slice(i, i + LOT))
    if (error || !data) continue
    for (const ligne of data as unknown as Record<string, unknown>[]) {
      carte.set(String(ligne.id), {
        nom: conf.nom(ligne),
        compteId: table === 'comptes' ? String(ligne.id) : (ligne.compte_id ? String(ligne.compte_id) : null),
      })
    }
  }
  return carte
}

const FICHES: Record<string, (id: string) => string> = {
  comptes: (id) => `/comptes/${id}`,
  mandats: (id) => `/mandats/${id}`,
  contrats: (id) => `/contrats/${id}`,
  recommandations: (id) => `/recommandations/${id}`,
}

async function fetchFilPortefeuille(): Promise<EvenementFil[]> {
  try {
    const cles = Object.keys(REGLES)
    const tables = [...new Set(cles.map((c) => c.split('.')[0]))]
    const champs = [...new Set(cles.map((c) => c.split('.')[1]))]

    // On filtre sur les tables ET les champs retenus, puis on vérifie la paire exacte côté
    // client : un « ou » de paires produirait une URL trop longue pour PostgREST.
    const { data, error } = await supabase
      .from('historique_modifications')
      .select('id, table_nom, ligne_id, champ, ancienne_valeur, nouvelle_valeur, date_modification')
      .in('table_nom', tables)
      .in('champ', champs)
      .order('date_modification', { ascending: false })
      .limit(400)
    if (error) throw error

    const lignes = (data as Ligne[]).filter((l) => REGLES[`${l.table_nom}.${l.champ}`])
    if (lignes.length === 0) return []

    // Noms lisibles, un appel par table concernée.
    const parTable = new Map<string, string[]>()
    for (const l of lignes) {
      const liste = parTable.get(l.table_nom) ?? []
      if (!liste.includes(l.ligne_id)) liste.push(l.ligne_id)
      parTable.set(l.table_nom, liste)
    }
    const noms = new Map<string, Map<string, { nom: string; compteId: string | null }>>()
    await Promise.all(
      [...parTable.entries()].map(async ([table, ids]) => {
        noms.set(table, await nommer(table, ids.slice(0, 300)))
      }),
    )

    // Périmètre du conseiller : le fil ne montre que son portefeuille (décision Michel).
    // « un fil de ce qui se passe d'intéressant sur le portefeuille DU COMMERCIAL » : on filtre
    // sur les comptes qui m'appartiennent, pas sur ceux que j'ai le droit de consulter — sinon un
    // administrateur verrait défiler l'activité de toute la société.
    const { comptes: mesComptes } = await fetchMonPortefeuille()
    const perimetre = new Set(mesComptes)

    const evenements: EvenementFil[] = []
    for (const l of lignes) {
      const regle = REGLES[`${l.table_nom}.${l.champ}`]
      const resolu = noms.get(l.table_nom)?.get(l.ligne_id)
      if (!resolu) continue
      if (!resolu.compteId || !perimetre.has(resolu.compteId)) continue

      const favorable = regle.favorable?.(l.ancienne_valeur, l.nouvelle_valeur)
      evenements.push({
        id: l.id,
        categorie: regle.categorie,
        entite: resolu.nom,
        libelle: regle.libelle(l.ancienne_valeur, l.nouvelle_valeur),
        ton: favorable === undefined ? 'neutre' : favorable ? 'favorable' : 'vigilance',
        quand: l.date_modification,
        to: FICHES[l.table_nom]?.(l.ligne_id) ?? null,
      })
    }

    return evenements.slice(0, 40)
  } catch (error) {
    console.error('fetchFilPortefeuille', error)
    return []
  }
}

export function useFilPortefeuille() {
  return useQuery({ queryKey: ['fil-portefeuille'], queryFn: fetchFilPortefeuille })
}

/** Regroupe les événements par jour, avec un libellé lisible (« Aujourd'hui », « Hier », date). */
export function grouperParJour(evenements: EvenementFil[]) {
  const aujourdHui = new Date().toISOString().slice(0, 10)
  const hier = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

  const groupes = new Map<string, EvenementFil[]>()
  for (const e of evenements) {
    const jour = e.quand.slice(0, 10)
    const liste = groupes.get(jour) ?? []
    liste.push(e)
    groupes.set(jour, liste)
  }

  return [...groupes.entries()].map(([jour, items]) => ({
    jour,
    libelle:
      jour === aujourdHui
        ? "Aujourd'hui"
        : jour === hier
          ? 'Hier'
          : new Date(jour).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }),
    items,
  }))
}
