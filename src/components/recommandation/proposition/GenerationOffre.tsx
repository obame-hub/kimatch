import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Crown, Download, Loader2, Minus, Plus, RotateCcw, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { budgetLigne, useChiffrage, useChiffrageMutations, type OffreChiffrage } from '@/lib/data/chiffrage'
import { useContexteOffre, useRessourcesOffre, imprimerOffrePdf } from '@/lib/data/offrePdf'
import { useTeleverserDocuments } from '@/lib/data/documents'
import { useOuvrirEmail } from '@/lib/voletEmail'
import { enregistrerValiditeOffre } from '@/lib/data/validiteOffre'
import {
  avecMarges, construireOffrePdf, ligneActuelle, lignesPresentables, NB_OFFRES_PROPOSITION, raisonIndisponible, ttcParDefaut,
} from '@/lib/offrePdf/construction'
import { htmlOffre } from '@/lib/offrePdf/document'
import { margesOptimisees } from '@/lib/offrePdf/margeOptimisee'
import { logoInitiales } from '@/lib/offrePdf/vue'
import type { LigneOffrePdf } from '@/lib/offrePdf/types'
import { Champ, ConfirmationSortie, SAISIE, Segments, useSortieParcours } from '@/components/parcours/Parcours'
import type { Contact, Recommandation } from '@/types/domain'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * GÉNÉRER L'OFFRE — le formulaire qui prend la place du bloc version
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 04/10/2026 : « quand je cliquerai sur générer l'offre, alors tout le bloc version sera
 * remplacé par un formulaire de génération d'offre avec 2 étapes ».
 *
 * ÉTAPE 1 — LA MARGE. « Validation ou modification de la marge […] offre par offre. » En direct, le
 * prix présenté (P0 + marge au gaz ; Pointe, HPH, HCH, HPE, HCE en électricité) et le budget total
 * bougent avec elle. Deux façons de faire :
 *   · personnalisée : offre par offre, par pas de 0,10 €/MWh ou au clavier ;
 *   · optimisée : « tu choisis un fournisseur que tu veux qu'il soit premier et Kimatch vient
 *     automatiquement ajuster les autres offres pour qu'elles soient légèrement plus chères » —
 *     voir `margeOptimisee.ts` pour le « malin et discret ».
 * RIEN NE S'ENREGISTRE AVANT LA GÉNÉRATION (« la marge modifiée est enregistrée à la génération du
 * PDF ») : quitter le formulaire laisse les marges du pricing intactes.
 *
 * ÉTAPE 2 — LES OPTIONS. HTVA ou TTC (par défaut selon le compte), les clauses contractuelles
 * affichées ou non (oui par défaut ; non, leur tableau disparaît de la page 2), la validité.
 *
 * À LA GÉNÉRATION : le PDF s'imprime, les marges s'enregistrent (l'écart à celle du pricing reste
 * lisible comme « effort commercial »), le PDF se range sur la version et l'e-mail au client s'ouvre,
 * proposition jointe.
 */

