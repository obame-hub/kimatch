import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { authHeaderJson } from '@/lib/data/authHeader'
import type { DossierKimatch } from '@/lib/tradeo/dossier'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE BANC D'ESSAI TRADEO, CÔTÉ ÉCRAN
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 28/09/2026 : un onglet « visible juste de lui et moi » pour que William voie comment
 * l'API Tradeo répond, avant de l'intégrer aux versions. Tout passe par `POST /api/tradeo` : le
 * navigateur ne voit jamais le jeton Tradeo, et ce module ne connaît aucune adresse Tradeo.
 */

/** Même question que le serveur, posée à la même fonction : `ouvre_banc_tradeo()`. */
export function useOuvreBancTradeo() {
  return useQuery({
    queryKey: ['tradeo', 'ouvre-banc'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ouvre_banc_tradeo')
      if (error) return false
      return data === true
    },
  })
}

export type ActionTradeo =
  | 'etat'
  | 'creer_demande'
  | 'ajouter_fichier'
  | 'mes_demandes'
  | 'demander_validation'
  | 'compteurs_par_siret'
  | 'consommation'
  | 'calculer'
  | 'mes_demandes_offre'

export interface ReponseBanc {
  ok: boolean
  /** Présent quand Tradeo a répondu. */
  statut_http?: number
  duree_ms?: number
  reponse?: unknown
  /** Présent quand Tradeo n'a pas pu être interrogé, ou pour `etat`. */
  code?: string
  message?: string
  url?: string
  configure?: boolean
  prefixe?: string | null
  expiration?: string | null
}

export async function appelerBanc(action: ActionTradeo, parametres: Record<string, unknown> = {}): Promise<ReponseBanc> {
  let res: Response
  try {
    res = await fetch('/api/tradeo', {
      method: 'POST',
      headers: await authHeaderJson(),
      body: JSON.stringify({ action, ...parametres }),
    })
  } catch {
    return { ok: false, code: 'RESEAU', message: 'Kimatch n’a pas pu joindre son serveur.' }
  }
  const texte = await res.text()
  try {
    return JSON.parse(texte) as ReponseBanc
  } catch {
    /* En local sous `vite` seul, `/api` n'existe pas : c'est `index.html` qui revient. */
    return { ok: false, code: 'HORS_SERVEUR', message: `Réponse inattendue du serveur (HTTP ${res.status}). Les routes /api tournent sous Vercel, pas sous vite seul.` }
  }
}

/** Le message à afficher quand l'appel n'a pas abouti, quelle qu'en soit la raison. */
export function messageErreur(r: ReponseBanc): string | null {
  if (r.ok) return null
  if (r.message) return r.message
  const m = (r.reponse as { message?: unknown } | undefined)?.message
  if (typeof m === 'string') return m
  if (Array.isArray(m)) return m.join(' · ')
  return r.statut_http ? `Tradeo a répondu HTTP ${r.statut_http}.` : 'Échec sans message.'
}

export function useEtatTradeo(actif: boolean) {
  return useQuery({
    queryKey: ['tradeo', 'etat'],
    enabled: actif,
    staleTime: 5 * 60 * 1000,
    queryFn: () => appelerBanc('etat'),
  })
}

export interface AppelTradeo {
  id: string
  action: string
  chemin: string
  statut_http: number | null
  succes: boolean
  duree_ms: number | null
  requete: unknown
  reponse: unknown
  erreur: string | null
  date_appel: string
  auteur: { prenom: string } | null
}

export function useJournalTradeo(actif: boolean) {
  return useQuery({
    queryKey: ['tradeo', 'journal'],
    enabled: actif,
    queryFn: async (): Promise<AppelTradeo[]> => {
      const { data, error } = await supabase
        .from('appels_tradeo')
        .select('id, action, chemin, statut_http, succes, duree_ms, requete, reponse, erreur, date_appel, auteur:profils!appels_tradeo_profil_id_fkey(prenom)')
        .order('date_appel', { ascending: false })
        .limit(50)
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as AppelTradeo[]
    },
  })
}

export interface VersionChoisissable {
  version_id: string
  numero_version: number | null
  version_nom: string | null
  recommandation_nom: string
  compte_nom: string | null
  /** En capitales dans la vue (`ELECTRICITE`, `GAZ`), mesuré le 28/09/2026 — la casse n'est pas garantie. */
  type_energie: string | null
  date_souhaitee: string | null
  /** Le statut de la version : une version close se déclare aussi, mais l'écran le dit. */
  version_statut?: string | null
  reco_etape?: string | null
}

