import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ChevronRight, FileSignature, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Champ, EnTeteEtape, FenetreParcours, PanneauParcours, RailParcours, SAISIE, useSortieParcours,
  type EtapeParcours, type ResumeEtape,
} from '@/components/parcours/Parcours'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useChiffrage } from '@/lib/data/chiffrage'
import { useContexteOffre } from '@/lib/data/offrePdf'
import { useCreateContrat } from '@/lib/data/contrats'
import { useCloturerVersion, useRetenirOffre } from '@/lib/data/recommandations'
import { lignesPresentables, NB_OFFRES_PROPOSITION } from '@/lib/offrePdf/construction'
import { logoInitiales } from '@/lib/offrePdf/vue'
import { nomJourFerieFR } from '@/lib/joursFeries'
import type { Compteur, Contact, Recommandation } from '@/types/domain'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE CLIENT ACCEPTE — le contrat naît de l'offre retenue
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 04/10/2026 : « Quand le client accepte une offre, il faut créer le contrat selon les
 * caractéristiques de cette offre. Ensuite c'est à Erwan de demander l'édition du contrat auprès du
 * fournisseur sélectionné. » Et : « ça doit simplement clôturer la version et créer le contrat. Ce
 * n'est que la signature du contrat et la validation de ce dernier qui permet de gagner la
 * recommandation. »
 *
 * DEUX ÉTAPES
 *   1. L'offre acceptée — un clic la choisit et fait avancer (une seule réponse possible).
 *   2. Le contrat — la date à laquelle on le veut reçu du fournisseur (jour ouvré, comme toute
 *      demande à Erwan), et le début de fourniture (lendemain de l'échéance par défaut).
 *
 * CE QUE FAIT LA VALIDATION
 *   · le contrat reprend l'offre : fournisseur, type de prix, durée, marge (stratégie « marge fixe »),
 *     les cinq clauses, et la garde (`offre_fournisseur_id`) ; il naît « Nouveau », sans avancement :
 *     il entre aussitôt dans « Ma journée » d'Erwan (« Demander le contrat à … »), et l'e-mail de
 *     demande de contrat part comme depuis toute demande ;
 *   · l'offre devient l'offre retenue de la version — c'est d'elle que la clôture « Acceptée »
 *     calculera plus tard les montants ;
 *   · la version se clôture « Acceptée ». La recommandation, elle, reste ouverte : elle se gagne à la
 *     signature et à la validation du contrat.
 */

const ETAPES: EtapeParcours[] = [
  { cle: 'offre', libelle: 'L’offre acceptée' },
  { cle: 'contrat', libelle: 'Le contrat' },
]

const deux = (n: number) => String(n).padStart(2, '0')
const isoLocal = (d: Date) => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`
const dateFr = (iso: string) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR') : '—')
const eur = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} €`
const fr2 = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ouvre = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6 && !nomJourFerieFR(d)

/** Le contrat se demande pour aujourd'hui avant 15 h, sinon pour le prochain jour ouvré. */
function receptionParDefaut(): string {
  const d = new Date()
  if (d.getHours() >= 15 || !ouvre(d)) {
    do d.setDate(d.getDate() + 1)
    while (!ouvre(d))
  }
  return isoLocal(d)
}

function finDeContrat(debut: string, mois: number | null): string {
  if (!debut || !mois) return ''
  const d = new Date(`${debut}T12:00:00`)
  d.setMonth(d.getMonth() + mois)
  return isoLocal(d)
}

export function AcceptationOffre({ reco, versionId, compteurs, contactSignataire, onFermer, onToast }: {
  reco: Recommandation
  versionId: string
  /** Le périmètre de la recommandation : le site et le numéro du compteur viennent de là. */
  compteurs: Compteur[]
  contactSignataire: Contact | null | undefined
  onFermer: () => void
  onToast: (m: string) => void
}) {
  const queryClient = useQueryClient()
  const { data: chiffrage } = useChiffrage(versionId)
  const contexte = useContexteOffre(chiffrage)
  const creerContrat = useCreateContrat()
  const retenir = useRetenirOffre()
  const cloturer = useCloturerVersion()

  const k = chiffrage?.compteurs[0]
  const compteur = compteurs.find((c) => c.id === k?.compteurId)
  const lignes = useMemo(
    () => (chiffrage && contexte.data ? lignesPresentables(chiffrage, contexte.data).slice(0, NB_OFFRES_PROPOSITION) : []),
    [chiffrage, contexte.data],
  )

  const [etape, setEtape] = useState<'offre' | 'contrat'>('offre')
  const [offreId, setOffreId] = useState<string | null>(null)
  const [reception, setReception] = useState(receptionParDefaut)
  const echeance = k?.reglementaire?.echeance ?? compteur?.date_echeance ?? null
  const [debut, setDebut] = useState(() => {
    if (!echeance) return ''
    const d = new Date(`${echeance.slice(0, 10)}T12:00:00`)
    d.setDate(d.getDate() + 1)
    return isoLocal(d)
  })
  const [enCours, setEnCours] = useState(false)

  const ligne = lignes.find((l) => l.id === offreId) ?? null
  const offre = chiffrage?.offres.find((o) => o.id === offreId) ?? null
  const marge = offre && k ? offre.saisies[k.vcId]?.marge ?? null : null
  const fin = finDeContrat(debut, offre?.duree ?? null)

  const receptionInvalide = (() => {
    if (!reception) return 'La date est obligatoire.'
    const d = new Date(`${reception}T12:00:00`)
    const auj = new Date()
    auj.setHours(0, 0, 0, 0)
    if (d < auj) return 'Cette date est déjà passée.'
    if (d.getDay() === 0 || d.getDay() === 6) return 'Choisissez un jour ouvré : aucun fournisseur ne traite la demande le week-end.'
    const ferie = nomJourFerieFR(d)
    if (ferie) return `${ferie} : aucun fournisseur ne traitera la demande ce jour-là.`
    return null
  })()

  const sortie = useSortieParcours({
    entame: !!offreId,
    bloque: enCours,
    onFermer,
    titre: 'Fermer sans créer le contrat ?',
    description: 'Rien n’est encore enregistré.',
    lignes: [{ texte: 'L’offre choisie et les dates saisies seront perdues.', perdu: true }, { texte: 'La version reste ouverte.', perdu: false }],
  })

  async function creer() {
    if (!chiffrage || !k || !offre || !ligne || receptionInvalide || !debut) return
    if (!compteur) { onToast('Erreur : le compteur de la version n’est plus dans le périmètre de la recommandation.'); return }
    setEnCours(true)
    try {
      const [{ data: statut }, { data: energie }] = await Promise.all([
        supabase.from('statuts_contrats').select('id').eq('code', 'NOUVEAU').maybeSingle(),
        supabase.from('types_energies').select('id').eq('code', k.energie === 'gaz' ? 'GAZ' : 'ELECTRICITE').maybeSingle(),
      ])
      const resultat = await creerContrat.mutateAsync({
        compte_id: reco.compte_id,
        site_id: compteur.site_id,
        site_nom: compteur.site_nom ?? '',
        fournisseur_compte_id: offre.fournisseurId,
        fournisseur_nom: offre.fournisseurNom,
        type_energie_id: (energie as { id: string } | null)?.id ?? null,
        type_energie: k.energie,
        statut_id: (statut as { id: string } | null)?.id ?? null,
        statut_code: 'NOUVEAU',
        reference_fournisseur: null,
        date_debut: debut,
        date_fin: fin || null,
        duree_mois: offre.duree,
        date_reception_souhaitee: reception,
        compteur_ids: [compteur.id],
        compteurs: [{ id: compteur.id, numero_pdl: compteur.numero_pdl, utilisation: compteur.utilisation }],
        contact_signataire_id: contactSignataire?.id ?? reco.contact_signataire_id ?? null,
        contact_signataire_nom: contactSignataire ? `${contactSignataire.prenom} ${contactSignataire.nom}` : undefined,
        type_prix: offre.type,
        strategie_tarifaire: 'marge_fixe',
        prix_molecule_eur_mwh: marge,
        clauses: {
          clause_tacite_reconduction: offre.clauses.tacite,
          clause_depot_garantie: offre.clauses.depot,
          clause_engagement_consommation: offre.clauses.engagement,
          clause_renegociation_anticipee: offre.clauses.renegociation,
          clause_swap: offre.clauses.swap,
        },
        recommandation_id: reco.id,
        version_recommandation_id: versionId,
        offre_fournisseur_id: offre.id,
      })
      /* La demande de contrat ne se perd pas en silence : sans contrat enregistré, rien d'autre ne bouge. */
      if (!resultat.persisted) throw new Error('le contrat n’a pas pu être enregistré. La version reste ouverte : réessayez.')
      if (chiffrage.optimisationId) await retenir.mutateAsync({ optimisationId: chiffrage.optimisationId, offreId: offre.id })
      await cloturer.mutateAsync({ versionId, resultat: 'ACCEPTEE' })
      void queryClient.invalidateQueries({ queryKey: ['contrats'] })
      void queryClient.invalidateQueries({ queryKey: ['pricing'] })
      onToast(`✓ Contrat créé avec ${offre.fournisseurNom} — Erwan va le demander au fournisseur`)
      onFermer()
    } catch (e) {
      onToast(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setEnCours(false)
    }
  }

  const resumes: Record<string, ResumeEtape | undefined> = {
    offre: { lignes: ligne && etape === 'contrat' ? [ligne.fournisseur, `${ligne.typePrix ?? '—'} · ${ligne.dureeMois ?? '?'} mois`] : [] },
    contrat: { lignes: [] },
  }

  return (
    <FenetreParcours sortie={sortie}>
      <RailParcours
        surtitre="Acceptation"
        titre="Le client accepte"
        reference={reco.compte_nom}
        etapes={ETAPES}
        courante={etape}
        sousTitre={etape === 'offre' ? 'Celle que le client a choisie' : 'Ce qu’Erwan demandera au fournisseur'}
        resumes={resumes}
        note={{ titre: 'Ce qui se passe ensuite', texte: 'La version se clôture « Acceptée » et le contrat part chez Erwan, qui le demande au fournisseur. La recommandation se gagne à la signature et à la validation du contrat.' }}
        onFermer={sortie.demander}
      />
      <PanneauParcours>
        {etape === 'offre' ? (
          <>
            <EnTeteEtape numero={1} total={2} titre="Quelle offre le client accepte-t-il ?" />
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {!contexte.data ? (
                <p className="flex items-center gap-2 text-km-body text-km-faint"><Loader2 className="h-4 w-4 animate-spin" /> Chargement des offres…</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {lignes.map((l, i) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => { setOffreId(l.id); setEtape('contrat') }}
                        className={cn(
                          'group flex w-full items-center gap-3 rounded-[12px] border px-4 py-3 text-left transition',
                          offreId === l.id ? 'border-km-green bg-km-green-tint' : 'border-km-line bg-white hover:border-km-green hover:bg-km-green-tint/50',
                        )}
                      >
                        <span className={cn('flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold', i === 0 ? 'bg-km-green text-white' : 'bg-km-soft text-km-muted')}>{i + 1}</span>
                        <img src={l.logo ?? logoInitiales(l.fournisseur)} alt="" className="h-7 w-7 shrink-0 object-contain" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <b className="truncate text-[14px]">{l.fournisseur}</b>
                          <span className="text-[12px] text-km-muted">{l.typePrix ?? '—'} · {l.dureeMois ?? '?'} mois · score {l.score} {l.note}</span>
                        </span>
                        <span className="flex flex-col items-end">
                          <b className="font-mono text-[14px]">{eur(l.totalHt)}</b>
                          <span className="text-[11px] text-km-faint">HTVA / an</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-km-faint group-hover:text-km-green" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <>
            <EnTeteEtape numero={2} total={2} titre="Le contrat à demander" />
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
              {ligne && offre && (
                <div className="grid max-w-[620px] grid-cols-2 gap-x-6 gap-y-2 rounded-[14px] border border-km-line bg-km-bg/40 px-5 py-4 text-[13px] sm:grid-cols-4">
                  <Info libelle="Fournisseur" valeur={offre.fournisseurNom} />
                  <Info libelle="Prix" valeur={offre.type ?? '—'} />
                  <Info libelle="Durée" valeur={offre.duree ? `${offre.duree} mois` : '—'} />
                  <Info libelle="Marge" valeur={marge != null ? `${fr2(marge)} €/MWh` : '—'} />
                </div>
              )}
              <div className="grid max-w-[620px] gap-4 sm:grid-cols-2">
                <Champ intitule="Contrat souhaité pour le" requis>
                  <input type="date" value={reception} onChange={(e) => setReception(e.target.value)} className={SAISIE} />
                  {receptionInvalide
                    ? <span className="text-[11.5px] font-semibold text-km-red">{receptionInvalide}</span>
                    : <span className="text-[11.5px] text-km-faint">Le jour où Erwan doit l’avoir reçu du fournisseur.</span>}
                </Champ>
                <Champ intitule="Début de fourniture" requis>
                  <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} className={SAISIE} />
                  <span className="text-[11.5px] text-km-faint">
                    {echeance ? `Lendemain de l’échéance (${dateFr(echeance.slice(0, 10))}) par défaut.` : 'Aucune échéance connue pour ce compteur.'}
                    {fin ? ` Fin le ${dateFr(fin)}.` : ''}
                  </span>
                </Champ>
              </div>
              <p className="max-w-[620px] text-[12px] leading-snug text-km-faint">
                Signataire : {contactSignataire ? `${contactSignataire.prenom} ${contactSignataire.nom}` : 'aucun contact signataire sur la recommandation'} — modifiable ensuite sur le contrat.
              </p>
            </div>
            <div className="mt-auto flex items-center gap-3 border-t border-km-line-soft pt-4">
              <Button variant="ghost" onClick={() => setEtape('offre')} disabled={enCours}>
                <ArrowLeft className="h-3.5 w-3.5" /> Changer d’offre
              </Button>
              <span className="flex-1" />
              <Button variant="primary" size="lg" onClick={() => void creer()} disabled={!!receptionInvalide || !debut || enCours}>
                {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
                Créer le contrat
              </Button>
            </div>
          </>
        )}
      </PanneauParcours>
    </FenetreParcours>
  )
}

function Info({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint">{libelle}</span>
      <span className="truncate font-semibold text-km-text">{valeur}</span>
    </span>
  )
}
