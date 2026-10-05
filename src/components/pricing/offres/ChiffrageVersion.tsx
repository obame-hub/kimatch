import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Ban, Check, ChevronDown, ChevronsUpDown, FileText, Loader2, MoreHorizontal, Paperclip, Plus, RotateCcw, Send, Sparkles, Trash2, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { INCLUSIONS_ELEC, INCLUSIONS_GAZ, LIBELLE_INCLUSION, lireNombre, postesDuCompteur, ttcDuBudget, type ComposanteIncluse } from '@/lib/pricing/budget'
import { useFournisseursChoix } from '@/lib/data/contratsProspects'
import { useDocumentsParEntites, useFichiersDuCompteur, useTeleverserDocuments } from '@/lib/data/documents'
import { FenetreApercu } from '@/components/document/FenetreApercu'
import { CategorieDocument } from '@/components/document/CategorieDocument'
import type { DocumentItem } from '@/types/domain'
import { estLisible, useLectures, type Lectures } from '@/lib/data/lectureOffre'
import { VoletLectures } from '@/components/pricing/offres/LecturesPropositions'
import { BoutonTradeo } from '@/components/pricing/offres/BoutonTradeo'
import { BudgetCliquable } from '@/components/pricing/offres/DetailCalcul'
import { ttcParDefaut } from '@/lib/offrePdf/construction'
import { logoFournisseurNet } from '@/lib/logosFournisseurs'
import {
  SAISIE_VIDE, budgetLigne, saisieComplete, useChiffrage, useChiffrageMutations,
  type Chiffrage, type CompteurChiffrage, type OffreChiffrage, type SaisieLigne,
} from '@/lib/data/chiffrage'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE TABLEAU À COMPLÉTER — le volet droit de « Pricer »
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Maquette validée par William le 01/10/2026, puis reprise le même jour sur ses retours :
 *   · l'en-tête tient sur UNE ligne, et le dépôt des propositions s'y range en un bouton — « la zone
 *     de dépôt n'a aucun intérêt à être aussi grosse » ; on peut aussi lâcher les fichiers n'importe
 *     où sur le tableau ;
 *   · le COMPTEUR se lit sur une ligne en tête : en électricité le libellé, le PDL, le segment, la
 *     FTA et la consommation par poste ; au gaz le libellé, le PCE, le tarif, le profil et la CAR.
 *     Plus aucun « commun » à saisir (« je vais te proposer plus tard un fonctionnement plus solide
 *     et sans aucune saisie ») ;
 *   · la page ne défile pas : seul le tableau défile, son en-tête reste en place ;
 *   · plus d'onglets : en multisite, la ligne du compteur DEVIENT LE SÉLECTEUR (une flèche le dit,
 *     la liste défile, ↑ ↓ passent d'un compteur à l'autre), chaque compteur y montre son avancement ;
 *     l'avancement GLOBAL du tableau se lit dans l'en-tête ;
 *   · le TABLEAU suit la direction C du canevas « Tableau du Pricer » : un en-tête anthracite qui
 *     nomme les zones, la référence dans sa carte, une carte par fournisseur (détail plus bas).
 *
 * ══ UNE CASE S'ENREGISTRE EN LA QUITTANT ══
 * Pas de bouton « Enregistrer » : on tape, on tabule, la ligne part en base dès qu'on quitte une case
 * modifiée. Le budget se recalcule à chaque frappe, avant même l'écriture, et chaque prix saisi y
 * compte (`pricing/budget.ts`).
 *
 * ══ UNE CASE N'ACCEPTE QU'UN PRIX ══
 * Des chiffres et une virgule, deux décimales au plus : une lettre ne s'écrit pas, un point devient
 * une virgule, une troisième décimale est refusée. En quittant la case, le prix se range à deux
 * décimales (« 42 » devient « 42,00 »). Tous les montants s'affichent au centime.
 */

const fr2 = (v: number | null | undefined) => (v == null ? '' : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const fr2max = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('fr-FR', { maximumFractionDigits: 2 }))
const eur = (v: number | null | undefined) => (v == null ? '—' : `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`)

/**
 * Ce qu'une case garde de la frappe : des chiffres, une virgule (le point en devient une), deux
 * décimales et neuf chiffres avant la virgule au plus.
 */
function nettoyerPrix(brut: string): string {
  const t = brut.replace(/\./g, ',').replace(/[^\d,]/g, '')
  const i = t.indexOf(',')
  if (i < 0) return t.slice(0, 9)
  return `${t.slice(0, i).slice(0, 9)},${t.slice(i + 1).replace(/,/g, '').slice(0, 2)}`
}
const estIndexe = (type: string | null) => /^index/i.test(type ?? '')

/**
 * Le rangement des propositions déposées en vrac : sur la VERSION, en annexe. Corrigé le 02/10/2026 :
 * un type propre (`propositions_version`) avait été inventé, que la contrainte `documents_entite_type_check`
 * refusait — chaque dépôt échouait. On reprend le type que la base connaît déjà.
 */
const ENTITE_PROPOSITIONS = 'version_recommandation'
/** « Offre fournisseur » depuis le 02/10/2026 (elles étaient rangées en « Annexe », catégorie retirée). */
const CATEGORIE_PROPOSITIONS = 'OFFRE_FOURNISSEUR'

type Brouillon = Record<string, string>

function versBrouillon(s: SaisieLigne | undefined, postes: string[]): Brouillon {
  const x = s ?? SAISIE_VIDE
  const b: Brouillon = { abonnementMois: fr2(x.abonnementMois), marge: fr2(x.marge), p0: fr2(x.p0), cee: fr2(x.cee), cpb: fr2(x.cpb), capacite: fr2(x.capacite) }
  for (const p of postes) b[`p0_${p}`] = fr2(x.p0Postes[p])
  /* Ce que le P0 inclut, rangé dans le brouillon comme le reste : « TQD,CEE ». */
  b.inclus = (x.inclus ?? []).join(',')
  return b
}

/**
 * ══ UNE CASE QU'ON N'A PAS TOUCHÉE GARDE SON NOMBRE ══
 * 02/10/2026 : un abonnement de 4 487,96 €/an s'affiche 374,00 €/mois ; relu depuis la case, il
 * devenait 4 488,00 €/an dès qu'on modifiait une AUTRE case de la ligne. Une case dont le texte n'a
 * pas bougé rend donc le nombre d'origine, au centime de l'annuel près.
 */
function depuisBrouillon(b: Brouillon, postes: string[], origine?: SaisieLigne, initial?: Brouillon): SaisieLigne {
  const lire = (cle: string, avant: number | null | undefined) => (origine && initial && b[cle] === initial[cle] ? avant ?? null : lireNombre(b[cle]))
  const p0Postes: Record<string, number | null> = {}
  for (const p of postes) p0Postes[p] = lire(`p0_${p}`, origine?.p0Postes[p])
  return {
    abonnementMois: lire('abonnementMois', origine?.abonnementMois), marge: lire('marge', origine?.marge), p0: lire('p0', origine?.p0),
    cee: lire('cee', origine?.cee), cpb: lire('cpb', origine?.cpb), capacite: lire('capacite', origine?.capacite), p0Postes,
    inclus: b.inclus ? b.inclus.split(',').filter(Boolean) : [],
  }
}

const SOURCES: Record<string, [string, string]> = {
  TRADEO: ['TRADÉO', 'border-km-violet/30 bg-km-violet/10 text-km-violet'],
  PLATEFORME: ['PLATEFORME', 'border-km-blue/30 bg-km-blue-soft text-km-blue'],
  GRILLE: ['GRILLE', 'border-km-amber/40 bg-km-amber-soft text-km-amber'],
  MAIL: ['MAIL', 'border-km-line bg-white text-km-muted'],
}

const LIBELLE_POSTE: Record<string, string> = { POINTE: 'Pointe', HPH: 'HPH', HCH: 'HCH', HPE: 'HPE', HCE: 'HCE', HP: 'HP', HC: 'HC', BASE: 'Base' }
const LIBELLE_CASE: Record<string, string> = { abonnementMois: 'Abonnement', p0: 'Molécule P0', marge: 'Marge', cee: 'CEE', capacite: 'Capacité' }
const libelleCase = (cle: string) => LIBELLE_CASE[cle] ?? `Prix ${LIBELLE_POSTE[cle.replace('p0_', '')] ?? cle}`

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LE CADRE, L'EN-TÊTE ET LE DÉPÔT
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * LE DÉPÔT EN VRAC — William, 01/10/2026 : « le dépôt d'offres PDF ou Excel doit permettre au pricing
 * de mettre des fichiers pêle-mêle, ce sera à l'IA ensuite d'identifier à quelles lignes ça
 * correspond ». Les fichiers se rangent sur la version ; les PDF et les images partent aussi à la
 * lecture (`LecturesPropositions`), et un fichier déjà rangé se relit d'un clic.
 */
function useDepot(versionId: string, onToast: (m: string) => void, lectures: Lectures) {
  const { data: documents } = useDocumentsParEntites([versionId])
  const televerser = useTeleverserDocuments()
  const deposes = (documents ?? []).filter((d) => d.entite_type === ENTITE_PROPOSITIONS && d.type_document_code === CATEGORIE_PROPOSITIONS)
  const envoyer = (liste: FileList | File[] | null) => {
    const fichiers = Array.from(liste ?? [])
    if (!fichiers.length) return
    for (const f of fichiers) if (estLisible(f.name, f.type)) lectures.lireFichier(f)
    void televerser
      .mutateAsync({ fichiers, entite_type: ENTITE_PROPOSITIONS, entite_id: versionId, type_document_id: null, type_document_libelle: 'Offre fournisseur', categorie: CATEGORIE_PROPOSITIONS })
      .then(() => onToast(`✓ ${fichiers.length} fichier${fichiers.length > 1 ? 's' : ''} déposé${fichiers.length > 1 ? 's' : ''}`))
      .catch((e: Error) => onToast(`Erreur : ${e.message}`))
  }
  const relire = (d: { url: string; nom_fichier?: string | null; nom?: string | null }) => lectures.lireDeposee(d.url, d.nom_fichier || d.nom || 'proposition.pdf')
  return { deposes, envoyer, relire, enCours: televerser.isPending }
}
type Depot = ReturnType<typeof useDepot>