/**
 * Les versions qu'on peut déclarer : la version COURANTE de chaque dossier NON CLÔTURÉ, QUEL QUE
 * SOIT SON STATUT.
 *
 * ELLE PASSAIT PAR `v_pricing_versions`, qui ne garde que les versions « En construction » et
 * « Disponible ». Naoëlle, 29/09/2026 : « pourquoi je trouve pas la reco DIMOTRANS - GT: 1 rue de
 * FERCHAUD CREVIN ». Dossier « À réactiver », version 1 clôturée : invisible. Et il n'était pas
 * seul — 84 dossiers à réactiver sur 149 dossiers ouverts, précisément ceux qu'on relance pour
 * REDEMANDER des prix. Déclarer un dossier chez Tradeo ne dépend pas du statut de la version, mais
 * du SIRET, du responsable et des compteurs sous mandat.
 */
export function useVersionsPourTradeo(actif: boolean) {
  return useQuery({
    queryKey: ['tradeo', 'versions'],
    enabled: actif,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<VersionChoisissable[]> => {
      const { data, error } = await supabase
        .from('versions_recommandation')
        .select('id, numero_version, nom, date_souhaitee, statut:statuts_versions_recommandation(code), reco:recommandations!inner(nom, etape:etapes_recommandation!inner(code), compte:comptes!recommandations_compte_id_fkey(nom), energie:types_energies(code))')
        .eq('version_actuelle', true)
        .neq('reco.etape.code', 'CLOTUREE')
      if (error) throw new Error(error.message)
      type Ligne = { id: string; numero_version: number | null; nom: string | null; date_souhaitee: string | null; statut: { code: string } | null; reco: { nom: string; etape: { code: string } | null; compte: { nom: string } | null; energie: { code: string } | null } }
      return ((data ?? []) as unknown as Ligne[])
        .map((v) => ({
          version_id: v.id,
          numero_version: v.numero_version,
          version_nom: v.nom,
          recommandation_nom: v.reco.nom,
          compte_nom: v.reco.compte?.nom ?? null,
          type_energie: v.reco.energie?.code ?? null,
          date_souhaitee: v.date_souhaitee,
          version_statut: v.statut?.code ?? null,
          reco_etape: v.reco.etape?.code ?? null,
        }))
        .sort((a, b) => `${a.compte_nom ?? ''}${a.recommandation_nom}`.localeCompare(`${b.compte_nom ?? ''}${b.recommandation_nom}`, 'fr'))
    },
  })
}

interface LigneVersion {
  id: string
  nom: string | null
  contact: DossierKimatch['contact']
  recommandation: {
    nom: string
    duree_mois: number | null
    compte: { nom: string | null; siret: string | null } | null
    contact_signataire: DossierKimatch['contact']
    contact_principal: DossierKimatch['contact']
  } | null
  compteurs: {
    actif: boolean
    compteur: {
      id: string
      numero_point: string | null
      libelle: string | null
      libelle_site: string | null
      date_echeance: string | null
      consommation_annuelle_mwh: number | null
      type_energie: { code: string } | null
    } | null
  }[]
  durees: { compteur_id: string; duree_mois: number | null }[]
}

