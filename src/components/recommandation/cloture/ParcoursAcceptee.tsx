import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  EnTeteEtape, FenetreParcours, PanneauParcours, RailParcours, useSortieParcours,
  type EtapeParcours, type ResumeEtape,
} from '@/components/parcours/Parcours'
import { calculerMontants, pourcent } from '@/components/recommandation/CalculMontants'
import { useMontantsRecommandation } from '@/lib/data/montantAffaire'
import { useCloturerRecommandationParcours, type MontantsCloture } from '@/lib/data/clotureRecommandation'
import { euros } from '@/lib/euros'
import { cn } from '@/lib/utils'
import type { Recommandation } from '@/types/domain'
import { ChampDateCloture, SaisieMontant, aujourdhui, dateFr, dateValide, ecrireMontant, lireMontant } from './commun'
import { phraseVersions } from './versionsOuvertes'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CLÔTURER EN « ACCEPTÉE » — les montants, puis la date
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 01/10/2026 : « Étape 1 : renseignement de tous les montants. Met les champs en forme
 * pour t'adapter à la popup. Étape 2 : choix de la date de clôture. Pas besoin de champ
 * commentaire, inutile quand on gagne. »
 *
 * ══ LA MÊME CALCULATRICE QUE LA FICHE, EN CHAMPS DE SAISIE ══
 *
 * Les lignes, les opérateurs et la capsule du « Montant » sont ceux de `CalculMontants`, et le
 * calcul est le sien (`calculerMontants`) : la fenêtre ne peut pas afficher un chiffre d'affaires
 * que la fiche contredirait ensuite. Seuls les « + ajouter » deviennent de vrais champs, plus
 * faciles à remplir dans une fenêtre qu'on ouvre exprès pour ça.
 *
 * RIEN N'EST ÉCRIT AVANT LA DERNIÈRE ÉTAPE. Sur la fiche, chaque champ s'enregistre à la sortie ;
 * ici on peut encore tout abandonner, donc les montants partent avec la clôture, en une fois.
 */

const ETAPES: EtapeParcours[] = [
  { cle: 'montants', libelle: 'Les montants' },
  { cle: 'date', libelle: 'La date de clôture' },
]