export function ChiffrageVersion({ versionId, onToast }: { versionId: string; onToast: (m: string) => void }) {
  const { data: chiffrage, isLoading, error } = useChiffrage(versionId)
  const lectures = useLectures()
  const depot = useDepot(versionId, onToast, lectures)
  const [vcId, setVcId] = useState<string | null>(null)
  const [survol, setSurvol] = useState(false)
  /* HTVA ou TTC : un seul choix pour tout le tableau, gardé d'un compteur à l'autre. PAR DÉFAUT,
     CELUI DU COMPTE — William, 05/10/2026 : « la même logique HTVA et TTC en fonction du type de
     compte que pour la génération de l'offre » : TTC pour un syndic, HTVA pour une entreprise. */
  const [ttcChoisi, setTtc] = useState<boolean | null>(null)
  const ttc = ttcChoisi ?? ttcParDefaut(chiffrage?.version.compteSegment)
  useEffect(() => { setVcId(null); setTtc(null) }, [versionId])

  if (isLoading) return <Cadre><p className="p-6 text-km-body text-km-faint">Chargement de la version…</p></Cadre>
  if (error || !chiffrage) return <Cadre><p className="p-6 text-km-body text-km-red">Impossible de charger la version : {String((error as Error)?.message ?? 'introuvable')}</p></Cadre>

  const compteur = chiffrage.compteurs.find((c) => c.vcId === vcId) ?? chiffrage.compteurs[0]
  const avecFichiers = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files')
  return (
    <Cadre
      onDragOver={(e) => { if (avecFichiers(e)) { e.preventDefault(); setSurvol(true) } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSurvol(false) }}
      onDrop={(e) => { if (avecFichiers(e)) { e.preventDefault(); setSurvol(false); depot.envoyer(e.dataTransfer.files) } }}
    >
      <EnTete chiffrage={chiffrage} depot={depot} tradeo={<BoutonTradeo chiffrage={chiffrage} lectures={lectures} onToast={onToast} />} />
      {compteur
        ? <Offres key={compteur.vcId} chiffrage={chiffrage} compteur={compteur} choisirCompteur={setVcId} ttc={ttc} setTtc={setTtc} versionId={versionId} onToast={onToast} />
        : <p className="p-6 text-km-body text-km-faint">Aucun compteur dans le périmètre de cette version.</p>}
      <VoletLectures lectures={lectures} chiffrage={chiffrage} versionId={versionId} choisirCompteur={setVcId} onToast={onToast} />
      {survol && (
        <div className="pointer-events-none absolute inset-2 z-40 flex flex-col items-center justify-center gap-2 rounded-[11px] border-2 border-dashed border-km-green bg-km-green-soft/90">
          <Upload className="h-6 w-6 text-km-green" />
          <span className="text-[14px] font-bold text-km-green">Lâchez les propositions ici</span>
          <span className="text-[12px] text-km-muted">PDF ou Excel, autant que vous voulez</span>
        </div>
      )}
    </Cadre>
  )
}

function Cadre({ children, ...glisser }: { children: React.ReactNode } & Pick<React.HTMLAttributes<HTMLElement>, 'onDragOver' | 'onDragLeave' | 'onDrop'>) {
  return <section aria-label="Le tableau à compléter" {...glisser} className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[13px] border border-km-line bg-white">{children}</section>
}

/** L'en-tête, sur une seule ligne : ce qui ne tient pas se coupe, le nom du dossier en premier. */
function EnTete({ chiffrage, depot, tradeo }: { chiffrage: Chiffrage; depot: Depot; tradeo?: React.ReactNode }) {
  const v = chiffrage.version
  const jours = v.dateSouhaitee ? Math.round((Date.parse(v.dateSouhaitee) - Date.parse(new Date().toISOString().slice(0, 10))) / 86400000) : null
  const quand = jours == null ? '' : jours === 0 ? 'aujourd’hui' : jours < 0 ? `retard ${-jours} j` : jours === 1 ? 'demain' : `dans ${jours} j`
  const retard = jours != null && jours < 0
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-km-line bg-gradient-to-b from-km-soft to-white px-3.5 py-2">
      <span className="shrink-0 rounded-full bg-km-amber-soft px-2 py-0.5 text-[11px] font-extrabold leading-[15px] text-[#8a4b2a]">V{v.numero ?? ''}</span>
      <span className="min-w-0 truncate text-[13px] font-extrabold">{v.recommandationNom}</span>
      {v.reference && <span className="hidden shrink-0 font-mono text-[11px] text-km-faint xl:inline">{v.reference}</span>}
      <span className={cn('shrink-0 rounded-full border px-2 py-px text-[11px] font-bold', v.publieeLe ? 'border-km-green-line bg-km-green-soft text-km-green' : 'border-km-line bg-km-soft text-km-muted')}>
        {v.publieeLe ? 'Publiée' : 'En construction'}
      </span>
      <span className="flex-1" />
      <AvancementGlobal chiffrage={chiffrage} />
      <span className="h-4 w-px shrink-0 bg-km-line" aria-hidden="true" />
      {tradeo}
      <BoutonDepot depot={depot} />
      {v.dateSouhaitee && (
        <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold', retard ? 'border-km-red-line bg-km-red-soft text-km-red' : 'border-km-amber/40 bg-km-amber-soft text-[#8a4b2a]')}>
          <span className="font-mono text-[12px] text-km-text">{new Date(v.dateSouhaitee + 'T12:00:00').toLocaleDateString('fr-FR')}</span>{quand}
        </span>
      )}
      <Link
        to={`/recommandations/${v.recommandationId}`}
        title="Ouvrir la recommandation"
        aria-label="Ouvrir la recommandation"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-km-sm text-km-muted hover:bg-km-soft hover:text-km-green"
      >
        <ArrowUpRight className="h-4 w-4" />
      </Link>
    </div>
  )
}

/** Le dépôt, réduit à un bouton : un clic choisit des fichiers, le compteur montre ce qui est déjà là. */
function BoutonDepot({ depot }: { depot: Depot }) {
  const entree = useRef<HTMLInputElement>(null)
  const ref = useRef<HTMLSpanElement>(null)
  const [ouvert, setOuvert] = useState(false)
  useEffect(() => {
    if (!ouvert) return
    const fermer = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOuvert(false) }
    document.addEventListener('mousedown', fermer)
    return () => document.removeEventListener('mousedown', fermer)
  }, [ouvert])
  const n = depot.deposes.length
  const [apercu, setApercu] = useState<DocumentItem | null>(null)
  return (
    <span ref={ref} className="relative flex shrink-0">
      {apercu && <FenetreApercu document={{ id: apercu.id, nom: apercu.nom, nom_fichier: apercu.nom_fichier, url: apercu.url }} onFermer={() => setApercu(null)} />}
      <button
        type="button"
        onClick={() => entree.current?.click()}
        title="Déposer les propositions reçues (PDF, Excel) — ou glissez-les sur le tableau"
        className={cn('inline-flex h-7 items-center gap-1.5 border border-km-line bg-white pl-2.5 pr-2 text-[11.5px] font-semibold text-km-text hover:bg-km-soft', n ? 'rounded-l-km-sm' : 'rounded-km-sm')}
      >
        {depot.enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin text-km-green" /> : <Upload className="h-3.5 w-3.5 text-km-green" />}
        Propositions
      </button>
      {n > 0 && (
        <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} title="Voir les fichiers déposés" className="-ml-px inline-flex h-7 items-center rounded-r-km-sm border border-km-line bg-white px-2 font-mono text-[11px] font-bold text-km-green hover:bg-km-soft">
          {n}
        </button>
      )}
      <input ref={entree} type="file" multiple accept=".pdf,.xls,.xlsx,.csv,application/pdf" className="hidden" onChange={(e) => { depot.envoyer(e.target.files); e.target.value = '' }} />
      {ouvert && (
        <span className="absolute right-0 top-[calc(100%+4px)] z-30 flex w-[360px] flex-col gap-0.5 rounded-km-md border border-km-line bg-white p-1.5 shadow-km-pop">
          <span className="px-2 pb-1 pt-1 text-[9.5px] font-extrabold uppercase tracking-[.08em] text-km-faint">Propositions déposées · {n}</span>
          {depot.deposes.map((d) => (
            /* L'aperçu s'ouvre en fenêtre, par-dessus le Pricer (la même visionneuse partout). */
            <span key={d.id} className="flex items-center gap-0.5 rounded-km-sm hover:bg-km-soft">
              <button type="button" onClick={() => { setApercu(d); setOuvert(false) }} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[12px] text-km-text">
                <FileText className="h-3.5 w-3.5 shrink-0 text-km-red" /><span className="truncate">{d.nom_fichier || d.nom}</span>
              </button>
              <CategorieDocument documentId={d.id} code={d.type_document_code} libelle={d.type_document} />
              {estLisible(d.nom_fichier || d.nom || '') && (
                <button type="button" onClick={() => { depot.relire(d); setOuvert(false) }} title="Lire cette proposition et remplir sa ligne" aria-label={`Lire ${d.nom_fichier || d.nom}`} className="flex h-7 shrink-0 items-center gap-1 rounded-km-sm px-2 text-[11px] font-bold text-km-violet hover:bg-km-violet/10">
                  <Sparkles className="h-3.5 w-3.5" /> Lire
                </button>
              )}
            </span>
          ))}
          <span className="px-2 pb-1 pt-1 text-[10.5px] text-km-faint">Un PDF déposé se lit tout seul ; « Lire » relit un fichier déjà rangé.</span>
        </span>
      )}
    </span>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LE COMPTEUR, SUR UNE LIGNE — ce qu'il faut avoir sous les yeux pour chiffrer
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Un renseignement du bandeau : son nom en petit, sa valeur en gras. */
function Info({ nom, children }: { nom: string; children: React.ReactNode }) {
  return (
    <span className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-[10px] font-bold uppercase tracking-[.07em] text-km-faint">{nom}</span>
      <span className="text-[12.5px] font-bold text-km-text">{children}</span>
    </span>
  )
}

const Separateur = () => <span aria-hidden="true" className="h-4 w-px shrink-0 bg-km-line" />

/** Les renseignements d'un compteur, sur une ligne — dans le bandeau comme dans le sélecteur. */
function LigneCompteur({ compteur }: { compteur: CompteurChiffrage }) {
  const gaz = compteur.energie === 'gaz'
  const postes = gaz ? [] : postesDuCompteur(compteur.conso)
  const total = Object.values(compteur.conso).reduce((t, x) => t + x, 0)
  const libelle = compteur.libelle || compteur.site
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
      <span className={cn('shrink-0 rounded-full px-2 text-[10px] font-extrabold leading-[18px]', gaz ? 'bg-km-gaz-soft text-km-gaz' : 'bg-km-elec-soft text-km-elec')}>{gaz ? 'Gaz' : 'Élec'}</span>
      {libelle && <span className="min-w-[90px] max-w-[220px] truncate text-[13px] font-extrabold text-km-text" title={libelle}>{libelle}</span>}
      <span className="shrink-0 font-mono text-[12.5px] font-bold text-km-muted" title={gaz ? 'PCE' : 'PDL'}>{compteur.numero}</span>
      <Separateur />
      {gaz ? (
        <>
          <Info nom="Tarif">{compteur.tarif ?? '—'}</Info>
          <Info nom="Profil">{compteur.profil ?? '—'}</Info>
          <Separateur />
          <Info nom="CAR"><span className="font-mono">{fr2max(compteur.car)}</span> <span className="font-semibold text-km-muted">MWh</span></Info>
        </>
      ) : (
        <>
          <Info nom="Segment">{compteur.segment ?? '—'}</Info>
          <Info nom="FTA"><span className="font-mono">{compteur.tarif ?? '—'}</span></Info>
          <Separateur />
          {postes.map((p) => (
            <Info key={p} nom={LIBELLE_POSTE[p] ?? p}><span className="font-mono">{fr2max(compteur.conso[p] ?? 0)}</span></Info>
          ))}
          <Separateur />
          <Info nom="Total"><span className="font-mono">{fr2max(total)}</span> <span className="font-semibold text-km-muted">MWh</span></Info>
        </>
      )}
      <Separateur />
      <DebutFourniture compteur={compteur} />
      <PastilleReglementaire compteur={compteur} />
    </span>
  )
}

/**
 * LE TURPE, SANS COLONNE — William, 02/10/2026 : « le TURPE est le même pour chaque ligne du
 * comparatif, raison pour laquelle on ne le montre pas, mais il doit être noté en base ». Une
 * pastille dit seulement qu'il est compté dans les budgets (le détail au survol), ou ce qui manque
 * pour le calculer.
 */