const deux = (n: number) => String(n).padStart(2, '0')
const localIso = (d: Date) => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}T${deux(d.getHours())}:${deux(d.getMinutes())}`
const fr = (v: number | null | undefined, d = 2) => (v == null ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }))
const eur = (v: number) => `${Math.round(v).toLocaleString('fr-FR')} €`
const POSTES = ['POINTE', 'HPH', 'HCH', 'HPE', 'HCE'] as const
const LIBELLE_POSTE: Record<string, string> = { POINTE: 'Pointe', HPH: 'HPH', HCH: 'HCH', HPE: 'HPE', HCE: 'HCE' }

const LARGEUR_PAGE = 794
const HAUTEUR_PAGE = 1123
const ESPACE = 14

export function GenerationOffre({
  reco, versionId, numeroVersion, ttcInitial, typeDocumentPropositionId, contactSignataire, signaler, onPresentationEnvoyee, onFermer,
}: {
  reco: Recommandation
  versionId: string
  numeroVersion: number | null
  /** La présentation choisie dans les onglets ; `null` : celle du compte relié. */
  ttcInitial: boolean | null
  typeDocumentPropositionId: string | null
  contactSignataire: Contact | null | undefined
  signaler: (message: string) => void
  onPresentationEnvoyee: () => void
  onFermer: () => void
}) {
  const { data: chiffrage } = useChiffrage(versionId)
  const contexte = useContexteOffre(chiffrage)
  const ressources = useRessourcesOffre()
  const mutations = useChiffrageMutations(versionId)
  const televerser = useTeleverserDocuments()
  const ouvrirEmail = useOuvrirEmail()

  const k = chiffrage?.compteurs[0]
  const vc = k?.vcId ?? ''
  const gaz = k?.energie === 'gaz'
  const raison = chiffrage ? raisonIndisponible(chiffrage) : null

  /* Les marges enregistrées, celles du pricing, et le brouillon du commercial. */
  const enregistrees = useMemo(() => Object.fromEntries((chiffrage?.offres ?? []).map((o) => [o.id, o.saisies[vc]?.marge ?? 0])), [chiffrage, vc])
  const duPricing = useMemo(() => Object.fromEntries((chiffrage?.offres ?? []).map((o) => [o.id, o.saisies[vc]?.margePricing ?? o.saisies[vc]?.marge ?? 0])), [chiffrage, vc])
  const [brouillon, setBrouillon] = useState<Record<string, number>>({})
  const marges = useMemo(() => ({ ...enregistrees, ...brouillon }), [enregistrees, brouillon])

  const [etape, setEtape] = useState<1 | 2>(1)
  const [mode, setMode] = useState<'perso' | 'optimisee'>('perso')
  const [enTete, setEnTete] = useState<string | null>(null)
  const [ttcChoisi, setTtc] = useState<boolean | null>(ttcInitial)
  const ttc = ttcChoisi ?? ttcParDefaut(contexte.data?.clientSegment)
  const [clauses, setClauses] = useState(true)
  const validiteDefaut = useMemo(() => {
    const dates = (chiffrage?.offres ?? []).filter((o) => o.statut === 'DISPONIBLE' && o.validite).map((o) => o.validite!.slice(0, 10)).sort()
    if (dates[0]) return `${dates[0]}T18:00`
    const demain = new Date()
    demain.setDate(demain.getDate() + 1)
    demain.setHours(18, 0, 0, 0)
    return localIso(demain)
  }, [chiffrage])
  const [validiteChoisie, setValidite] = useState<string | null>(null)
  const validite = validiteChoisie ?? validiteDefaut
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const modifiees = (chiffrage?.offres ?? []).filter((o) => Math.abs((marges[o.id] ?? 0) - (enregistrees[o.id] ?? 0)) > 0.0001)
  const sortie = useSortieParcours({
    entame: modifiees.length > 0 || etape === 2,
    bloque: enCours,
    onFermer,
    titre: 'Quitter la génération de l’offre ?',
    description: 'Aucune proposition n’a été générée.',
    lignes: modifiees.length > 0
      ? [{ texte: `Les marges ajustées sur ${modifiees.length} offre${modifiees.length > 1 ? 's' : ''} ne seront pas enregistrées.`, perdu: true }, { texte: 'Les marges du pricing restent telles quelles.', perdu: false }]
      : [{ texte: 'Les options choisies seront perdues.', perdu: true }],
  })

  const chiffrageBrouillon = useMemo(() => (chiffrage ? avecMarges(chiffrage, marges) : null), [chiffrage, marges])
  const lignes = useMemo(() => (chiffrageBrouillon && contexte.data ? lignesPresentables(chiffrageBrouillon, contexte.data) : []), [chiffrageBrouillon, contexte.data])
  const actuelle = useMemo(() => (chiffrageBrouillon && contexte.data ? ligneActuelle(chiffrageBrouillon, contexte.data) : null), [chiffrageBrouillon, contexte.data])
  const offreDe = (id: string) => chiffrage?.offres.find((o) => o.id === id)
  const volume = k ? (gaz ? k.car ?? 0 : Object.values(k.conso).reduce((t, x) => t + x, 0)) : 0
  const total = (l: LigneOffrePdf) => (ttc ? l.totalTtc : l.totalHt)

  const changer = (id: string, valeur: number) => setBrouillon((b) => ({ ...b, [id]: Math.max(0, Math.round(valeur * 100) / 100) }))
  /* L'optimisation part toujours des marges enregistrées : rechoisir un fournisseur ne cumule pas. */
  function mettreEnTete(id: string) {
    if (!k || !chiffrage) return
    setEnTete(id)
    const eligibles = lignes.map((l) => offreDe(l.id)).filter((o): o is OffreChiffrage => !!o)
    const budget = (oid: string, m: number) => {
      const o = offreDe(oid)
      const s = o?.saisies[vc]
      return o && s ? budgetLigne(k, { ...s, marge: m }, o.duree)?.total ?? 0 : 0
    }
    setBrouillon(margesOptimisees(eligibles.map((o) => ({ id: o.id, marge: enregistrees[o.id] ?? 0 })), id, budget))
  }
  const revenirAuPricing = () => { setBrouillon(duPricing); setEnTete(null) }

  const html = useMemo(() => {
    if (!chiffrageBrouillon || !contexte.data || !ressources.data || raison) return null
    return htmlOffre(construireOffrePdf(chiffrageBrouillon, contexte.data, { validite, ttc, clauses }), ressources.data)
  }, [chiffrageBrouillon, contexte.data, ressources.data, raison, validite, ttc, clauses])

  async function generer() {
    if (!html || !chiffrage || !contexte.data) return
    setEnCours(true)
    setErreur(null)
    try {
      const nom = `Proposition commerciale ${contexte.data.clientNom} ${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.pdf`
      /* L'impression d'abord : si elle échoue, rien n'est enregistré. */
      const blob = await imprimerOffrePdf(html, nom)
      const fichier = new File([blob], nom, { type: 'application/pdf' })
      for (const o of modifiees) {
        for (const c of chiffrage.compteurs) {
          const s = o.saisies[c.vcId]
          if (s) await mutations.enregistrerLigne.mutateAsync({ offre: o, compteur: c, saisie: { ...s, marge: marges[o.id] }, effortCommercial: true })
        }
      }
      const [doc] = await televerser.mutateAsync({
        fichiers: [fichier], entite_type: 'version_recommandation', entite_id: versionId,
        type_document_id: typeDocumentPropositionId, type_document_libelle: 'Appel d’offres', categorie: 'APPEL_OFFRES',
      })
      /* La validité part sur la version : compte à rebours de la bande, alerte de la veille. */
      await enregistrerValiditeOffre(versionId, new Date(validite).toISOString())
      const telechargement = document.createElement('a')
      telechargement.href = URL.createObjectURL(fichier)
      telechargement.download = nom
      telechargement.click()
      setTimeout(() => URL.revokeObjectURL(telechargement.href), 10_000)
      signaler('✓ Offre générée et rangée sur la version')
      /* Un clic de moins : l'e-mail au client s'ouvre, proposition jointe (William, 04/10/2026). */
      if (ouvrirEmail && contactSignataire?.email && doc) {
        ouvrirEmail({
          a: contactSignataire.email,
          nom: `${contactSignataire.prenom} ${contactSignataire.nom}`.trim(),
          objet: `Proposition commerciale — ${reco.compte_nom}`,
          contactId: contactSignataire.id, compteId: reco.compte_id, recommandationId: reco.id,
          piecesJointes: [{ nom: doc.nom_fichier || doc.nom, url: doc.url, type: 'application/pdf', taille: fichier.size }],
        })
        onPresentationEnvoyee()
      }
      onFermer()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setEnCours(false)
    }
  }

  const pret = !!chiffrage && !!contexte.data && !!ressources.data
  const pages = html ? (html.match(/<section class="page"/g) ?? []).length || 1 : 3
  const hauteurApercu = pages * (HAUTEUR_PAGE + ESPACE) + ESPACE
  const apercu = html?.replace('</head>', `<style>body{padding:${ESPACE}px 0 0}section.page{margin:0 auto ${ESPACE}px;box-shadow:0 1px 6px rgba(20,24,20,.18)}</style></head>`)
  const ECHELLE = 0.42

  return (
    <div className="rounded-[13px] border border-km-green-line bg-white">
      {/* En-tête : ce qu'on fait, sur quelle version, où l'on en est. */}
      <div className="flex flex-wrap items-center gap-3 rounded-t-[13px] border-b border-km-line bg-gradient-to-b from-km-green-tint to-white px-[17px] py-3">
        <span className="rounded-km-pill bg-km-amber-soft px-2 py-[2px] text-km-label font-extrabold text-[#8a4b2a]">Version {numeroVersion ?? ''}</span>
        <span className="text-km-body font-extrabold text-km-text">Générer l’offre</span>
        <ol className="flex items-center gap-2 text-[12px]">
          {([[1, 'Marge'], [2, 'Options']] as const).map(([n, libelle]) => (
            <li key={n} className={cn('inline-flex items-center gap-1.5 font-semibold', etape === n ? 'text-km-text' : 'text-km-faint')}>
              <span className={cn('flex h-[19px] w-[19px] items-center justify-center rounded-full text-[10.5px] font-bold', etape > n ? 'bg-km-green text-white' : etape === n ? 'bg-km-text text-white' : 'border border-km-line text-km-faint')}>
                {etape > n ? <Check className="h-3 w-3" /> : n}
              </span>
              {libelle}
            </li>
          ))}
        </ol>
        <span className="flex-1" />
        <button type="button" onClick={sortie.demander} disabled={enCours} aria-label="Quitter la génération" className="rounded-md p-1 text-km-faint hover:bg-km-soft hover:text-km-text disabled:opacity-40">
          <X className="h-4 w-4" />
        </button>
      </div>

      {!pret ? (
        <p className="flex items-center gap-2 px-[17px] py-6 text-km-body text-km-faint"><Loader2 className="h-4 w-4 animate-spin" /> Préparation…</p>
      ) : raison ? (
        <p className="px-[17px] py-4 text-km-body text-km-muted">{raison}</p>
      ) : etape === 1 ? (
        <div className="flex flex-col gap-3 px-[17px] py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-[330px]">
              <Segments
                valeur={mode}
                obligatoire
                onChoisir={(v) => { setMode(v as 'perso' | 'optimisee'); if (v === 'perso') setEnTete(null) }}
                options={[{ valeur: 'perso', libelle: 'Marge personnalisée' }, { valeur: 'optimisee', libelle: 'Marge optimisée' }]}
              />
            </div>
            <span className="min-w-0 flex-1 text-[12px] text-km-muted">
              {mode === 'perso'
                ? 'Ajustez la marge offre par offre : prix et budgets suivent en direct.'
                : 'Choisissez le fournisseur à placer en tête : les offres moins chères remontent juste derrière lui, par petites touches.'}
            </span>
            {Object.keys(brouillon).length > 0 && (
              <button type="button" onClick={revenirAuPricing} className="inline-flex h-7 items-center gap-1 rounded-km border border-km-line bg-white px-2.5 text-[11px] font-medium text-km-muted hover:bg-km-soft">
                <RotateCcw className="h-3 w-3" /> Marges du pricing
              </button>
            )}
            <div className="flex gap-[2px] rounded-[9px] border border-km-line bg-km-soft p-[3px]">
              {([[false, 'HTVA'], [true, 'TTC']] as const).map(([v, libelle]) => (
                <button key={libelle} type="button" onClick={() => setTtc(v)} className={cn('rounded-[6px] px-2.5 py-[3px] text-[12px]', ttc === v ? 'bg-km-green font-bold text-white' : 'font-medium text-km-muted hover:bg-white')}>{libelle}</button>
              ))}
            </div>
          </div>

          <TableauMarges
            lignes={lignes}
            actuelle={actuelle}
            gaz={gaz}
            ttc={ttc}
            mode={mode}
            enTete={enTete}
            marges={marges}
            duPricing={duPricing}
            enregistrees={enregistrees}
            p0De={(id) => offreDe(id)?.saisies[vc]}
            volume={volume}
            total={total}
            onMarge={changer}
            onEnTete={mettreEnTete}
          />

          <div className="flex items-center justify-end gap-2 border-t border-km-line-soft pt-3">
            <span className="mr-auto text-[12px] text-km-faint">
              {modifiees.length > 0 ? `${modifiees.length} marge${modifiees.length > 1 ? 's' : ''} modifiée${modifiees.length > 1 ? 's' : ''} — enregistrée${modifiees.length > 1 ? 's' : ''} à la génération.` : 'Marges du pricing, inchangées.'}
            </span>
            <button type="button" onClick={() => setEtape(2)} className="inline-flex h-[34px] items-center gap-1.5 rounded-km bg-km-green px-4 text-km-body font-bold text-white hover:brightness-110">
              Choisir les options <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5 px-[17px] py-4 md:flex-row">
          <div className="flex w-full shrink-0 flex-col gap-4 md:w-[290px]">
            <Champ intitule="Budgets">
              <Segments valeur={ttc ? 'ttc' : 'ht'} obligatoire onChoisir={(v) => setTtc(v === 'ttc')} options={[{ valeur: 'ht', libelle: 'HTVA' }, { valeur: 'ttc', libelle: 'TTC' }]} />
              <span className="text-[11.5px] text-km-faint">{contexte.data?.clientSegment ? `Compte « ${contexte.data.clientSegment} »` : 'TTC pour un syndic, HTVA pour une entreprise'}.</span>
            </Champ>
            <Champ intitule="Clauses contractuelles">
              <Segments valeur={clauses ? 'oui' : 'non'} obligatoire onChoisir={(v) => setClauses(v === 'oui')} options={[{ valeur: 'oui', libelle: 'Afficher' }, { valeur: 'non', libelle: 'Masquer' }]} />
              <span className="text-[11.5px] text-km-faint">{clauses ? 'Tableau et score en page 2.' : 'La page 2 ne garde que les prix unitaires.'}</span>
            </Champ>
            <Champ intitule="Offre valable jusqu’au" requis>
              <input type="datetime-local" value={validite} onChange={(e) => setValidite(e.target.value)} className={SAISIE} />
            </Champ>

            {erreur && <p className="rounded-km border border-km-red-line bg-km-red-soft px-3 py-2 text-[12px] text-km-red">{erreur}</p>}

            <div className="mt-auto flex flex-col gap-2 border-t border-km-line-soft pt-3">
              <button type="button" onClick={() => void generer()} disabled={!html || !validite || enCours} className="inline-flex h-[38px] items-center justify-center gap-1.5 rounded-km bg-km-green px-4 text-km-body font-bold text-white hover:brightness-110 disabled:opacity-50">
                {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {enCours ? 'Génération…' : 'Générer l’offre'}
              </button>
              <button type="button" onClick={() => setEtape(1)} disabled={enCours} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-km text-[12.5px] font-semibold text-km-muted hover:bg-km-soft">
                <ArrowLeft className="h-3.5 w-3.5" /> Revenir à la marge
              </button>
              <span className="text-[11.5px] leading-snug text-km-faint">Le PDF se range sur la version et l’e-mail au client s’ouvre, proposition jointe.</span>
            </div>
          </div>
          <div className="h-[560px] min-w-0 flex-1 overflow-y-auto overflow-x-hidden rounded-km border border-km-line bg-[#f2f3ee]">
            {apercu && (
              <div style={{ width: LARGEUR_PAGE * ECHELLE, height: hauteurApercu * ECHELLE }} className="mx-auto">
                <iframe title="Aperçu de l’offre" srcDoc={apercu} sandbox="" scrolling="no" style={{ width: LARGEUR_PAGE + 32, height: hauteurApercu, transform: `scale(${ECHELLE})`, transformOrigin: '0 0', marginLeft: -16 * ECHELLE, border: 0 }} />
              </div>
            )}
          </div>
        </div>
      )}
      {sortie.demandee && <ConfirmationSortie sortie={sortie} />}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════ */

function TableauMarges({
  lignes, actuelle, gaz, ttc, mode, enTete, marges, duPricing, enregistrees, p0De, volume, total, onMarge, onEnTete,
}: {
  lignes: LigneOffrePdf[]
  actuelle: LigneOffrePdf | null
  gaz: boolean
  ttc: boolean
  mode: 'perso' | 'optimisee'
  enTete: string | null
  marges: Record<string, number>
  duPricing: Record<string, number>
  enregistrees: Record<string, number>
  p0De: (id: string) => { p0: number | null; p0Postes: Record<string, number | null> } | undefined
  volume: number
  total: (l: LigneOffrePdf) => number
  onMarge: (id: string, v: number) => void
  onEnTete: (id: string) => void
}) {
  /* Les postes qu'on montre en électricité : ceux qui portent un prix. */
  const postes = gaz ? [] : POSTES.filter((p) => lignes.some((l) => l.unitaires.postes?.[p] != null))
  const grille = `${mode === 'optimisee' ? '30px ' : ''}22px minmax(150px,1.3fr) minmax(${gaz ? 120 : 210}px,1.6fr) 150px 110px 100px 120px`
  const entete = 'text-[9.5px] font-bold uppercase tracking-[.06em] text-km-faint'

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[860px]">
        <div className="grid items-end gap-x-3 border-b border-km-line px-2.5 pb-2" style={{ gridTemplateColumns: grille }}>
          {mode === 'optimisee' && <span className={entete} title="Le fournisseur à placer en tête">Tête</span>}
          <span className={entete}>#</span>
          <span className={entete}>Fournisseur</span>
          <span className={entete}>{gaz ? 'Molécule présentée · €/MWh' : `Prix présentés · €/MWh`}</span>
          <span className={cn(entete, 'text-center')}>Marge · €/MWh</span>
          <span className={cn(entete, 'text-right')}>Budget {ttc ? 'TTC' : 'HTVA'}</span>
          <span className={cn(entete, 'text-right')}>Écart / an</span>
          <span className={cn(entete, 'text-right')} title="Marge KiWee sur la durée du contrat">Marge sur la durée</span>
        </div>

        {actuelle && (
          <div className="mt-2 grid items-center gap-x-3 rounded-km-md border border-km-line bg-km-soft px-2.5 py-2 text-[13px]" style={{ gridTemplateColumns: grille }}>
            {mode === 'optimisee' && <span />}
            <span className="text-km-faint">—</span>
            <span className="flex min-w-0 items-center gap-2">
              <img src={actuelle.logo ?? logoInitiales(actuelle.fournisseur)} alt="" className="h-5 w-5 shrink-0 object-contain opacity-60 grayscale" />
              <span className="flex min-w-0 flex-col leading-tight"><b className="truncate">{actuelle.fournisseur}</b><span className="text-[9.5px] font-extrabold tracking-[.06em] text-km-muted">OFFRE ACTUELLE</span></span>
            </span>
            <PrixPresentes l={actuelle} gaz={gaz} postes={postes} />
            <span />
            <span className="text-right font-mono font-bold">{eur(total(actuelle))}</span>
            <span className="text-right text-[11px] text-km-muted">Référence</span>
            <span />
          </div>
        )}

        {lignes.map((l, i) => {
          const marge = marges[l.id] ?? 0
          const effort = Math.round((marge - (duPricing[l.id] ?? 0)) * 100) / 100
          const modifiee = Math.abs(marge - (enregistrees[l.id] ?? 0)) > 0.0001
          const ecart = actuelle ? total(l) - total(actuelle) : null
          const hors = i >= NB_OFFRES_PROPOSITION
          const s = p0De(l.id)
          return (
            <div
              key={l.id}
              className={cn(
                'mt-1.5 grid items-center gap-x-3 rounded-km-md border px-2.5 py-2 text-[13px] transition-colors',
                i === 0 ? 'border-[#9fd0b9] bg-km-green-tint' : 'border-km-line-soft bg-white',
                hors && 'opacity-55',
              )}
              style={{ gridTemplateColumns: grille }}
            >
              {mode === 'optimisee' && (
                <button
                  type="button"
                  onClick={() => onEnTete(l.id)}
                  aria-pressed={enTete === l.id}
                  title={`Placer ${l.fournisseur} en tête`}
                  className={cn('flex h-[26px] w-[26px] items-center justify-center rounded-full border transition', enTete === l.id ? 'border-km-green bg-km-green text-white' : 'border-km-line text-km-faint hover:border-km-green hover:text-km-green')}
                >
                  <Crown className="h-3.5 w-3.5" />
                </button>
              )}
              <span className={cn('inline-flex h-[22px] w-[22px] items-center justify-center rounded-full text-[10px] font-extrabold', i === 0 ? 'bg-km-green text-white' : 'bg-km-soft text-km-muted')}>{i + 1}</span>
              <span className="flex min-w-0 items-center gap-2">
                <img src={l.logo ?? logoInitiales(l.fournisseur)} alt="" className="h-5 w-5 shrink-0 object-contain" />
                <span className="flex min-w-0 flex-col leading-tight">
                  <b className="truncate">{l.fournisseur}</b>
                  <span className="text-[11px] text-km-muted">{l.typePrix ?? '—'} · {l.dureeMois ?? '?'} mois{hors ? ' · hors proposition (5 offres max.)' : ''}</span>
                </span>
              </span>
              <PrixPresentes l={l} gaz={gaz} postes={postes} p0={gaz ? s?.p0 ?? null : null} />
              <span className="flex flex-col items-center gap-0.5">
                <span className="flex items-center gap-1">
                  <button type="button" onClick={() => onMarge(l.id, marge - 0.1)} aria-label={`Baisser la marge de ${l.fournisseur}`} className="flex h-6 w-6 items-center justify-center rounded-km-sm border border-km-line bg-white text-km-muted hover:border-km-green hover:text-km-green"><Minus className="h-3 w-3" /></button>
                  <ChampMarge valeur={marge} modifiee={modifiee} libelle={`Marge de ${l.fournisseur}`} onChange={(v) => onMarge(l.id, v)} />
                  <button type="button" onClick={() => onMarge(l.id, marge + 0.1)} aria-label={`Monter la marge de ${l.fournisseur}`} className="flex h-6 w-6 items-center justify-center rounded-km-sm border border-km-line bg-white text-km-muted hover:border-km-green hover:text-km-green"><Plus className="h-3 w-3" /></button>
                </span>
                {effort !== 0 && <span className="text-[10px] font-semibold text-km-amber">{effort > 0 ? '+' : '−'}{fr(Math.abs(effort))} vs pricing</span>}
              </span>
              <span className="text-right font-mono font-extrabold">{eur(total(l))}</span>
              <span className="text-right">
                {ecart != null && (
                  <span className={cn('rounded-full px-2 py-0.5 font-mono text-[11px] font-bold', ecart < 0 ? 'bg-km-green-soft text-km-green' : 'bg-km-red-soft text-km-red')}>
                    {ecart < 0 ? '−' : '+'} {eur(Math.abs(ecart))}
                  </span>
                )}
              </span>
              <span className="text-right font-mono text-[12px] text-km-muted">{eur(marge * volume * ((l.dureeMois ?? 12) / 12))}<span className="text-[10px] text-km-faint"> / {l.dureeMois ?? '?'} m</span></span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PrixPresentes({ l, gaz, postes, p0 }: { l: LigneOffrePdf; gaz: boolean; postes: string[]; p0?: number | null }) {
  const cellule = (v: number | 'inclus' | null | undefined) => (v === 'inclus' ? 'incl.' : fr(v as number | null))
  if (gaz) {
    return (
      <span className="flex flex-col leading-tight">
        <span className="font-mono text-[13px] font-bold">{cellule(l.unitaires.molecule)}</span>
        {p0 != null && <span className="font-mono text-[10.5px] text-km-faint">P0 {fr(p0)} + marge</span>}
      </span>
    )
  }
  return (
    <span className="grid gap-x-2" style={{ gridTemplateColumns: `repeat(${postes.length}, minmax(0,1fr))` }}>
      {postes.map((p) => (
        <span key={p} className="flex flex-col leading-tight">
          <span className="text-[9px] font-bold uppercase tracking-[.05em] text-km-faint">{LIBELLE_POSTE[p]}</span>
          <span className="font-mono text-[12px] font-bold">{cellule(l.unitaires.postes?.[p])}</span>
        </span>
      ))}
    </span>
  )
}

/** La marge au clavier : affichée au centime (« 3,00 »), saisie librement, virgule ou point. */
function ChampMarge({ valeur, modifiee, libelle, onChange }: { valeur: number; modifiee: boolean; libelle: string; onChange: (v: number) => void }) {
  const [saisie, setSaisie] = useState<string | null>(null)
  return (
    <input
      type="text"
      inputMode="decimal"
      value={saisie ?? fr(valeur)}
      onFocus={(e) => { setSaisie(fr(valeur)); e.target.select() }}
      onChange={(e) => {
        setSaisie(e.target.value)
        const v = Number(e.target.value.replace(/\s/g, '').replace(',', '.'))
        if (e.target.value.trim() && Number.isFinite(v)) onChange(v)
      }}
      onBlur={() => setSaisie(null)}
      aria-label={libelle}
      className={cn('h-6 w-[58px] rounded-km-sm border bg-white text-center font-mono text-[12.5px] font-bold outline-none focus:border-km-green', modifiee ? 'border-km-amber text-km-amber' : 'border-km-line text-km-text')}
    />
  )
}