export function ParcoursAcceptee({ reco, onFermer, onToast }: {
  reco: Recommandation
  onFermer: () => void
  onToast: (m: string) => void
}) {
  const { data: calcul } = useMontantsRecommandation(reco.id)
  const cloturer = useCloturerRecommandationParcours()

  const [etape, setEtape] = useState<'montants' | 'date'>('montants')
  const [brutTxt, setBrutTxt] = useState(ecrireMontant(reco.marge_brute))
  const [cipTxt, setCipTxt] = useState(ecrireMontant(reco.commission_intermediaire))
  const [apporteurTxt, setApporteurTxt] = useState(ecrireMontant(reco.marge_apporteur))
  const [montantTxt, setMontantTxt] = useState(ecrireMontant(reco.marge_nette_coeff))
  const [montantTouche, setMontantTouche] = useState(false)
  const [date, setDate] = useState(aujourdhui())
  const [entame, setEntame] = useState(false)

  const brutSaisi = lireMontant(brutTxt)
  const cipSaisie = lireMontant(cipTxt)
  const apporteurSaisi = lireMontant(apporteurTxt)
  const montantSaisi = lireMontant(montantTxt)
  const nombre = (v: number | null | 'invalide') => (v === 'invalide' ? null : v)

  const c = calculerMontants({
    montants: calcul,
    margeBrute: nombre(brutSaisi),
    margeNette: null,
    commissionApporteur: nombre(apporteurSaisi),
    commissionIntermediaire: nombre(cipSaisie),
    /* Le chiffre d'affaires se DÉDUIT dans la fenêtre : c'est ce que la fiche écrit dès qu'un de
       ses deux termes change (`avecMontantNet` de `BlocAffaire`). Passer la valeur enregistrée la
       figerait pendant qu'on corrige le brut. */
    chiffreAffaires: null,
    montantReference: nombre(montantSaisi),
  })
  /* LA VUE CALCULE AVEC L'APPORTEUR ENREGISTRÉ. Quand on le corrige ici, le net et le montant
     proposé doivent suivre tout de suite : on retranche l'écart plutôt que d'attendre la relecture. */
  const ecartApporteur = (reco.marge_apporteur ?? 0) - c.apporteur
  const montantNet = c.calculAbouti
    ? (c.chiffreAffaires != null ? c.chiffreAffaires - c.apporteur : null)
    : c.montantNet
  const montantPropose = c.montantCalcule != null ? Math.round((c.montantCalcule + ecartApporteur) * 100) / 100 : null

  /* LE MONTANT CALCULÉ SE PROPOSE TANT QU'IL N'Y EN A PAS D'ENREGISTRÉ — comme la durée d'un
     contrat prospect. La capsule n'est jamais vide quand le calcul sait la remplir. */
  useEffect(() => {
    if (montantTouche || reco.marge_nette_coeff != null || montantPropose == null) return
    setMontantTxt(ecrireMontant(montantPropose))
  }, [montantPropose, montantTouche, reco.marge_nette_coeff])

  const invalide = [brutSaisi, cipSaisie, apporteurSaisi, montantSaisi].includes('invalide')
  const montantsPrets = !invalide && c.brut != null && montantSaisi != null && montantSaisi !== 'invalide'
  const pret = montantsPrets && dateValide(date)

  const sortie = useSortieParcours({
    entame: entame && !cloturer.isPending,
    bloque: cloturer.isPending,
    onFermer,
    titre: 'Fermer sans clôturer la recommandation ?',
    lignes: [
      { perdu: true, texte: 'Les montants saisis dans cette fenêtre seront perdus.' },
      { texte: 'La recommandation reste ouverte, telle qu’elle était.' },
    ],
    libelleFermer: 'Fermer sans clôturer',
  })
  const toucher = (f: (v: string) => void) => (v: string) => { setEntame(true); f(v) }

  /** Ce qui a changé, et seulement ça — avec le net et le chiffre d'affaires qui en découlent. */
  function patchMontants(): MontantsCloture {
    const patch: MontantsCloture = {}
    const b = nombre(brutSaisi)
    const ci = nombre(cipSaisie)
    const a = nombre(apporteurSaisi)
    if (!c.calculAbouti && b !== (reco.marge_brute ?? null)) patch.marge_brute = b
    if (!c.calculAbouti && ci !== (reco.commission_intermediaire ?? null)) patch.commission_intermediaire = ci
    if (a !== (reco.marge_apporteur ?? null)) patch.marge_apporteur = a
    if (Object.keys(patch).length > 0) {
      const brut = 'marge_brute' in patch ? (patch.marge_brute ?? 0) : (reco.marge_brute ?? 0)
      const cip = 'commission_intermediaire' in patch ? (patch.commission_intermediaire ?? 0) : (reco.commission_intermediaire ?? 0)
      const app = 'marge_apporteur' in patch ? (patch.marge_apporteur ?? 0) : (reco.marge_apporteur ?? 0)
      patch.marge_nette = brut - cip - app
      patch.chiffre_affaires = brut - cip
    }
    const m = nombre(montantSaisi)
    if (m !== (reco.marge_nette_coeff ?? null)) patch.marge_nette_coeff = m
    return patch
  }

  async function valider() {
    if (!pret) return
    try {
      const bilan = await cloturer.mutateAsync({ id: reco.id, dateCloture: date, issue: { finalite: 'ACCEPTEE', montants: patchMontants() } })
      onToast(bilan.erreurs.length ? `✓ Recommandation acceptée — ${bilan.erreurs.join(' · ')}` : '✓ Recommandation acceptée')
      onFermer()
    } catch (e) {
      onToast(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const resumes: Record<string, ResumeEtape | undefined> = {
    montants: { mono: true, lignes: etape === 'date' && montantSaisi != null && montantSaisi !== 'invalide' ? [`Montant ${euros(montantSaisi)}`] : [] },
    date: { mono: true, lignes: dateValide(date) ? [`Close le ${dateFr(date)}`] : [] },
  }
  const versions = phraseVersions(reco.versions, 'Acceptée')

  return (
    <FenetreParcours sortie={sortie}>
      <RailParcours
        surtitre="Clôture"
        titre="Recommandation acceptée"
        reference={reco.titre}
        etapes={ETAPES}
        courante={etape}
        sousTitre={etape === 'montants' ? 'Ce que l’affaire rapporte' : 'Le jour de la décision'}
        resumes={resumes}
        note={versions ? { titre: 'Les versions se ferment avec elle', texte: versions } : undefined}
        onFermer={sortie.demander}
      />

      <PanneauParcours>
        {etape === 'montants' && (
          <>
            <EnTeteEtape numero={1} total={2} titre="Les montants de l’affaire" />
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="max-w-[600px] rounded-[14px] border border-km-line bg-km-bg/40 px-5 py-4">
                <Ligne
                  libelle="Montant brut"
                  precision={c.calculAbouti ? 'calculé depuis l’offre retenue' : 'aucune offre retenue : il se saisit'}
                  valeur={c.calculAbouti ? <Valeur v={c.brut} /> : (
                    <SaisieMontant autoFocus valeur={brutTxt} onChange={toucher(setBrutTxt)} invalide={brutSaisi === 'invalide'} />
                  )}
                />
                <Ligne
                  operateur="−"
                  libelle="Commission intermédiaire pricing"
                  precision={c.calculAbouti
                    ? (c.intermediaire ? `${c.intermediaire} · ${pourcent(calcul?.taux_commissionnement) ?? '—'}` : 'aucun intermédiaire : Kiwee facture en direct')
                    : 'vide = aucune commission'}
                  valeur={c.calculAbouti ? <Valeur v={c.brut == null ? null : c.cip} /> : (
                    <SaisieMontant valeur={cipTxt} onChange={toucher(setCipTxt)} invalide={cipSaisie === 'invalide'} />
                  )}
                />
                <Ligne operateur="=" libelle="Chiffre d’affaires" sousTotal valeur={<Valeur v={c.chiffreAffaires} fort />} />
                <Ligne
                  operateur="−"
                  libelle="Commission apporteur d’affaires"
                  precision="vide = aucun apporteur sur ce dossier"
                  valeur={<SaisieMontant valeur={apporteurTxt} onChange={toucher(setApporteurTxt)} invalide={apporteurSaisi === 'invalide'} />}
                />
                <Ligne operateur="=" libelle="Montant net" sousTotal valeur={<Valeur v={montantNet} fort />} />

                {/* LA CAPSULE, comme sur la fiche : le Montant est LA référence — commissions,
                    objectifs, annonce Slack. C'est le seul chiffre qu'on ne laisse pas partir vide. */}
                <div
                  className="mt-3 flex items-center gap-3 rounded-[12px] px-4 py-3"
                  style={{ background: 'linear-gradient(110deg,#0d7a5f 0%,#199b78 50%,#0d7a5f 100%)', boxShadow: '0 3px 12px rgba(13,122,95,.28)' }}
                >
                  <span className="flex flex-col gap-[2px]">
                    <span className="text-[11px] font-extrabold uppercase tracking-[.08em] text-white/90">Montant <span className="text-white/70">*</span></span>
                    <span className="text-[10.5px] text-white/75">la référence des commissions et des objectifs</span>
                  </span>
                  <span className="flex-1" />
                  <SaisieMontant
                    sombre
                    valeur={montantTxt}
                    onChange={(v) => { setMontantTouche(true); toucher(setMontantTxt)(v) }}
                    invalide={montantSaisi === 'invalide'}
                  />
                </div>
                {montantPropose != null && montantSaisi !== montantPropose && (
                  <button
                    type="button"
                    onClick={() => { setEntame(true); setMontantTouche(true); setMontantTxt(ecrireMontant(montantPropose)) }}
                    className="ml-auto mt-2 block rounded-km bg-km-green-soft px-2 py-1 text-km-label font-semibold text-km-green hover:brightness-95"
                  >
                    Reprendre le calcul : {euros(montantPropose)}
                  </button>
                )}
              </div>
              {invalide && (
                <p className="mt-2 text-[11.5px] font-semibold text-km-red">Un montant en euros, au centime près : 1234,56.</p>
              )}
            </div>
            <div className="mt-auto flex items-center gap-3 border-t border-km-line-soft pt-4">
              <span className="text-[11.5px] text-km-faint">
                {c.brut == null ? 'Le montant brut est obligatoire.' : montantSaisi == null ? 'Le montant est obligatoire.' : 'Rien n’est enregistré avant la dernière étape.'}
              </span>
              <span className="flex-1" />
              <Button variant="ghost" onClick={sortie.demander}>Annuler</Button>
              <Button variant="primary" disabled={!montantsPrets} onClick={() => setEtape('date')}>
                Suivant <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        )}

        {etape === 'date' && (
          <>
            <EnTeteEtape numero={2} total={2} titre="La date de clôture" />
            <div className="flex flex-col gap-[18px]">
              <ChampDateCloture valeur={date} onChange={toucher(setDate)} />
              <div className="flex max-w-[600px] flex-col gap-[6px] rounded-[12px] border border-km-line bg-km-bg px-4 py-[13px] text-[13px]">
                <span className="flex items-center gap-2 text-km-text"><Check className="h-3.5 w-3.5 text-km-green" /> La recommandation passe en Clôturée · Acceptée.</span>
                {versions && <span className="flex items-center gap-2 text-km-text"><Check className="h-3.5 w-3.5 text-km-green" /> {versions}</span>}
                <span className="flex items-center gap-2 text-km-text"><Check className="h-3.5 w-3.5 text-km-green" /> Le deal gagné est annoncé sur Slack.</span>
              </div>
            </div>
            <div className="mt-auto flex items-center gap-3 border-t border-km-line-soft pt-4">
              <span className="flex-1" />
              <Button variant="ghost" onClick={() => setEtape('montants')}>Précédent</Button>
              <Button variant="ghost" onClick={sortie.demander}>Annuler</Button>
              <Button variant="primary" disabled={!pret || cloturer.isPending} onClick={() => void valider()}>
                {cloturer.isPending ? 'Clôture…' : 'Clôturer en Acceptée'}
                {!cloturer.isPending && <Check className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </>
        )}
      </PanneauParcours>
    </FenetreParcours>
  )
}

function Ligne({ operateur, libelle, precision, valeur, sousTotal }: {
  operateur?: '−' | '='
  libelle: string
  precision?: string
  valeur: ReactNode
  sousTotal?: boolean
}) {
  return (
    <div className={cn('flex items-center gap-3 py-[9px]', sousTotal && 'mt-0.5 border-t border-km-line pt-3')}>
      <span className="w-3 shrink-0 text-center font-mono text-[12px] text-km-faint">{operateur ?? ''}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className={cn('text-[13.5px]', sousTotal ? 'font-bold text-km-text' : 'text-km-muted')}>{libelle}</span>
        {precision && <span className="text-[11px] text-km-faint">{precision}</span>}
      </span>
      <span className="shrink-0">{valeur}</span>
    </div>
  )
}

function Valeur({ v, fort }: { v: number | null; fort?: boolean }) {
  return (
    <span className={cn('pr-[22px] font-mono tabular-nums', v == null ? 'text-km-faint' : fort ? 'text-[15px] font-extrabold text-km-text' : 'text-[13px] font-semibold text-km-text')}>
      {v == null ? '—' : euros(v)}
    </span>
  )
}