function PastilleReglementaire({ compteur }: { compteur: CompteurChiffrage }) {
  const r = compteur.reglementaire
  if (!r) return null
  const gaz = compteur.energie === 'gaz'
  const parts = gaz
    ? [r.tqd != null ? `TQD ${fr2(r.tqd)} €/MWh` : null, r.accise != null ? `AG ${fr2(r.accise)} €/MWh` : null, r.cta != null ? `CTA ${fr2(r.cta)} €/an` : null,
      Object.keys(r.cpb).length ? `CPB ${Object.entries(r.cpb).map(([d, v]) => `${d} mois : ${v.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}`).join(', ')} €/MWh` : null]
    : [r.turpe?.total != null ? `TURPE ${fr2(r.turpe.total)} €/an (${r.turpe.formule})` : null, r.accise != null ? `AE ${fr2(r.accise)} €/MWh` : null,
      r.cta != null ? `CTA ${fr2(r.cta)} €/an (${fr2(r.ctaTaux)} % de la part fixe du TURPE)` : null]
  const connues = r.derniereValeurConnue.length ? ` · dernière valeur connue pour ${r.derniereValeurConnue.join(', ')}` : ''
  const envoi = r.dateEnvoi ? ` · valeurs ${r.envoiFige ? 'figées à l’envoi du' : 'du jour, le'} ${new Date(r.dateEnvoi + 'T12:00:00').toLocaleDateString('fr-FR')}` : ''
  const aide = `Compté dans chaque budget : ${parts.filter(Boolean).join(' · ')}${envoi}${connues}`
  if (!r.manques.length) {
    return <span title={aide} className="shrink-0 rounded-full border border-km-green-line bg-km-green-soft px-2 text-[10px] font-extrabold leading-[18px] text-km-green">{gaz ? 'Taxes incluses' : 'TURPE et taxes inclus'}</span>
  }
  return (
    <span title={`Manque : ${r.manques.join(' · ')}${parts.some(Boolean) ? ` — déjà compté : ${parts.filter(Boolean).join(' · ')}` : ''}`} className="shrink-0 rounded-full border border-km-amber-line bg-km-amber-soft px-2 text-[10px] font-extrabold leading-[18px] text-km-amber">
      Taxes incomplètes
    </span>
  )
}

/**
 * LE DÉBUT DE FOURNITURE, au gaz : c'est de lui que part le CPB (années civiles couvertes par l'offre).
 * Les autres taxes, elles, se lisent au jour de l'envoi — dit au survol de la pastille.
 */
function DebutFourniture({ compteur }: { compteur: CompteurChiffrage }) {
  const r = compteur.reglementaire
  if (compteur.energie !== 'gaz' || !r?.dateReference) return null
  const d = new Date(r.dateReference + 'T12:00:00').toLocaleDateString('fr-FR')
  const source = r.sourceDate === 'ECHEANCE' ? 'lendemain de l’échéance du compteur' : r.sourceDate === 'DEBUT_FOURNITURE' ? 'début de fourniture de la version' : 'échéance inconnue : 1er du mois prochain'
  return (
    <span title={`Début de fourniture, d’où part le CPB : ${source}`}>
      <Info nom="Fourniture">{<span className={cn('font-mono', r.sourceDate === 'MOIS_PROCHAIN' && 'text-km-amber')}>{d}</span>}</Info>
    </span>
  )
}

/**
 * L'AVANCEMENT D'UN COMPTEUR — ses lignes complètes : la référence et chaque offre à chiffrer
 * (hors indexées, qui ne vont pas au comparatif, et hors indisponibles, qui n'ont rien à saisir).
 */
function avancementCompteur(chiffrage: Chiffrage, c: CompteurChiffrage): [number, number] {
  const offres = chiffrage.offres.filter((o) => !estIndexe(o.type) && o.statut !== 'INDISPONIBLE')
  const faites = offres.filter((o) => saisieComplete(c, o.saisies[c.vcId])).length + (chiffrage.actuelle && saisieComplete(c, chiffrage.actuelle.saisies[c.vcId]) ? 1 : 0)
  return [faites, offres.length + 1]
}

function MiniAvancement({ fait, total }: { fait: number; total: number }) {
  const fini = total > 0 && fait >= total
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span className="h-1.5 w-8 overflow-hidden rounded-full bg-km-line" aria-hidden="true">
        <span className={cn('block h-full rounded-full', fini ? 'bg-km-green' : 'bg-km-amber')} style={{ width: `${total ? Math.round((fait / total) * 100) : 0}%` }} />
      </span>
      <span className="whitespace-nowrap font-mono text-[11px] text-km-muted"><b className={fini ? 'text-km-green' : 'text-km-text'}>{fait}</b>/{total}</span>
      {fini && <Check className="h-3 w-3 text-km-green" strokeWidth={3} aria-hidden="true" />}
    </span>
  )
}

/**
 * L'AVANCEMENT GLOBAL DU TABLEAU — William, 01/10/2026 : « pour savoir ce qui a été fait ou non ».
 * Une barre en quatre états, dans l'ordre où une offre avance : prête, indisponible, à confirmer, à
 * chiffrer ; et le compte des offres traitées.
 */
function AvancementGlobal({ chiffrage }: { chiffrage: Chiffrage }) {
  const offres = chiffrage.offres.filter((o) => !estIndexe(o.type))
  /* Plus d'état « à confirmer » (05/10/2026) : une offre chiffrée est validée d'elle-même. */
  const pretes = offres.filter((o) => o.statut === 'DISPONIBLE').length
  const indispo = offres.filter((o) => o.statut === 'INDISPONIBLE').length
  const total = offres.length
  const segments: [number, string, string][] = [
    [pretes, 'bg-km-green', `${pretes} chiffrée${pretes > 1 ? 's' : ''}`],
    [indispo, 'bg-km-red/45', `${indispo} indisponible${indispo > 1 ? 's' : ''}`],
    [total - pretes - indispo, 'bg-km-line', `${total - pretes - indispo} à chiffrer`],
  ]
  return (
    <span className="flex shrink-0 items-center gap-2" title={segments.map((x) => x[2]).join(' · ')}>
      <span className="hidden text-[10px] font-bold uppercase tracking-[.07em] text-km-faint lg:inline">Avancement</span>
      <span className="flex h-2 w-24 overflow-hidden rounded-full bg-km-line" aria-hidden="true">
        {total > 0 && segments.map(([n, classe], i) => n > 0 && <span key={i} className={classe} style={{ width: `${(n / total) * 100}%` }} />)}
      </span>
      <span className="whitespace-nowrap text-[12px] text-km-muted"><b className="font-mono font-bold text-km-text">{pretes + indispo}</b>/{total} traitées</span>
    </span>
  )
}

/**
 * LA LIGNE DU COMPTEUR — William, 01/10/2026 : « affiche sur une ligne les infos principales »,
 * puis « transforme-la en sélecteur dans le cas d'un multisite, avec une flèche indiquant que c'est
 * sélectionnable et défilable ». En monosite, elle ne fait que se lire.
 */