export async function chargerDossierKimatch(versionId: string): Promise<DossierKimatch> {
  const { data, error } = await supabase
    .from('versions_recommandation')
    .select(`
      id, nom,
      contact:contacts(civilite, nom, prenom, email, telephone, telephone_mobile, fonction),
      recommandation:recommandations(nom, duree_mois, compte:comptes!recommandations_compte_id_fkey(nom, siret), contact_signataire:contacts!recommandations_contact_signataire_id_fkey(civilite, nom, prenom, email, telephone, telephone_mobile, fonction), contact_principal:contacts!recommandations_contact_principal_id_fkey(civilite, nom, prenom, email, telephone, telephone_mobile, fonction)),
      compteurs:versions_recommandation_compteurs(actif, compteur:compteurs(id, numero_point, libelle, libelle_site, date_echeance, consommation_annuelle_mwh, type_energie:types_energies(code))),
      durees:versions_recommandation_durees(compteur_id, duree_mois)
    `)
    .eq('id', versionId)
    .single()
  if (error) throw new Error(error.message)
  const v = data as unknown as LigneVersion

  /* LA PLUS COURTE DES DURÉES DEMANDÉES par compteur : jusqu'à trois par PDL, et Tradeo n'en prend
     qu'une par demande. La plus courte est celle que tous les fournisseurs acceptent. */
  const dureeParCompteur = new Map<string, number>()
  for (const d of v.durees ?? []) {
    if (d.duree_mois == null) continue
    const avant = dureeParCompteur.get(d.compteur_id)
    if (avant === undefined || d.duree_mois < avant) dureeParCompteur.set(d.compteur_id, d.duree_mois)
  }

  return {
    version_id: v.id,
    version_nom: v.nom,
    recommandation_nom: v.recommandation?.nom ?? '',
    compte_nom: v.recommandation?.compte?.nom ?? null,
    siret: v.recommandation?.compte?.siret ?? null,
    duree_mois: v.recommandation?.duree_mois ?? null,
    /* LE SIGNATAIRE AVANT LE CONTACT PRINCIPAL. Mesuré le 28/09/2026 sur les 64 versions en cours :
       aucune n'a de contact de version ni de contact principal, 62 ont un signataire. C'est aussi la
       bonne personne pour Tradeo — celle qui signe l'ACD et, plus tard, le contrat. */
    contact: v.contact ?? v.recommandation?.contact_signataire ?? v.recommandation?.contact_principal ?? null,
    compteurs: (v.compteurs ?? [])
      .filter((l) => l.actif !== false && l.compteur)
      .map((l) => {
        const c = l.compteur!
        const code = c.type_energie?.code
        return {
          id: c.id,
          numero_point: c.numero_point,
          libelle: c.libelle,
          libelle_site: c.libelle_site,
          energie: code === 'GAZ' ? 'GAZ' : code === 'ELECTRICITE' ? 'ELECTRICITE' : null,
          date_echeance: c.date_echeance,
          consommation_annuelle_mwh: c.consommation_annuelle_mwh,
          duree_mois: dureeParCompteur.get(c.id) ?? null,
        }
      }),
  }
}

export interface FournisseurKimatch {
  compte_id: string
  nom: string
  mode_reponse: string | null
  statut_partenariat: string | null
}

export function useFournisseursKimatch(actif: boolean) {
  return useQuery({
    queryKey: ['tradeo', 'fournisseurs'],
    enabled: actif,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<FournisseurKimatch[]> => {
      const { data, error } = await supabase
        .from('comptes_fournisseurs')
        .select('compte_id, mode_reponse, statut_partenariat, compte:comptes(nom)')
      if (error) throw new Error(error.message)
      return ((data ?? []) as unknown as { compte_id: string; mode_reponse: string | null; statut_partenariat: string | null; compte: { nom: string } | null }[])
        .filter((f) => f.compte?.nom)
        .map((f) => ({ compte_id: f.compte_id, nom: f.compte!.nom, mode_reponse: f.mode_reponse, statut_partenariat: f.statut_partenariat }))
    },
  })
}

export interface MandatDuCompteur {
  compteur_id: string
  numero_point: string
  mandat_id: string
  mandat_reference: string | null
  date_fin_validite: string | null
  document_id: string | null
  document_nom: string | null
}

/**
 * LE MANDAT ACTIF DE CHAQUE COMPTEUR, par la vue `v_compteurs_mandat_actif` — la même que relit
 * `api/tradeo` avant tout envoi (Naoëlle, 29/09/2026 : « on ne peut pas demander des prix si on n'a
 * pas le droit »). Rangé par numéro de point, sans espaces : c'est sous ce numéro que Tradeo connaît
 * le compteur. Un compteur absent n'est couvert par aucun mandat actif.
 */
export async function chargerMandatsActifs(compteurIds: string[]): Promise<Map<string, MandatDuCompteur>> {
  if (compteurIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from('v_compteurs_mandat_actif')
    .select('compteur_id, numero_point, mandat_id, mandat_reference, date_fin_validite, document_id, document_nom')
    .in('compteur_id', compteurIds)
  if (error) throw new Error(error.message)
  return new Map(((data ?? []) as MandatDuCompteur[]).map((m) => [(m.numero_point ?? '').replace(/\s/g, ''), m]))
}