function BandeauCompteur({ chiffrage, compteur, onChoisir }: { chiffrage: Chiffrage; compteur: CompteurChiffrage; onChoisir: (vcId: string) => void }) {
  const multisite = chiffrage.compteurs.length > 1
  const [ouvert, setOuvert] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ouvert) return
    const fermer = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOuvert(false) }
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false) }
    document.addEventListener('mousedown', fermer)
    document.addEventListener('keydown', echap)
    return () => { document.removeEventListener('mousedown', fermer); document.removeEventListener('keydown', echap) }
  }, [ouvert])
  const i = chiffrage.compteurs.findIndex((c) => c.vcId === compteur.vcId)
  const aller = (pas: number) => {
    const n = chiffrage.compteurs.length
    onChoisir(chiffrage.compteurs[(i + pas + n) % n].vcId)
  }
  const [fait, total] = avancementCompteur(chiffrage, compteur)
  /* Les fichiers du compteur, dépliés sous la ligne — gardé d'un compteur à l'autre. */
  const [fichiers, setFichiers] = useState(false)
  return (
    <div ref={ref} className="relative shrink-0">
      <div className="flex items-center rounded-km-md border border-km-line bg-km-soft/50 p-1">
        {multisite ? (
          <button
            type="button"
            onClick={() => setOuvert((o) => !o)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); aller(1) }
              if (e.key === 'ArrowUp') { e.preventDefault(); aller(-1) }
            }}
            aria-haspopup="listbox"
            aria-expanded={ouvert}
            title="Changer de compteur (↑ ↓ pour passer au suivant)"
            className={cn('flex min-w-0 flex-1 items-center gap-2.5 rounded-km-sm px-2 py-1 text-left transition-colors hover:bg-white', ouvert && 'bg-white shadow-[0_0_0_1px_rgb(var(--km-line))]')}
          >
            <span className="shrink-0 rounded-km-sm bg-km-text px-1.5 font-mono text-[11px] font-bold leading-[18px] text-white">{i + 1}/{chiffrage.compteurs.length}</span>
            <LigneCompteur compteur={compteur} />
            <MiniAvancement fait={fait} total={total} />
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-km-muted" aria-hidden="true" />
          </button>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-3 px-2.5 py-1"><LigneCompteur compteur={compteur} /></span>
        )}
        <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-km-line" />
        <BoutonFichiersCompteur compteur={compteur} ouvert={fichiers} onBasculer={() => setFichiers((f) => !f)} />
        {/* VERS LE COMPTEUR, dans un nouvel onglet : le Pricer reste ouvert là où on en était. */}
        <Link
          to={`/compteurs/${compteur.compteurId}`}
          target="_blank"
          rel="noopener"
          title="Ouvrir la fiche du compteur (nouvel onglet)"
          aria-label="Ouvrir la fiche du compteur"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-km-sm text-km-muted hover:bg-white hover:text-km-green"
        >
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
      {fichiers && <FichiersCompteur compteur={compteur} />}

      {ouvert && (
        <ul role="listbox" aria-label="Compteurs de la version" className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-[320px] overflow-y-auto rounded-km-md border border-km-line bg-white p-1 shadow-km-pop">
          {chiffrage.compteurs.map((c, k) => {
            const [f, t] = avancementCompteur(chiffrage, c)
            const actif = c.vcId === compteur.vcId
            return (
              <li key={c.vcId} role="option" aria-selected={actif}>
                <button
                  type="button"
                  onClick={() => { onChoisir(c.vcId); setOuvert(false) }}
                  className={cn('flex w-full items-center gap-3 rounded-km-sm px-2 py-1.5 text-left', actif ? 'bg-km-green-tint' : 'hover:bg-km-soft')}
                >
                  <span className={cn('w-8 shrink-0 text-center font-mono text-[11px] font-bold', actif ? 'text-km-green' : 'text-km-faint')}>{k + 1}</span>
                  <LigneCompteur compteur={c} />
                  <MiniAvancement fait={f} total={t} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * LES FICHIERS DU COMPTEUR, AU DÉPLIEMENT DE SA LIGNE — William, 02/10/2026 : « affiche les fichiers
 * liés au compteur (au dépliement de la ligne compteur) et affiche la visionneuse au clic en mode
 * popup […] uniquement les pièces jointes du compteur avec la catégorie "Facture" et/ou "Contrat" ».
 * Ceux du compteur et ceux de ses contrats ; deux filtres, les deux allumés d'abord.
 */
const CATEGORIES_PRICER = ['FACTURE', 'CONTRAT'] as const

function BoutonFichiersCompteur({ compteur, ouvert, onBasculer }: { compteur: CompteurChiffrage; ouvert: boolean; onBasculer: () => void }) {
  const { data } = useFichiersDuCompteur(compteur.compteurId)
  const n = (data ?? []).filter((d) => (CATEGORIES_PRICER as readonly string[]).includes(d.type_document_code ?? '')).length
  return (
    <button
      type="button"
      onClick={onBasculer}
      aria-expanded={ouvert}
      title={ouvert ? 'Replier les fichiers du compteur' : 'Voir les factures et contrats du compteur'}
      className={cn('inline-flex h-7 shrink-0 items-center gap-1.5 rounded-km-sm px-2 text-[11.5px] font-semibold transition-colors', ouvert ? 'bg-white text-km-text shadow-[0_0_0_1px_rgb(var(--km-line))]' : 'text-km-muted hover:bg-white hover:text-km-text')}
    >
      <Paperclip className="h-3.5 w-3.5" />
      Fichiers
      <span className={cn('rounded-full px-1.5 font-mono text-[10.5px] font-bold leading-[16px]', n ? 'bg-km-green-soft text-km-green' : 'bg-km-soft text-km-faint')}>{data ? n : '…'}</span>
      <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', ouvert && 'rotate-180')} />
    </button>
  )
}

function FichiersCompteur({ compteur }: { compteur: CompteurChiffrage }) {
  const { data, isLoading } = useFichiersDuCompteur(compteur.compteurId)
  const [filtres, setFiltres] = useState<string[]>([...CATEGORIES_PRICER])
  const [apercu, setApercu] = useState<DocumentItem | null>(null)
  const utiles = (data ?? []).filter((d) => (CATEGORIES_PRICER as readonly string[]).includes(d.type_document_code ?? ''))
  const visibles = utiles.filter((d) => filtres.includes(d.type_document_code ?? ''))
  const basculer = (c: string) => setFiltres((f) => (f.includes(c) ? (f.length > 1 ? f.filter((x) => x !== c) : f) : [...f, c]))
  return (
    <div className="mt-1.5 flex flex-col gap-1.5 rounded-km-md border border-km-line bg-white p-2">
      <span className="flex items-center gap-1.5 px-1">
        {CATEGORIES_PRICER.map((c) => {
          const nb = utiles.filter((d) => d.type_document_code === c).length
          const actif = filtres.includes(c)
          return (
            <button key={c} type="button" onClick={() => basculer(c)} aria-pressed={actif}
              className={cn('rounded-full border px-2.5 py-[3px] text-[11px] font-semibold transition-colors', actif ? 'border-km-text bg-km-text text-white' : 'border-km-line bg-white text-km-muted hover:text-km-text')}
            >
              {c === 'FACTURE' ? 'Factures' : 'Contrats'} <span className="font-mono opacity-70">{nb}</span>
            </button>
          )
        })}
        <span className="flex-1" />
        <Link to={`/compteurs/${compteur.compteurId}`} target="_blank" rel="noopener" className="text-[11px] font-semibold text-km-green hover:underline">Tous les fichiers du compteur →</Link>
      </span>
      {isLoading ? (
        <p className="px-1 py-2 text-[12px] text-km-faint">Chargement des fichiers…</p>
      ) : visibles.length === 0 ? (
        <p className="px-1 py-2 text-[12px] text-km-faint">{utiles.length ? 'Aucun fichier dans ce filtre.' : 'Aucune facture ni aucun contrat joint à ce compteur.'}</p>
      ) : (
        <ul className="flex max-h-[168px] flex-col overflow-y-auto">
          {visibles.map((d) => (
            <li key={d.id} className="flex items-center gap-2.5 rounded-km-sm px-1.5 py-1 hover:bg-km-soft">
              <button type="button" onClick={() => setApercu(d)} title="Ouvrir l’aperçu" className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <FileText className="h-3.5 w-3.5 shrink-0 text-km-red" />
                <span className="truncate text-[12px] font-semibold text-km-text">{d.nom_fichier || d.nom}</span>
              </button>
              <span className="shrink-0 text-[10.5px] text-km-faint">{d.entite_type === 'contrat' ? 'sur le contrat' : 'sur le compteur'}</span>
              <span className="shrink-0 font-mono text-[10.5px] text-km-faint">{new Date(d.date_creation).toLocaleDateString('fr-FR')}</span>
              <CategorieDocument documentId={d.id} code={d.type_document_code} libelle={d.type_document} />
            </li>
          ))}
        </ul>
      )}
      {apercu && <FenetreApercu document={{ id: apercu.id, nom: apercu.nom, nom_fichier: apercu.nom_fichier, url: apercu.url }} onFermer={() => setApercu(null)} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LE TABLEAU DES OFFRES — direction C du canevas « Tableau du Pricer »
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// William, 01/10/2026 : « je préfère ton design 3 ». Un en-tête anthracite — l'anthracite du rail de
// Kimatch — qui nomme les ZONES, numérotées ; puis la référence, à part ; puis une carte par
// fournisseur, ses offres dedans.
//
//   Électricité  01 Abo. · 02 Énergie (Pointe, HPH, HCH, HPE, HCE) · 03 Compléments (Capa., CEE) ·
//                04 Marge · 05 Budget · 06 Écart
//   Gaz          01 Abo. · 02 Molécule & CEE (P0, CEE) · 03 Marge · 04 Budget · 05 Écart
//
// ══ ALLÉGÉ AU MAXIMUM ══
// « Allège au maximum pour aérer le contenu » : une zone d'une seule colonne ne se nomme qu'une fois ;
// les colonnes ne se nomment que dans les zones qui en ont plusieurs. Plus de consommations ni de
// sous-titres dans l'en-tête — le bandeau du compteur les porte.
//
// ══ UN BUDGET, HTVA OU TTC ══
// « Au lieu d'afficher HTVA et TTC, pouvoir changer de l'un à l'autre avec un sélecteur dans la
// colonne. » Les deux se calculent en base (`cout_total_annuel_estime_ttc`, colonne calculée) ;
// l'écran en montre un, l'écart et le meilleur prix suivent. Plus de pourcentage dans l'écart.
//
// ══ LE MEILLEUR PRIX, UNE ÉTOILE ══
// « Cartouche “Meilleur prix” c'est lourd, une étoile c'est plus léger. »

type IdZone = 'abo' | 'nrj' | 'cmp' | 'mrg' | 'bud' | 'ect'
interface Zone { id: IdZone; nom: string; cols: { cle: string; nom: string }[] }

function zonesDuCompteur(gaz: boolean, postes: string[]): Zone[] {
  const abo: Zone = { id: 'abo', nom: 'Abo.', cols: [{ cle: 'abonnementMois', nom: 'Abo.' }] }
  const fin: Zone[] = [
    { id: 'mrg', nom: 'Marge', cols: [{ cle: 'marge', nom: 'Marge' }] },
    { id: 'bud', nom: 'Budget', cols: [{ cle: 'budget', nom: 'Budget' }] },
    { id: 'ect', nom: 'Écart', cols: [{ cle: 'ecart', nom: 'Écart' }] },
  ]
  if (gaz) return [abo, { id: 'nrj', nom: 'Molécule & CEE', cols: [{ cle: 'p0', nom: 'P0' }, { cle: 'cee', nom: 'CEE' }] }, ...fin]
  return [
    abo,
    { id: 'nrj', nom: 'Énergie', cols: postes.map((p) => ({ cle: `p0_${p}`, nom: LIBELLE_POSTE[p] ?? p })) },
    { id: 'cmp', nom: 'Compléments', cols: [{ cle: 'capacite', nom: 'Capa.' }, { cle: 'cee', nom: 'CEE' }] },
    ...fin,
  ]
}

/** La largeur d'une colonne : [gabarit de grille, minimum en px]. */
const LARGEUR: Record<IdZone | 'offre' | 'etat', [string, number]> = {
  offre: ['minmax(180px,1fr)', 180],
  abo: ['minmax(70px,104px)', 70],
  nrj: ['minmax(62px,100px)', 62],
  cmp: ['minmax(62px,100px)', 62],
  mrg: ['minmax(70px,104px)', 70],
  bud: ['128px', 128],
  ect: ['118px', 118],
  etat: ['108px', 108],
}

interface Grille {
  zones: Zone[]
  gabarit: string
  min: number
  /** Le numéro (1 = la colonne des offres) de la première colonne de chaque zone. */
  debut: Record<string, number>
  saisies: string[]
  postes: string[]
  gaz: boolean
}

function grilleDuCompteur(compteur: CompteurChiffrage): Grille {
  const gaz = compteur.energie === 'gaz'
  const postes = gaz ? [] : postesDuCompteur(compteur.conso)
  const zones = zonesDuCompteur(gaz, postes)
  const pistes: string[] = [LARGEUR.offre[0]]
  let min = LARGEUR.offre[1] + LARGEUR.etat[1]
  const debut: Record<string, number> = {}
  for (const z of zones) {
    debut[z.id] = pistes.length + 1
    for (let i = 0; i < z.cols.length; i++) { pistes.push(LARGEUR[z.id][0]); min += LARGEUR[z.id][1] }
  }
  pistes.push(LARGEUR.etat[0])
  const saisies = zones.filter((z) => z.id !== 'bud' && z.id !== 'ect').flatMap((z) => z.cols.map((c) => c.cle))
  return { zones, gabarit: pistes.join(' '), min: min + 2, debut, saisies, postes, gaz }
}

const LOGOS = [['#E7F4EF', '#0D7A5F'], ['#EAF1F8', '#3F6E9C'], ['#F1ECF8', '#6B4CA0'], ['#FFF3D8', '#8A6508'], ['#FBE9E6', '#B85145']] as const

function Offres({ chiffrage, compteur, choisirCompteur, ttc, setTtc, versionId, onToast }: {
  chiffrage: Chiffrage
  compteur: CompteurChiffrage
  choisirCompteur: (vcId: string) => void
  ttc: boolean
  setTtc: (v: boolean) => void
  versionId: string
  onToast: (m: string) => void
}) {
  const m = useChiffrageMutations(versionId)
  const g = grilleDuCompteur(compteur)
  /* Un montant en base, dans le mode choisi : le TTC vient lui aussi de la base (20 % sur tout). */
  const valeurDe = (o: OffreChiffrage | null | undefined) => (o ? (ttc ? o.ttcParCompteur[compteur.vcId] : o.totalParCompteur[compteur.vcId]) ?? null : null)

  /* LE CLASSEMENT se lit sur ce qui est en base (seul un budget complet s'y écrit), hors indexées
     (qui ne vont pas au comparatif) et hors indisponibles. */
  const totalActuel = valeurDe(chiffrage.actuelle)
  const classees = chiffrage.offres
    .filter((o) => !estIndexe(o.type) && o.statut !== 'INDISPONIBLE' && o.totalParCompteur[compteur.vcId] != null)
    .sort((a, b) => (a.totalParCompteur[compteur.vcId] ?? 0) - (b.totalParCompteur[compteur.vcId] ?? 0))

  const publiables = chiffrage.offres.filter((o) => !estIndexe(o.type))
  const completePartout = (o: OffreChiffrage) => chiffrage.compteurs.every((c) => saisieComplete(c, o.saisies[c.vcId]))
  const aChiffrer = publiables.filter((o) => o.statut === 'EN_ATTENTE' && !completePartout(o)).length
  const sansComparatif = chiffrage.version.sansComparatif
  const actuelleOk = sansComparatif || (!!chiffrage.actuelle && chiffrage.compteurs.every((c) => saisieComplete(c, chiffrage.actuelle!.saisies[c.vcId])))
  const pret = aChiffrer === 0 && actuelleOk && publiables.some((o) => o.statut === 'DISPONIBLE')
  const publiee = !!chiffrage.version.publieeLe
  const meilleur = classees[0]
  const vMeilleur = valeurDe(meilleur)

  /* Les offres, regroupées par fournisseur dans l'ordre où elles arrivent. */
  const groupes: { nom: string; offres: OffreChiffrage[] }[] = []
  for (const o of chiffrage.offres) {
    const dernier = groupes[groupes.length - 1]
    if (dernier && dernier.nom === o.fournisseurNom) dernier.offres.push(o)
    else groupes.push({ nom: o.fournisseurNom, offres: [o] })
  }

  const ligne = { g, compteur, totalActuel, ttc }
  return (
    <>
      {/* LA PAGE NE DÉFILE PAS : le bandeau reste en place, seul le tableau défile — dans les deux
          sens, son en-tête collé en haut. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-3.5 pt-3">
        <BandeauCompteur chiffrage={chiffrage} compteur={compteur} onChoisir={choisirCompteur} />

        <div className="-mx-3.5 min-h-0 flex-1 overflow-auto border-t border-km-line-soft bg-[#F4F6F3] px-3.5 pb-3.5">
          <div className="flex flex-col gap-2" style={{ minWidth: g.min }}>
            <div className="sticky top-0 z-10 -mx-3.5 bg-[#F4F6F3] px-3.5 pt-3">
              <EnTeteTableau g={g} ttc={ttc} setTtc={setTtc} />
            </div>

            {/* LA RÉFÉRENCE, À PART — « l'offre de référence doit être un peu séparée du reste ». */}
            {sansComparatif
              ? <SansReference versionId={versionId} publiee={publiee} onToast={onToast} />
              : <BlocActuelle chiffrage={chiffrage} versionId={versionId} publiee={publiee} onToast={onToast} {...ligne} />}

            <span className="px-1 pt-1 text-[9.5px] font-extrabold uppercase tracking-[.1em] text-km-faint">Offres des fournisseurs · {chiffrage.offres.length}</span>

            {groupes.length === 0 && <p className="rounded-[12px] border border-km-line bg-white px-3 py-4 text-km-body text-km-faint">Aucune offre commandée sur cette version.</p>}
            {groupes.map((grp, gi) => {
              const fournisseur = chiffrage.commande.find((f) => f.id === grp.offres[0].optimisationFournisseurId)
              const prets = grp.offres.filter((o) => o.statut !== 'EN_ATTENTE').length
              return (
                <div key={grp.nom + gi} role="group" aria-label={grp.nom} className="overflow-hidden rounded-[12px] border border-km-line bg-white shadow-[0_1px_2px_rgba(25,40,33,.04)]">
                  <BandeFournisseur nom={grp.nom} logo={grp.offres[0].fournisseurLogo || logoFournisseurNet(grp.nom)} rang={gi} source={fournisseur?.modeReponse ?? null} detail={`${grp.offres.length} offre${grp.offres.length > 1 ? 's' : ''}`} avancement={[prets, grp.offres.length]} />
                  {grp.offres.map((o, i) => (
                    <LigneOffre
                      key={o.id}
                      {...ligne}
                      premiere={i === 0}
                      offre={o}
                      chiffrage={chiffrage}
                      meilleure={meilleur?.id === o.id}
                      enregistrer={(saisie) => m.enregistrerLigne.mutateAsync({ offre: o, compteur, saisie }).catch((e: Error) => onToast(`Erreur : ${e.message}`))}
                      changerStatut={(statut) => m.changerStatut.mutateAsync({ offreId: o.id, statut }).catch((e: Error) => onToast(`Erreur : ${e.message}`))}
                      changerClauses={(clauses) => m.majClauses.mutateAsync({ offreId: o.id, clauses }).catch((e: Error) => onToast(`Erreur : ${e.message}`))}
                    />
                  ))}
                </div>
              )
            })}
            {!publiee && chiffrage.optimisationId && <AjouterOffre chiffrage={chiffrage} versionId={versionId} onToast={onToast} />}
          </div>
        </div>
      </div>

      <div className={cn('flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t px-3.5 py-2.5', publiee ? 'border-km-green-line bg-km-green-tint' : 'border-km-line bg-white')}>
        <div className="flex min-w-0 flex-col">
          <span className="text-[9.5px] font-extrabold uppercase leading-[13px] tracking-[.08em] text-km-faint">Meilleur prix à ce stade</span>
          {meilleur && vMeilleur != null ? (
            <span className="truncate text-[12.5px] leading-[18px]">
              <b className="font-extrabold">{meilleur.fournisseurNom}</b>
              <span className="text-km-muted"> · {meilleur.duree ?? '?'} mois · </span>
              <b className="font-mono font-bold">{eur(vMeilleur)} {ttc ? 'TTC' : 'HTVA'}</b>
              {totalActuel != null && (
                <span className={cn('ml-1.5 font-mono text-[11.5px] font-bold', vMeilleur - totalActuel < 0 ? 'text-km-green' : 'text-km-red')}>
                  {vMeilleur - totalActuel < 0 ? '−' : '+'} {eur(Math.abs(vMeilleur - totalActuel))} / an
                </span>
              )}
            </span>
          ) : (
            <span className="text-[12.5px] leading-[18px] text-km-faint">Aucune offre chiffrée</span>
          )}
        </div>
        <span className="flex-1" />
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Condition ok={aChiffrer === 0} texte={aChiffrer === 0 ? 'Tout est chiffré' : `${aChiffrer} à chiffrer`} />
          <Condition ok={actuelleOk} texte={sansComparatif ? 'Sans comparatif' : actuelleOk ? 'Référence saisie' : 'Référence à saisir'} />
        </span>
        <button
          type="button"
          disabled={publiee || !pret || m.publier.isPending}
          onClick={() => m.publier.mutateAsync().then(() => onToast('✓ Comparatif publié aux commerciaux')).catch((e: Error) => onToast(e.message))}
          className={cn('inline-flex h-8 items-center gap-1.5 rounded-km px-3.5 text-[12.5px] font-bold transition-colors', publiee ? 'bg-km-green-soft text-km-green' : pret ? 'bg-km-green text-white hover:bg-[#0a6650]' : 'cursor-not-allowed border border-km-line bg-km-soft text-km-faint')}
        >
          <Send className="h-3.5 w-3.5" />
          {publiee ? 'Publié' : m.publier.isPending ? 'Publication…' : 'Publier le comparatif'}
        </button>
      </div>
    </>
  )
}

function Condition({ ok, texte }: { ok: boolean; texte: string }) {
  return (
    <span className={cn('flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-semibold', ok ? 'text-km-muted' : 'text-km-text')}>
      <span className={cn('flex h-4 w-4 items-center justify-center rounded-full', ok ? 'bg-km-green-soft text-km-green' : 'bg-km-amber-soft text-km-amber')} aria-hidden="true">
        {ok ? <Check className="h-2.5 w-2.5" strokeWidth={3.5} /> : <span className="text-[10px] font-extrabold leading-none">!</span>}
      </span>
      {texte}
    </span>
  )
}

/**
 * L'EN-TÊTE ANTHRACITE — les zones numérotées sur la première ligne ; la seconde ne nomme que les
 * colonnes des zones qui en ont plusieurs, et porte le sélecteur HTVA / TTC sous « Budget ».
 */
function EnTeteTableau({ g, ttc, setTtc }: { g: Grille; ttc: boolean; setTtc: (v: boolean) => void }) {
  const fin = g.gabarit.split(' ').length
  return (
    <div
      className="grid overflow-hidden rounded-[12px] border border-[#1B201D] bg-gradient-to-b from-[#272E2A] to-[#1B201D] shadow-[0_6px_16px_rgba(25,30,27,.18)]"
      style={{ gridTemplateColumns: g.gabarit, gridTemplateRows: '30px 26px' }}
    >
      <span className="flex items-center px-3.5 text-[12px] font-semibold text-km-side-text" style={{ gridColumn: '1', gridRow: '1 / span 2' }}>Offre</span>
      {g.zones.map((z, i) => {
        const multi = z.cols.length > 1
        const deuxLignes = multi || z.id === 'bud'
        const marge = z.id === 'mrg'
        return (
          <span key={z.id} className="contents">
            <span
              className={cn('flex items-center justify-center gap-1.5 border-l border-[#343C37] px-2', marge && 'bg-[rgba(47,203,158,.07)]')}
              style={{ gridColumn: `${g.debut[z.id]} / span ${z.cols.length}`, gridRow: deuxLignes ? '1' : '1 / span 2' }}
            >
              <span className="font-mono text-[10px] font-bold text-km-side-green">{String(i + 1).padStart(2, '0')}</span>
              <span className={cn('whitespace-nowrap text-[12px] font-semibold', marge ? 'text-km-side-green' : 'text-km-side-text')}>{z.nom}</span>
            </span>
            {multi && z.cols.map((c, k) => (
              <span
                key={c.cle}
                className={cn('flex items-center justify-center border-t border-[#343C37] text-[10px] font-bold uppercase tracking-[.07em] text-[#9AA69F]', k === 0 && 'border-l')}
                style={{ gridColumn: `${g.debut[z.id] + k}`, gridRow: '2' }}
              >
                {c.nom}
              </span>
            ))}
            {z.id === 'bud' && (
              <span className="flex items-start justify-center border-l border-[#343C37]" style={{ gridColumn: `${g.debut[z.id]}`, gridRow: '2' }}>
                <span role="group" aria-label="Budget affiché" className="flex rounded-full bg-white/[0.07] p-0.5">
                  {([[false, 'HTVA'], [true, 'TTC']] as const).map(([v, nom]) => (
                    <button
                      key={nom}
                      type="button"
                      aria-pressed={ttc === v}
                      onClick={() => setTtc(v)}
                      className={cn('h-5 rounded-full px-2.5 text-[10px] font-extrabold tracking-[.06em] transition-colors', ttc === v ? 'bg-km-side-green text-[#10221B]' : 'text-[#9AA69F] hover:text-km-side-text')}
                    >
                      {nom}
                    </button>
                  ))}
                </span>
              </span>
            )}
          </span>
        )
      })}
      <span className="flex items-center justify-center border-l border-[#343C37] text-[12px] font-semibold text-km-side-text" style={{ gridColumn: `${fin}`, gridRow: '1 / span 2' }}>État</span>
    </div>
  )
}

/** La bande qui ouvre la carte d'un fournisseur. */
function BandeFournisseur({ nom, logo, rang, source, detail, avancement }: { nom: string; logo?: string | null; rang: number; source?: string | null; detail?: string; avancement?: [number, number] }) {
  const [libelleSource, classesSource] = SOURCES[source ?? ''] ?? ['', '']
  const [fond, encre] = LOGOS[rang % LOGOS.length]
  return (
    <div className="flex min-h-[34px] items-center gap-2.5 border-b border-km-line-soft px-3 py-1">
      {/* LE LOGO QUAND LE FOURNISSEUR EN A UN (William, 05/10/2026) — celui de sa fiche, sinon celui
          que Kimatch connaît ; à défaut, la pastille d'initiale. */}
      {logo ? (
        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center overflow-hidden rounded-[7px] border border-km-line-soft bg-white" aria-hidden="true">
          <img src={logo} alt="" className="h-[18px] w-[18px] object-contain" />
        </span>
      ) : (
        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] text-[11px] font-extrabold" style={{ background: fond, color: encre }} aria-hidden="true">
          {nom.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <span className="min-w-0 truncate text-[13px] font-extrabold text-km-text">{nom}</span>
      {libelleSource && <span className={cn('shrink-0 rounded-full border px-1.5 text-[9px] font-extrabold leading-[15px] tracking-[.03em]', classesSource)}>{libelleSource}</span>}
      {detail && <span className="shrink-0 text-[11px] text-km-faint">{detail}</span>}
      <span className="flex-1" />
      {avancement && avancement[1] > 0 && (
        <span className="flex shrink-0 items-center gap-1.5" title={`${avancement[0]} sur ${avancement[1]} traitée${avancement[0] > 1 ? 's' : ''}`}>
          <span className="flex gap-[3px]" aria-hidden="true">
            {Array.from({ length: avancement[1] }, (_, i) => <span key={i} className={cn('h-1.5 w-1.5 rounded-full', i < avancement[0] ? 'bg-km-green' : 'bg-[#D5DCD7]')} />)}
          </span>
          <span className="font-mono text-[11px] text-km-muted"><b className={avancement[0] ? 'text-km-green' : 'text-km-text'}>{avancement[0]}</b>/{avancement[1]}</span>
        </span>
      )}
    </div>
  )
}

/** Les cases d'une ligne : un brouillon local, envoyé en base quand on quitte une case modifiée. */
function useBrouillon(saisie: SaisieLigne | undefined, postes: string[]) {
  /* La clé des postes, et non le tableau : un tableau neuf à chaque rendu relancerait l'effet sans
     fin et écraserait la frappe en cours. */
  const clePostes = postes.join(',')
  const initial = useMemo(() => versBrouillon(saisie, clePostes ? clePostes.split(',') : []), [saisie, clePostes])
  const [b, setB] = useState<Brouillon>(initial)
  const modifie = useRef(false)
  useEffect(() => { if (!modifie.current) setB(initial) }, [initial])
  return {
    b,
    changer: (cle: string, v: string, marquer = true) => { if (marquer) modifie.current = true; setB((x) => ({ ...x, [cle]: v })) },
    /** La saisie telle que la ligne la porte maintenant — ce que le budget compte à chaque frappe. */
    saisie: depuisBrouillon(b, postes, saisie, initial),
    lu: () => { const s = depuisBrouillon(b, postes, saisie, initial); modifie.current = false; return s },
    /** Change une valeur et rend aussitôt la saisie qui en résulte — pour enregistrer sans attendre
     *  qu'on quitte une case (les options du P0 se cochent, elles ne se tapent pas). */
    appliquer: (cle: string, v: string) => { const nb = { ...b, [cle]: v }; setB(nb); modifie.current = false; return depuisBrouillon(nb, postes, saisie, initial) },
    estModifie: () => modifie.current,
  }
}

/**
 * UNE CASE À SAISIR — un champ arrondi, légèrement grisé, qui passe au blanc au survol et à la
 * saisie ; la marge garde sa teinte verte. Ce qui se calcule n'a pas de champ.
 */
function Case({ valeur, onChange, onBlur, marge, label, presente, aide }: { valeur: string; onChange: (v: string, marquer?: boolean) => void; onBlur: () => void; marge?: boolean; label: string; presente?: string; aide?: string }) {
  const [active, setActive] = useState(false)
  /* Hors saisie, une case P0 montre le prix PRÉSENTÉ (P0 + marge) ; on y clique, le prix du
     fournisseur revient pour être modifié. */
  const montre = presente != null && !active
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={label}
      title={montre ? aide : undefined}
      value={montre ? presente : valeur}
      onFocus={() => setActive(true)}
      onChange={(e) => onChange(nettoyerPrix(e.target.value))}
      onBlur={() => {
        setActive(false)
        onBlur()
        /* Le prix se range à deux décimales, sans compter pour une modification. */
        const n = lireNombre(valeur)
        if (n != null && fr2(n) !== valeur) onChange(fr2(n), false)
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className={cn(
        'h-7 w-full min-w-0 cursor-text rounded-[8px] border px-[7px] text-right font-mono text-[12px] font-semibold tabular-nums outline-none transition-[background-color,border-color,box-shadow]',
        'hover:bg-white focus:border-km-green focus:bg-white focus:shadow-[0_0_0_3px_rgba(13,122,95,.16)]',
        marge ? 'border-[#CFE6DB] bg-[#EAF5F0] text-km-green' : 'border-[#E3E8E4] bg-km-soft text-km-text hover:border-[#C3CBC5]',
        montre && 'shadow-[inset_0_-2px_0_rgba(13,122,95,.45)]',
      )}
    />
  )
}

interface PropsLigne { g: Grille; compteur: CompteurChiffrage; totalActuel: number | null; ttc: boolean }

/** La bordure qui ouvre chaque zone, dans les cartes. */
const bordZone = (g: Grille, col: number) => (Object.values(g.debut).includes(col) ? 'border-l border-km-line-soft' : '')

/**
 * Les cases de saisie d'une ligne, zone par zone.
 *
 * ══ LA MARGE S'AJOUTE AUX P0 ══
 * William, 01/10/2026 : « quand je mentionne la marge, elle doit venir s'ajouter aux P0 du gaz et aux
 * P0 Pointe, HPH, HCH, HPE et HCE. Si j'ai un prix à 50 et que je mets 10 de marge, ça doit devenir
 * 60. » Les cases P0 affichent donc P0 + marge (soulignées de vert), le reste — abonnement, capacité,
 * CEE — reste tel quel. Le budget ne compte la marge qu'une fois : consommation × (P0 + marge), jamais
 * une « marge × consommation » en plus (`pricing/budget.ts`).
 */
/**
 * CE QUE LE P0 INCLUT — William, 02/10/2026 : « sur une facture ENDESA (offre actuelle), est inclus dans
 * le même prix le P0 + TQd + CEE + CPB. En gros, c'est un coût variable global […] un indicateur visuel
 * doit apporter des options au clic de ce qui est inclus (rien par défaut). » Une pastille au coin de la
 * case P0 : « + » discret quand rien n'est inclus, le nombre d'inclusions sinon. Ce qui est coché ne se
 * compte plus à part (`budget.ts`, et la base pour TQD, CPB et accise).
 */
function OptionsP0({ gaz, inclus, label, onChange }: { gaz: boolean; inclus: string[]; label: string; onChange: (liste: string[]) => void }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const bouton = useRef<HTMLButtonElement>(null)
  const volet = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!pos) return
    const fermer = (e: MouseEvent) => { if (!volet.current?.contains(e.target as Node) && !bouton.current?.contains(e.target as Node)) setPos(null) }
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null) }
    const defile = () => setPos(null)
    document.addEventListener('mousedown', fermer)
    document.addEventListener('keydown', echap)
    window.addEventListener('scroll', defile, true)
    window.addEventListener('resize', defile)
    return () => {
      document.removeEventListener('mousedown', fermer)
      document.removeEventListener('keydown', echap)
      window.removeEventListener('scroll', defile, true)
      window.removeEventListener('resize', defile)
    }
  }, [pos])
  const options = gaz ? INCLUSIONS_GAZ : INCLUSIONS_ELEC
  const n = inclus.length
  const basculer = () => {
    if (pos) { setPos(null); return }
    const r = bouton.current?.getBoundingClientRect()
    if (!r) return
    setPos({ top: window.innerHeight - r.bottom < 220 ? r.top - 4 - 200 : r.bottom + 4, left: Math.min(r.left, window.innerWidth - 248) })
  }
  const basculerOption = (k: ComposanteIncluse) => onChange(inclus.includes(k) ? inclus.filter((x) => x !== k) : [...inclus, k])
  return (
    <>
      <button
        ref={bouton}
        type="button"
        onClick={basculer}
        aria-expanded={!!pos}
        aria-label={`Ce que le P0 inclut · ${label}`}
        title={n ? `Le P0 inclut : ${inclus.map((k) => LIBELLE_INCLUSION[k as ComposanteIncluse] ?? k).join(', ')}` : 'Que comprend ce P0 ? (rien d’inclus)'}
        className={cn(
          'absolute -left-0.5 -top-0.5 z-[1] flex h-[15px] min-w-[15px] items-center justify-center rounded-full border px-[3px] text-[9px] font-extrabold leading-none transition-colors',
          n ? 'border-km-green bg-km-green text-white shadow-[0_1px_3px_rgba(13,122,95,.35)]' : 'border-[#C3CBC5] bg-white text-km-muted hover:border-km-green hover:text-km-green',
          pos && !n && 'border-km-green text-km-green',
        )}
      >
        {n ? `+${n}` : '+'}
      </button>
      {pos && (
        <span ref={volet} role="dialog" aria-label="Ce que le P0 inclut" style={{ top: pos.top, left: pos.left }} className="fixed z-50 flex w-[240px] flex-col rounded-km-md border border-km-line bg-white p-1.5 text-left shadow-km-pop">
          <span className="px-2 pb-0.5 pt-1 text-[9.5px] font-extrabold uppercase tracking-[.08em] text-km-faint">Le P0 inclut déjà</span>
          <span className="px-2 pb-1.5 text-[10.5px] leading-[14px] text-km-muted">Ce qui est coché ne se compte pas en plus.</span>
          {options.map((k) => (
            <label key={k} className="flex cursor-pointer items-center gap-2 rounded-km-sm px-2 py-1.5 text-[12px] font-semibold hover:bg-km-soft">
              <input type="checkbox" checked={inclus.includes(k)} onChange={() => basculerOption(k)} className="h-3.5 w-3.5 accent-km-green" />
              {LIBELLE_INCLUSION[k]}
            </label>
          ))}
        </span>
      )}
    </>
  )
}

const estP0 = (cle: string) => cle === 'p0' || cle.startsWith('p0_')
function Saisies({ g, brouillon, label, sansMarge, onBlur, onInclus }: { g: Grille; brouillon: ReturnType<typeof useBrouillon>; label: string; sansMarge?: boolean; onBlur: () => void; onInclus: (s: SaisieLigne) => void }) {
  const laMarge = sansMarge ? null : lireNombre(brouillon.b.marge)
  const inclus = brouillon.b.inclus ? brouillon.b.inclus.split(',').filter(Boolean) : []
  const premierP0 = g.zones.find((z) => z.id === 'nrj')?.cols[0]?.cle
  return (
    <>
      {g.zones.filter((z) => z.id !== 'bud' && z.id !== 'ect').flatMap((z) => z.cols.map((c, k) => {
        const col = g.debut[z.id] + k
        const marge = z.id === 'mrg'
        return (
          <span key={c.cle} className={cn('relative flex items-center px-1', bordZone(g, col), marge && 'bg-[rgba(13,122,95,.035)]')}>
            {c.cle === premierP0 && (
              <OptionsP0 gaz={g.gaz} inclus={inclus} label={label} onChange={(liste) => onInclus(brouillon.appliquer('inclus', liste.join(',')))} />
            )}
            {marge && sansMarge
              ? <span className="w-full text-center text-[10px] italic text-km-faint">sans objet</span>
              : (c.cle === 'cee' && inclus.includes('CEE')) || (c.cle === 'capacite' && inclus.includes('CAPACITE'))
                ? <span title="Compris dans le P0 : ne se compte pas en plus" className="flex h-7 w-full items-center justify-center rounded-[8px] border border-dashed border-km-green-line bg-km-green-tint text-[10.5px] font-bold text-km-green">dans le P0</span>
              : (() => {
                const p0 = estP0(c.cle) ? lireNombre(brouillon.b[c.cle]) : null
                const avecMarge = p0 != null && laMarge != null && laMarge !== 0
                return (
                  <Case
                    label={`${libelleCase(c.cle)} · ${label}`}
                    valeur={brouillon.b[c.cle] ?? ''}
                    marge={marge}
                    presente={avecMarge ? fr2(p0 + laMarge) : undefined}
                    aide={avecMarge ? `Prix fournisseur ${fr2(p0)} + marge ${fr2(laMarge)} = ${fr2(p0 + laMarge)} €/MWh · cliquer pour modifier le prix fournisseur` : undefined}
                    onChange={(v, marquer) => brouillon.changer(c.cle, v, marquer)}
                    onBlur={onBlur}
                  />
                )
              })()}
          </span>
        )
      }))}
    </>
  )
}

/** Le budget (HTVA ou TTC, selon l'en-tête) et l'écart à la référence, calculés à chaque frappe. */
function Resultat({ g, compteur, saisie, duree, totalActuel, ttc, reference, horsComparatif, titre }: PropsLigne & { saisie: SaisieLigne; duree: number | null; reference?: boolean; horsComparatif?: boolean; titre: string }) {
  /* Le budget complet : la saisie, plus ce que la base a retenu de réglementé (le CPB dépend de la
     durée de l'offre). En TTC, tout est à 20 %, CTA comprise. */
  const b = budgetLigne(compteur, saisie, duree)
  const montant = (x: NonNullable<typeof b>) => (ttc ? ttcDuBudget(x) : x.total)
  /* L'écart ne se lit que sur une ligne complète : un budget partiel paraîtrait toujours moins cher. */
  const ecart = b?.complet && totalActuel != null ? montant(b) - totalActuel : null
  const vide = <span className="text-[#D5DCD7]">—</span>
  return (
    <>
      <span className={cn('flex items-center justify-end px-2.5', bordZone(g, g.debut.bud))}>
        {b
          ? (
            /* UN CLIC SUR LE BUDGET EN DONNE LE DÉTAIL (`DetailCalcul`). */
            <BudgetCliquable titre={titre} compteur={compteur} saisie={saisie} duree={duree}>
              <span className={cn('whitespace-nowrap font-mono tabular-nums', b.complet ? 'text-[13px] font-extrabold text-km-text' : 'text-[12px] italic text-km-faint')}>{fr2(montant(b))}</span>
            </BudgetCliquable>
          )
          : vide}
      </span>
      <span className={cn('flex items-center justify-end px-2.5', bordZone(g, g.debut.ect))}>
        {reference
          ? <span className="w-full text-center text-[10.5px] font-semibold text-km-faint">référence</span>
          : horsComparatif
            ? <span className="whitespace-nowrap text-[10.5px] italic text-km-faint" title="Les offres indexées ne vont pas au comparatif pour le moment">hors comparatif</span>
            : ecart != null
              ? (
                <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[10.5px] font-bold tabular-nums', ecart < 0 ? 'bg-km-green-soft text-km-green' : 'bg-km-red-soft text-km-red')}>
                  {ecart < 0 ? '↓' : '↑'} {fr2(Math.abs(ecart))}
                </span>
              )
              : vide}
      </span>
    </>
  )
}

/** L'étoile du meilleur prix — « une étoile c'est plus léger et on comprend ». */
function Etoile() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" role="img" aria-label="Meilleur prix" className="shrink-0">
      <title>Meilleur prix</title>
      <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9L12 2.6z" fill="#D9A21B" stroke="#B9850F" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}

function LigneOffre({ offre, compteur, chiffrage, premiere, meilleure, totalActuel, ttc, g, enregistrer, changerStatut, changerClauses }: PropsLigne & {
  offre: OffreChiffrage
  chiffrage: Chiffrage
  premiere: boolean
  meilleure: boolean
  enregistrer: (s: SaisieLigne) => Promise<unknown>
  changerStatut: (s: 'EN_ATTENTE' | 'DISPONIBLE' | 'INDISPONIBLE') => Promise<unknown>
  changerClauses: (c: OffreChiffrage['clauses']) => Promise<unknown>
}) {
  const brouillon = useBrouillon(offre.saisies[compteur.vcId], g.postes)
  const saisie = brouillon.saisie
  const indexe = estIndexe(offre.type)
  const indispo = offre.statut === 'INDISPONIBLE'
  const quitter = () => { if (brouillon.estModifie()) void enregistrer(brouillon.lu()) }
  /* ══ LA LIGNE SE VALIDE TOUTE SEULE — William, 05/10/2026 ══
     « Supprime les états "À chiffrer", "Prêt" ou "Confirmer"… Quand les prix sont renseignés, la
     ligne est validée. Simple et rapide. » Dès que ce qui est ENREGISTRÉ est complet sur tous les
     compteurs, l'offre passe disponible ; une case vidée la remet en attente. « Le fournisseur ne la
     propose pas » reste un choix du menu. */
  const completeEnBase = chiffrage.compteurs.every((c) => saisieComplete(c, offre.saisies[c.vcId]))
  const enCours = useRef(false)
  useEffect(() => {
    if (indispo || enCours.current) return
    const cible = completeEnBase ? 'DISPONIBLE' : 'EN_ATTENTE'
    if (offre.statut === cible) return
    enCours.current = true
    void changerStatut(cible).finally(() => { enCours.current = false })
  }, [completeEnBase, indispo, offre.statut, changerStatut])
  const fin = g.gabarit.split(' ').length
  return (
    <div className={cn('grid h-[38px] transition-colors', !premiere && 'border-t border-km-line-soft', meilleure ? 'bg-km-green-tint' : 'hover:bg-km-bg')} style={{ gridTemplateColumns: g.gabarit }}>
      <span className="flex min-w-0 items-center gap-1.5 pl-3.5 pr-2">
        <span className={cn('whitespace-nowrap text-[12.5px] font-bold', indispo ? 'text-km-faint line-through decoration-km-faint/60' : 'text-km-text')}>{offre.duree ?? '?'} mois</span>
        <span className="whitespace-nowrap rounded-[6px] border border-km-line-soft bg-white px-1.5 text-[10.5px] font-semibold leading-[17px] text-km-muted">{offre.type ?? '?'}</span>
        {meilleure && <Etoile />}
      </span>
      {indispo ? (
        <span className={cn('flex items-center justify-end px-2.5 text-[11px] italic text-km-faint', bordZone(g, 2))} style={{ gridColumn: `2 / ${fin}` }}>Le fournisseur ne la propose pas</span>
      ) : (
        <>
          <Saisies g={g} brouillon={brouillon} label={`${offre.fournisseurNom} ${offre.duree} mois ${offre.type}`} onBlur={quitter} onInclus={(s) => void enregistrer(s)} />
          <Resultat g={g} compteur={compteur} saisie={saisie} duree={offre.duree} totalActuel={totalActuel} ttc={ttc} horsComparatif={indexe} titre={`${offre.fournisseurNom} · ${offre.duree ?? '?'} mois · ${offre.type ?? '?'}`} />
        </>
      )}
      <span className="flex items-center justify-end gap-1 border-l border-km-line-soft px-2">
        {indispo && <Indispo onRouvrir={() => void changerStatut('EN_ATTENTE')} />}
        <MenuLigne clauses={offre.clauses} indispo={indispo} onClauses={changerClauses} onIndispo={() => void changerStatut(indispo ? 'EN_ATTENTE' : 'INDISPONIBLE')} />
      </span>
    </div>
  )
}

/**
 * ══ AJOUTER UNE OFFRE — William, 05/10/2026 ══
 * « Propose un bouton "Ajouter une offre" en dessous de la dernière offre affichée. Au clic, demande
 * Fournisseur + Durée puis crée la ligne dans le tableau. » La durée rejoint la commande du
 * fournisseur — voir `ajouterOffre` dans `chiffrage.ts` ; la ligne se chiffre ensuite comme les autres.
 */
const DUREES_PROPOSEES = [12, 24, 36, 48, 60]
function AjouterOffre({ chiffrage, versionId, onToast }: { chiffrage: Chiffrage; versionId: string; onToast: (m: string) => void }) {
  const m = useChiffrageMutations(versionId)
  const { data: tous } = useFournisseursChoix()
  const [ouvert, setOuvert] = useState(false)
  const [fournisseurId, setFournisseurId] = useState('')
  const [duree, setDuree] = useState('')
  /* Les fournisseurs déjà consultés d'abord : c'est le plus souvent chez eux qu'on ajoute une durée. */
  const consultes = new Set(chiffrage.commande.map((f) => f.fournisseurId))
  const liste = [...(tous ?? [])].sort((a, b) => Number(consultes.has(b.id)) - Number(consultes.has(a.id)) || a.nom.localeCompare(b.nom))
  const deja = chiffrage.commande.find((f) => f.fournisseurId === fournisseurId)?.durees ?? []
  const fermer = () => { setOuvert(false); setFournisseurId(''); setDuree('') }
  const ajouter = () => {
    if (!fournisseurId || !duree || !chiffrage.optimisationId) return
    const nom = liste.find((f) => f.id === fournisseurId)?.nom ?? ''
    void m.ajouterOffre.mutateAsync({ optimisationId: chiffrage.optimisationId, fournisseurId, duree: Number(duree) })
      .then(() => { onToast(`✓ Offre ajoutée : ${nom} · ${duree} mois`); fermer() })
      .catch((e: Error) => onToast(`Erreur : ${e.message}`))
  }
  if (!ouvert) {
    return (
      <button type="button" onClick={() => setOuvert(true)} className="flex h-[36px] items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-km-line bg-white/60 text-[12.5px] font-semibold text-km-muted transition-colors hover:border-km-green hover:bg-white hover:text-km-green">
        <Plus className="h-3.5 w-3.5" /> Ajouter une offre
      </button>
    )
  }
  const champ = 'h-[30px] rounded-[8px] border border-km-line bg-white px-2 text-[12.5px] font-semibold text-km-text outline-none focus:border-km-green'
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-km-green-line bg-white px-3 py-2">
      <span className="text-[9.5px] font-extrabold uppercase tracking-[.08em] text-km-faint">Nouvelle offre</span>
      <select autoFocus value={fournisseurId} onChange={(e) => setFournisseurId(e.target.value)} aria-label="Fournisseur" className={cn(champ, 'max-w-[240px]')}>
        <option value="">Fournisseur…</option>
        {liste.map((f) => <option key={f.id} value={f.id}>{f.nom}{consultes.has(f.id) ? ' · consulté' : ''}</option>)}
      </select>
      <select value={duree} onChange={(e) => setDuree(e.target.value)} aria-label="Durée" className={champ}>
        <option value="">Durée…</option>
        {DUREES_PROPOSEES.map((d) => <option key={d} value={d} disabled={deja.includes(d)}>{d} mois{deja.includes(d) ? ' · déjà là' : ''}</option>)}
      </select>
      <button type="button" onClick={ajouter} disabled={!fournisseurId || !duree || m.ajouterOffre.isPending} className="inline-flex h-[30px] items-center gap-1.5 rounded-[8px] bg-km-green px-3 text-[12.5px] font-bold text-white hover:bg-[#0a6650] disabled:opacity-45">
        {m.ajouterOffre.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Ajouter
      </button>
      <button type="button" onClick={fermer} className="h-[30px] rounded-[8px] px-2 text-[12px] font-semibold text-km-muted hover:bg-km-soft">Annuler</button>
    </div>
  )
}

/** « Le fournisseur ne la propose pas » : seul état qui se lit encore sur la ligne (05/10/2026). */
function Indispo({ onRouvrir }: { onRouvrir: () => void }) {
  return (
    <button type="button" onClick={onRouvrir} title="Cliquer pour la remettre à chiffrer" className="inline-flex h-[22px] items-center gap-1 rounded-full border border-km-red-line bg-km-red-soft px-2 text-[10.5px] font-bold text-km-red">
      <Ban className="h-3 w-3" /> Indispo.
    </button>
  )
}

/**
 * LA RÉFÉRENCE — l'offre actuelle, dans sa carte à part : la bande porte le fournisseur, choisi
 * directement à côté de « Référence » ; la ligne en dessous porte les prix du contrat en cours.
 * Pas de marge sur une offre en cours : la case dit « sans objet ».
 */
function BlocActuelle({ chiffrage, compteur, g, totalActuel, ttc, versionId, publiee, onToast }: PropsLigne & { chiffrage: Chiffrage; versionId: string; publiee: boolean; onToast: (m: string) => void }) {
  const m = useChiffrageMutations(versionId)
  const { data: fournisseurs } = useFournisseursChoix()
  const actuelle = chiffrage.actuelle
  const [fournisseurId, setFournisseurId] = useState<string>(actuelle?.fournisseurId ?? compteur.fournisseurActuelId ?? '')
  const brouillon = useBrouillon(actuelle?.saisies[compteur.vcId], g.postes)
  const saisie = brouillon.saisie
  const enregistrer = (fid: string, s?: SaisieLigne) => {
    if (!fid) { onToast('Choisissez d’abord le fournisseur actuel.'); return }
    void m.enregistrerActuelle.mutateAsync({ fournisseurId: fid, duree: actuelle?.duree ?? null, compteur, saisie: { ...(s ?? brouillon.lu()), marge: 0 } }).catch((e: Error) => onToast(`Erreur : ${e.message}`))
  }
  return (
    <div className="overflow-hidden rounded-[12px] border border-km-line bg-white">
      <div className="flex min-h-[34px] items-center gap-2 border-b border-km-line-soft bg-km-bg px-3 py-1">
        <span className="shrink-0 rounded-full bg-km-side px-2.5 text-[9.5px] font-extrabold uppercase leading-[19px] tracking-[.09em] text-km-side-text">Référence</span>
        <select
          value={fournisseurId}
          onChange={(e) => { setFournisseurId(e.target.value); if (actuelle) enregistrer(e.target.value) }}
          aria-label="Fournisseur de l'offre actuelle"
          className={cn('h-[26px] max-w-[220px] rounded-[7px] border bg-white pl-2 pr-7 text-[12.5px] font-extrabold', fournisseurId ? 'border-km-line text-km-text' : 'border-km-amber-line text-km-amber')}
        >
          <option value="">Fournisseur actuel…</option>
          {(fournisseurs ?? []).map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
        </select>
        <span className="flex-1" />
        {!publiee && <RetirerReference versionId={versionId} onToast={onToast} />}
      </div>
      <div className="grid h-[38px]" style={{ gridTemplateColumns: g.gabarit }}>
        <span className="flex min-w-0 items-center pl-3.5 pr-2">
          <span className="whitespace-nowrap text-[12.5px] font-bold text-km-text">{actuelle?.duree ? `${actuelle.duree} mois` : 'Contrat en cours'}</span>
        </span>
        <Saisies g={g} brouillon={brouillon} label="offre actuelle" sansMarge onBlur={() => { if (brouillon.estModifie()) enregistrer(fournisseurId) }} onInclus={(s) => enregistrer(fournisseurId, s)} />
        <Resultat g={g} compteur={compteur} saisie={{ ...saisie, marge: 0 }} duree={actuelle?.duree ?? null} totalActuel={totalActuel} ttc={ttc} reference titre={`Offre actuelle${actuelle?.fournisseurNom ? ` · ${actuelle.fournisseurNom}` : ''}`} />
        <span className="border-l border-km-line-soft" />
      </div>
    </div>
  )
}

/**
 * SANS OFFRE DE RÉFÉRENCE — William, 02/10/2026 : « on n'a pas toujours d'offre de référence. Si ce
 * n'est pas le cas, je dois avoir la possibilité de supprimer la ligne de référence et alors ce sera
 * un appel d'offre sans comparatif. » Le choix est noté sur la version (`modele_offre`) : il dira quel
 * modèle d'offre générer. Retirée, la référence est désactivée, pas effacée — « Ajouter une
 * référence » la rétablit avec ses prix.
 */
function RetirerReference({ versionId, onToast }: { versionId: string; onToast: (m: string) => void }) {
  const m = useChiffrageMutations(versionId)
  /* CONFIRMÉ EN DEUX TEMPS : la ligne disparaît du tableau, l'écart aussi. */
  const [confirmer, setConfirmer] = useState(false)
  useEffect(() => {
    if (!confirmer) return
    const t = window.setTimeout(() => setConfirmer(false), 5000)
    return () => window.clearTimeout(t)
  }, [confirmer])
  if (!confirmer) {
    return (
      <button type="button" onClick={() => setConfirmer(true)} title="Pas d’offre de référence : appel d’offres sans comparatif" className="inline-flex h-[24px] shrink-0 items-center gap-1 rounded-[7px] px-2 text-[11px] font-semibold text-km-muted hover:bg-km-red-soft hover:text-km-red">
        <Trash2 className="h-3.5 w-3.5" /> Pas de référence
      </button>
    )
  }
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-km-text">
      Appel d’offres sans comparatif ?
      <button
        type="button"
        disabled={m.definirComparatif.isPending}
        onClick={() => m.definirComparatif.mutateAsync(true).then(() => onToast('✓ Référence retirée : appel d’offres sans comparatif')).catch((e: Error) => onToast(`Erreur : ${e.message}`))}
        className="h-[24px] rounded-[7px] bg-km-red px-2 font-bold text-white hover:bg-km-red/90"
      >
        Retirer
      </button>
      <button type="button" onClick={() => setConfirmer(false)} className="h-[24px] rounded-[7px] border border-km-line bg-white px-2 font-semibold text-km-muted hover:bg-km-soft">Annuler</button>
    </span>
  )
}

function SansReference({ versionId, publiee, onToast }: { versionId: string; publiee: boolean; onToast: (m: string) => void }) {
  const m = useChiffrageMutations(versionId)
  return (
    <div className="flex min-h-[40px] items-center gap-2.5 rounded-[12px] border border-dashed border-[#C9D0CB] bg-white px-3 py-1.5">
      <span className="shrink-0 rounded-full border border-km-line bg-km-soft px-2.5 text-[9.5px] font-extrabold uppercase leading-[19px] tracking-[.09em] text-km-muted">Sans comparatif</span>
      <span className="min-w-0 truncate text-[12px] text-km-muted">Aucune offre de référence : les offres se présentent sans écart.</span>
      <span className="flex-1" />
      {!publiee && (
        <button
          type="button"
          disabled={m.definirComparatif.isPending}
          onClick={() => m.definirComparatif.mutateAsync(false).then(() => onToast('✓ Référence rétablie')).catch((e: Error) => onToast(`Erreur : ${e.message}`))}
          className="inline-flex h-[26px] shrink-0 items-center gap-1 rounded-[7px] border border-km-line bg-white px-2.5 text-[11.5px] font-semibold text-km-text hover:bg-km-soft"
        >
          <Plus className="h-3.5 w-3.5 text-km-green" /> Ajouter une référence
        </button>
      )}
    </div>
  )
}

/**
 * LE MENU D'UNE LIGNE (⋯) — les clauses de l'offre, qui alimentent l'onglet « Clauses
 * contractuelles » du commercial (score de A à E), et « le fournisseur ne la propose pas ». Le
 * contrat sécurisé n'y est pas : il se déduit du prix fixe.
 */
/* SANS LE SWAP — William, 05/10/2026 : « dans les clauses contractuelles, ne propose pas l'option
   SWAP, supprime-la ». Aucune offre ne l'avait cochée. */
const LIBELLES_CLAUSES: [keyof OffreChiffrage['clauses'], string][] = [
  ['depot', 'Dépôt de garantie'], ['engagement', 'Engagement de consommation'], ['renegociation', 'Renégociation anticipée'], ['tacite', 'Tacite reconduction'],
]
/* ══ PLUS DE VALIDITÉ PAR OFFRE — William, 05/10/2026 ══
   « Ce n'est pas une offre qui est valide ou non, c'est la proposition complète. » La validité se
   saisit une fois, à la génération de l'offre (« Générer l'offre », étape 2). */
function MenuLigne({ clauses, indispo, onClauses, onIndispo }: {
  clauses: OffreChiffrage['clauses']
  indispo: boolean
  onClauses: (c: OffreChiffrage['clauses']) => Promise<unknown>
  onIndispo: () => void
}) {
  /* POSÉ PAR-DESSUS LE TABLEAU : le tableau défile et rogne ce qui dépasse ; le menu se place donc
     à l'écran, sous le bouton — ou au-dessus quand la ligne est en bas. */
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null)
  const ouvert = pos != null
  const ref = useRef<HTMLSpanElement>(null)
  const bouton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!ouvert) return
    const fermer = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setPos(null) }
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null) }
    const defile = () => setPos(null)
    document.addEventListener('mousedown', fermer)
    document.addEventListener('keydown', echap)
    window.addEventListener('scroll', defile, true)
    window.addEventListener('resize', defile)
    return () => {
      document.removeEventListener('mousedown', fermer)
      document.removeEventListener('keydown', echap)
      window.removeEventListener('scroll', defile, true)
      window.removeEventListener('resize', defile)
    }
  }, [ouvert])
  const basculer = () => {
    if (ouvert) { setPos(null); return }
    const r = bouton.current?.getBoundingClientRect()
    if (!r) return
    const right = window.innerWidth - r.right
    setPos(window.innerHeight - r.bottom < 300 ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right })
  }
  return (
    <span ref={ref} className="relative">
      <button
        ref={bouton}
        type="button"
        onClick={basculer}
        title="Clauses et disponibilité"
        aria-label="Clauses et disponibilité de l'offre"
        aria-expanded={ouvert}
        className={cn('flex h-[22px] w-[22px] items-center justify-center rounded-full text-km-faint transition-colors hover:bg-km-soft hover:text-km-text', ouvert && 'bg-km-soft text-km-text')}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {pos && (
        <span style={{ top: pos.top, bottom: pos.bottom, right: pos.right }} className="fixed z-50 flex w-[250px] flex-col rounded-km-md border border-km-line bg-white p-1.5 shadow-km-pop">
          <span className="px-2 pb-1 pt-1 text-[9.5px] font-extrabold uppercase tracking-[.08em] text-km-faint">Clauses de l’offre</span>
          {LIBELLES_CLAUSES.map(([cle, nom]) => (
            <label key={cle} className="flex cursor-pointer items-center gap-2 rounded-km-sm px-2 py-1.5 text-[12px] hover:bg-km-soft">
              <input type="checkbox" checked={clauses[cle]} onChange={(e) => void onClauses({ ...clauses, [cle]: e.target.checked })} className="h-3.5 w-3.5 accent-km-green" />
              {nom}
            </label>
          ))}
          <span className="px-2 pb-1.5 pt-0.5 text-[10.5px] text-km-faint">Le contrat sécurisé se déduit du prix fixe.</span>
          <span className="my-1 h-px bg-km-line-soft" />
          <button type="button" onClick={() => { setPos(null); onIndispo() }} className={cn('flex items-center gap-2 rounded-km-sm px-2 py-1.5 text-left text-[12px] font-semibold hover:bg-km-soft', indispo ? 'text-km-text' : 'text-km-red')}>
            {indispo ? <RotateCcw className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
            {indispo ? 'Remettre à chiffrer' : 'Le fournisseur ne la propose pas'}
          </button>
        </span>
      )}
    </span>
  )
}
