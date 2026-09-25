import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, Building2, Check, Factory, Handshake, Home, Loader2, Search, Users, Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContactForm } from '@/components/contact/ContactForm'
import { CarteEllipro } from '@/components/compte/CarteEllipro'
import { CreationCompteurDialog } from '@/components/compteur/CreationCompteurDialog'
import {
  EnTeteEtape, FenetreParcours, PanneauParcours, RailParcours,
  type EtapeParcours, type ResumeEtape,
} from '@/components/parcours/Parcours'
import { useCreateCompte, useComptesRattachables } from '@/lib/data/comptes'
import { useContactsParCompte } from '@/lib/data/contacts'
import { useSites } from '@/lib/data/sites'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useEllisphereScore, useRechercheEllisphere, type EllisphereCompany } from '@/lib/data/ellisphere'
import { cn } from '@/lib/utils'
import type { Compte, TypeCompte } from '@/types/domain'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CRÉER UN COMPTE — LE PARCOURS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 24/09/2026 : « réutilise la même logique pour l'ensemble des enchaînements d'écran
 * amenant à une création d'enregistrement. On va commencer par optimiser le process de création de
 * compte. »
 *
 *   Étape 1 · le type, en cartes
 *   Étape 2 · la recherche Ellisphere, qui pré-remplit tout
 *   Étape 3 · le score, puis la création
 *   Étape 4 · contacts ou compteurs, au choix
 *
 * ══ DEUX CHAMPS POUR UNE SEULE QUESTION, ET C'EST LE MODÈLE QUI LE VEUT ══
 *
 * William : « un compte est soit Syndic professionnel, soit Syndic non professionnel, soit
 * Entreprise (champ Typologie). Dans ce cas le Type de compte est forcément Consommateur. Mais un
 * compte peut également être Fournisseur ou Partenaire (Type de compte directement). »
 *
 * En base, ce sont bien deux colonnes : `segment` porte la typologie, `type_compte` la famille. Les
 * anciens écrans demandaient les deux, l'une après l'autre, et laissaient créer un « Fournisseur
 * consommateur ». Ici une seule carte fixe les deux d'un coup, et l'écran DIT la correspondance
 * plutôt que de la cacher — c'est la même information, apprise en la choisissant.
 */

type Teinte = 'vert' | 'bleu' | 'ambre'

interface TypeDeCompte {
  cle: string
  libelle: string
  quoi: string
  segment: string
  typeCompte: TypeCompte
  /** Vrai pour les trois typologies qui sont des consommateurs. */
  consommateur: boolean
  /** Un syndic bénévole n'a pas de SIREN : ni recherche Ellisphere, ni score. */
  sansSiren?: boolean
  icone: typeof Building2
  teinte: Teinte
}

const TYPES: TypeDeCompte[] = [
  {
    cle: 'SYNDIC_PRO', libelle: 'Syndic professionnel', segment: 'Syndic professionnel',
    typeCompte: 'client', consommateur: true, icone: Building2, teinte: 'vert',
    quoi: 'Un cabinet qui administre des copropriétés pour le compte de leurs propriétaires.',
  },
  {
    cle: 'SYNDIC_BENEVOLE', libelle: 'Syndic non professionnel', segment: 'Syndic non professionnel',
    typeCompte: 'client', consommateur: true, sansSiren: true, icone: Home, teinte: 'vert',
    quoi: 'Une copropriété administrée par l’un de ses copropriétaires. Elle n’a pas de SIREN.',
  },
  {
    cle: 'ENTREPRISE', libelle: 'Entreprise', segment: 'Entreprise',
    typeCompte: 'client', consommateur: true, icone: Factory, teinte: 'vert',
    quoi: 'Une société qui consomme de l’énergie pour son propre compte.',
  },
  {
    cle: 'FOURNISSEUR', libelle: 'Fournisseur', segment: 'Fournisseur',
    typeCompte: 'fournisseur', consommateur: false, icone: Zap, teinte: 'bleu',
    quoi: 'Un fournisseur d’énergie à qui l’on demande des offres.',
  },
  {
    cle: 'PARTENAIRE', libelle: 'Partenaire', segment: 'Partenaire',
    typeCompte: 'partenaire', consommateur: false, icone: Handshake, teinte: 'ambre',
    quoi: 'Un apporteur d’affaires ou un intermédiaire qui amène des dossiers.',
  },
]

const ETAPES: EtapeParcours[] = [
  { cle: 'type', libelle: 'Type de compte' },
  { cle: 'entreprise', libelle: 'L’entreprise' },
  { cle: 'score', libelle: 'Score et création' },
  { cle: 'suite', libelle: 'Contacts & compteurs' },
]

/**
 * LA CARTE D'UN TYPE.
 *
 * « Des cards animées et colorées, avec un petit texte expliquant ce qu'est chaque type de compte
 * à créer. » L'animation se garde au survol et à la sélection — elle dit que c'est cliquable et ce
 * qui est retenu, jamais plus. Une carte qui bouge sans raison devient un tic.
 */
function CarteType({ type, choisi, onChoisir }: {
  type: TypeDeCompte
  choisi: boolean
  onChoisir: () => void
}) {
  const Icone = type.icone
  const couleurs: Record<Teinte, { bord: string; fond: string; puce: string; texte: string }> = {
    vert: { bord: 'border-km-green', fond: 'bg-km-green-tint', puce: 'bg-km-green', texte: 'text-km-green' },
    bleu: { bord: 'border-km-blue', fond: 'bg-km-blue-soft', puce: 'bg-km-blue', texte: 'text-km-blue' },
    ambre: { bord: 'border-km-amber', fond: 'bg-km-amber-soft', puce: 'bg-km-amber', texte: 'text-km-amber' },
  }
  const c = couleurs[type.teinte]

  return (
    <button
      type="button"
      onClick={onChoisir}
      className={cn(
        'group flex flex-col gap-[10px] rounded-[14px] border p-[15px] text-left transition-all duration-200',
        'hover:-translate-y-[2px] hover:shadow-[0_8px_20px_-10px_rgba(6,10,8,.35)]',
        choisi
          ? cn('border-[1.5px]', c.bord, c.fond, 'shadow-[0_8px_20px_-12px_rgba(6,10,8,.4)]')
          : 'border-km-line bg-white',
      )}
    >
      <div className="flex items-center gap-[10px]">
        <span className={cn(
          'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] transition-colors',
          choisi ? c.puce : 'bg-km-soft',
        )}>
          <Icone className={cn('h-[17px] w-[17px]', choisi ? 'text-white' : 'text-km-muted')} />
        </span>
        <span className={cn('flex-1 text-[13.5px] font-semibold', choisi ? 'text-km-text' : 'text-km-muted')}>
          {type.libelle}
        </span>
        {choisi && (
          <span className={cn('flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full', c.puce)}>
            <Check className="h-[10px] w-[10px] stroke-[3.6] text-white" />
          </span>
        )}
      </div>
      <span className="text-[11.5px] leading-snug text-km-faint">{type.quoi}</span>
    </button>
  )
}

const SAISIE = 'w-full rounded-[10px] border border-km-line bg-white px-[12px] py-[9px] text-[13.5px] text-km-text outline-none transition-shadow focus:border-km-green focus:shadow-[0_0_0_3px_rgba(13,122,95,.12)]'
const SAISIE_MONO = 'w-full rounded-[10px] border border-km-line bg-white px-[12px] py-[9px] font-mono text-[13px] text-km-text outline-none transition-shadow focus:border-km-green focus:shadow-[0_0_0_3px_rgba(13,122,95,.12)]'

function Champ({ intitule, children, className }: { intitule: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-[6px]', className)}>
      <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint">{intitule}</span>
      {children}
    </div>
  )
}

export function ParcoursCreationCompte({ onFermer }: { onFermer: () => void }) {
  const navigate = useNavigate()
  const creerCompte = useCreateCompte()
  const lireScore = useEllisphereScore()
  const { data: sites } = useSites()
  const { data: typesComptes } = useReferenceTable('types_comptes')

  const [etape, setEtape] = useState<string>('type')
  const [type, setType] = useState<TypeDeCompte | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  /* Étape 2 — la recherche et ce qu'elle a rempli. */
  const [recherche, setRecherche] = useState('')
  const [terme, setTerme] = useState('')
  const { data: resultats, isFetching: chercheEnCours, error: erreurRecherche } = useRechercheEllisphere(terme)
  /* L'ENTREPRISE RETENUE FAIT SE RÉTRACTER LA RECHERCHE. William, 24/09/2026 : « quand je clique
     sur un résultat, la barre de résultat se rétracte, me permettant d'avoir accès à l'ensemble des
     champs pré-remplis sans avoir besoin de scroller ». La barre et sa liste occupent près de
     250 px ; une fois le choix fait elles n'ont plus rien à dire, et cette hauteur est exactement
     celle qui manquait aux champs. */
  const [choisie, setChoisie] = useState<EllisphereCompany | null>(null)
  /* ══ LA LISTE NE VIT QUE SOUS LE CURSEUR ══
     William, 24/09/2026 : « elle doit s'afficher uniquement si je clique dans la barre de
     recherche. Après avoir sélectionné un résultat, elle doit se résorber. »
     Deux verrous plutôt qu'un : le choix la referme, et le fait de quitter le champ aussi. Une
     liste de suggestions qui reste ouverte après qu'on s'en est servi mange l'écran de ce qu'elle
     vient justement de remplir. */
  const [rechercheActive, setRechercheActive] = useState(false)
  const [nom, setNom] = useState('')
  const [siren, setSiren] = useState('')
  const [siret, setSiret] = useState('')
  const [codeNaf, setCodeNaf] = useState('')
  const [libelleApe, setLibelleApe] = useState('')
  const [rue, setRue] = useState('')
  const [codePostal, setCodePostal] = useState('')
  const [ville, setVille] = useState('')

  /* ── LE PARTENAIRE D'ORIGINE, demandé à l'étape 3 (voir le commentaire à l'écran) ── */
  const [vientDunPartenaire, setVientDunPartenaire] = useState(false)
  const [partenaireId, setPartenaireId] = useState('')
  const [contactPartenaireId, setContactPartenaireId] = useState('')
  const [creerContactPartenaire, setCreerContactPartenaire] = useState(false)
  /* LA MÊME SOURCE QUE LA FICHE COMPTE. `IdentiteCard` liste les partenaires exactement ainsi :
     deux façons de répondre à « qui sont les partenaires ? » finiraient par diverger. */
  const { data: comptesRattachables } = useComptesRattachables()
  const partenaires = useMemo(
    () => (comptesRattachables ?? []).filter((c) => c.type_compte === 'partenaire'),
    [comptesRattachables],
  )
  const { data: contactsDuPartenaire = [] } = useContactsParCompte(partenaireId || undefined)
  const partenaireChoisi = partenaires.find((p) => p.id === partenaireId) ?? null

  /* Étape 3 — le score, puis le compte créé. */
  const [compte, setCompte] = useState<Compte | null>(null)
  const [suite, setSuite] = useState<'choix' | 'contact' | 'compteur'>('choix')
  const [contactsCrees, setContactsCrees] = useState<string[]>([])
  const [compteursCrees, setCompteursCrees] = useState<string[]>([])

  /* 150 ms, et non 400 : assez pour ne pas tirer un appel facturé à chaque lettre, assez peu pour
     que la liste ait l'air de suivre les doigts. Voir `useRechercheEllisphere`. */
  useEffect(() => {
    const t = setTimeout(() => setTerme(recherche), 150)
    return () => clearTimeout(t)
  }, [recherche])

  // Le score se demande en arrivant à l'étape 3, une seule fois.
  useEffect(() => {
    if (etape !== 'score' || !siren || lireScore.data || lireScore.isPending) return
    lireScore.mutate(siren.replace(/\D/g, ''))
  }, [etape, siren, lireScore])

  const resumes: Record<string, ResumeEtape | undefined> = {
    /* RIEN SOUS « TYPE DE COMPTE » TANT QUE RIEN N'EST CHOISI — demande de William : le rail ne
       doit pas annoncer un choix qui n'a pas été fait. */
    type: { lignes: type ? [type.libelle, ...(type.consommateur ? ['Consommateur'] : [])] : [] },
    entreprise: { lignes: [nom, siren].filter(Boolean) },
    score: { lignes: compte ? ['Compte créé'] : lireScore.data?.score ? [`Score ${lireScore.data.score}`] : [] },
    suite: {
      lignes: [
        contactsCrees.length ? `${contactsCrees.length} contact${contactsCrees.length > 1 ? 's' : ''}` : '',
        compteursCrees.length ? `${compteursCrees.length} compteur${compteursCrees.length > 1 ? 's' : ''}` : '',
      ].filter(Boolean),
    },
  }

  /**
   * ══ UN CLIC, PAS DEUX ══
   *
   * William, 24/09/2026 : « je veux économiser un maximum de clics. Quand je clique sur Syndic de
   * copropriété, je veux que ça m'emmène directement sur la recherche Ellipro, pas besoin de
   * cliquer sur suivant. »
   *
   * Le choix d'un type n'a pas besoin d'être confirmé : il n'y a rien à ajuster ensuite sur cet
   * écran, et le rail montre aussitôt ce qui a été retenu. Un bouton « Continuer » ne servirait
   * qu'à faire dire deux fois la même chose.
   *
   * ET C'EST RÉVERSIBLE : le bouton « Précédent » de l'étape suivante ramène ici, carte toujours
   * cochée. C'est justement parce qu'on avance sans confirmer qu'il fallait que le retour soit
   * partout — un mauvais choix se corrige en un clic, lui aussi.
   */
  function choisirType(t: TypeDeCompte) {
    setType(t)
    setEtape('entreprise')
  }

  function choisirEntreprise(c: EllisphereCompany) {
    setChoisie(c)
    setRechercheActive(false)
    setNom(c.raisonSociale || c.nomCommercial || '')
    setSiren(c.siren ?? '')
    setSiret(c.siret ?? '')
    setCodeNaf(c.codeNAF ?? '')
    setLibelleApe(c.libelleAPE ?? '')
    setRue(c.rue ?? '')
    setCodePostal(c.codePostal ?? '')
    setVille(c.ville ?? '')
  }

  async function creer() {
    if (!type) return
    setErreur(null)
    try {
      const typeCompteId = (typesComptes ?? []).find(
        (t) => t.code === type.typeCompte.toUpperCase(),
      )?.id ?? null
      const { compte: cree } = await creerCompte.mutateAsync({
        segment: type.segment,
        typeCompte: type.typeCompte,
        typeCompteId,
        nom: nom.trim(),
        rue: rue.trim() || null,
        codePostal: codePostal.trim() || null,
        ville: ville.trim() || null,
        siret: siret.replace(/\D/g, '') || null,
        siren: siren.replace(/\D/g, '') || null,
        codeNaf: codeNaf.trim() || null,
        libelleApe: libelleApe.trim() || null,
        scoreEllipro: lireScore.data?.score ?? null,
        scoreElliproScale: lireScore.data?.scale ?? null,
        /* LE PARTENAIRE PART AVEC LE COMPTE, en une seule écriture. Le rattacher après coup, c'est
           ne jamais le rattacher : la preuve en est les 0 comptes renseignés sur 2 779 quand le
           champ n'existait que dans un dialogue. */
        apporteurPartenaireId: vientDunPartenaire && partenaireId ? partenaireId : null,
        contactPartenaireId: vientDunPartenaire && contactPartenaireId ? contactPartenaireId : null,
      })
      setCompte(cree)
      setEtape('suite')
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Création impossible.')
    }
  }

  function fermer() {
    onFermer()
    if (compte) navigate(`/comptes/${compte.id}`)
  }

  const railProps = {
    titre: nom.trim() || type?.libelle || 'Nouveau compte',
    etapes: ETAPES,
    resumes,
    onFermer: fermer,
  }

  /* ════════ ÉTAPE 4 · LES COMPTEURS, dans l'écran de saisie réemployé ════════ */
  if (etape === 'suite' && suite === 'compteur' && compte) {
    return (
      <FenetreParcours onFermer={fermer}>
        <RailParcours {...railProps} courante="suite" sousTitre="Les compteurs" />
        <PanneauParcours>
          <EnTeteEtape numero={4} total={4} titre="Les compteurs de ce compte" />
          <CreationCompteurDialog
            sansCadre
            unParUn
            open
            onClose={() => setSuite('choix')}
            compte={compte}
            sites={sites ?? []}
            libelleValidation="Terminer"
            onSaved={() => { /* le rail annonce lui-même */ }}
            onCompteurCree={(c) => setCompteursCrees((p) => [...p, c.numero_pdl])}
            onCrees={() => setSuite('choix')}
          />
        </PanneauParcours>
      </FenetreParcours>
    )
  }

  return (
    <FenetreParcours onFermer={fermer}>
      <RailParcours
        {...railProps}
        courante={etape}
        sousTitre={
          etape === 'type' ? 'Ce qu’il est'
          : etape === 'entreprise' ? 'Qui est-ce ?'
          : etape === 'score' ? (compte ? 'Créé' : 'Vérification')
          : 'Ce qu’on y attache'
        }
        note={
          etape === 'suite'
            ? { titre: 'Le compte existe', texte: 'Vous pouvez vous arrêter là et revenir plus tard.' }
            : { titre: 'Rien n’est écrit avant l’étape 3', texte: 'Vous pouvez fermer sans rien laisser derrière.' }
        }
      />

      <PanneauParcours>

        {/* ════════ ÉTAPE 1 · LE TYPE ════════ */}
        {etape === 'type' && (
          <>
            <EnTeteEtape numero={1} total={4} titre="Quel genre de compte créez-vous ?" />
            <div className="flex flex-col gap-[18px]">
              <div className="flex flex-col gap-[10px]">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-km-faint">
                  Consommateurs <span className="font-normal normal-case tracking-normal text-km-faint">— ceux qui achètent de l’énergie</span>
                </span>
                <div className="grid grid-cols-3 gap-[11px]">
                  {TYPES.filter((t) => t.consommateur).map((t) => (
                    <CarteType key={t.cle} type={t} choisi={type?.cle === t.cle} onChoisir={() => choisirType(t)} />
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-[10px]">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-km-faint">
                  Les autres <span className="font-normal normal-case tracking-normal text-km-faint">— ceux avec qui l’on travaille</span>
                </span>
                <div className="grid grid-cols-3 gap-[11px]">
                  {TYPES.filter((t) => !t.consommateur).map((t) => (
                    <CarteType key={t.cle} type={t} choisi={type?.cle === t.cle} onChoisir={() => choisirType(t)} />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-auto flex items-center gap-4 border-t border-km-line-soft pt-4">
              <span className="text-[11.5px] text-km-faint">
                Un clic suffit : le choix vous emmène directement à la recherche.
              </span>
              <span className="flex-1" />
              <Button variant="ghost" onClick={fermer}>Annuler</Button>
            </div>
          </>
        )}

        {/* ════════ ÉTAPE 2 · L'ENTREPRISE ════════ */}
        {etape === 'entreprise' && type && (
          <>
            <EnTeteEtape
              numero={2} total={4}
              titre={type.sansSiren ? 'Quelle copropriété ?' : 'Quelle entreprise ?'}
            />

            {/* UN SYNDIC BÉNÉVOLE N'A PAS DE SIREN : le chercher dans Ellisphere ne rendrait rien,
                et facturerait l'appel. On saisit son nom et son adresse, c'est tout ce qui existe. */}
            {!type.sansSiren && !choisie && (
              <div className="mb-[16px] flex flex-col gap-[8px]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-[12px] top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-km-faint" />
                  <input
                    autoFocus
                    value={recherche}
                    onChange={(e) => { setRecherche(e.target.value); setRechercheActive(true) }}
                    onFocus={() => setRechercheActive(true)}
                    /* Le délai laisse le clic sur une suggestion atteindre sa cible : sans lui, le
                       `blur` referme la liste avant que le bouton ne reçoive l'événement. */
                    onBlur={() => setTimeout(() => setRechercheActive(false), 150)}
                    placeholder="Raison sociale, SIREN ou SIRET…"
                    className={cn(SAISIE, 'py-[11px] pl-[36px] text-[14px]')}
                  />
                  {chercheEnCours && (
                    <Loader2 className="absolute right-[12px] top-1/2 h-[15px] w-[15px] -translate-y-1/2 animate-spin text-km-faint" />
                  )}
                </div>

                {erreurRecherche && (
                  <p className="text-[11.5px] text-km-red">
                    {erreurRecherche instanceof Error ? erreurRecherche.message : 'Recherche indisponible.'}
                  </p>
                )}

                {rechercheActive && terme.trim().length >= 3 && (resultats?.length ?? 0) > 0 && (
                  <div className="max-h-[188px] overflow-y-auto rounded-[11px] border border-km-line bg-white">
                    {resultats!.map((c) => (
                      <button
                        key={c.srcId ?? c.siret ?? c.siren ?? c.raisonSociale}
                        type="button"
                        onClick={() => choisirEntreprise(c)}
                        className="flex w-full flex-col gap-[2px] border-b border-km-line-soft px-[13px] py-[9px] text-left last:border-b-0 hover:bg-km-bg/60"
                      >
                        <span className="truncate text-[13px] font-semibold text-km-text">
                          {c.raisonSociale || c.nomCommercial}
                        </span>
                        <span className="truncate text-[11.5px] text-km-faint">
                          <span className="font-mono">{c.siren}</span>
                          {c.ville && ` · ${c.ville}`}
                          {c.libelleAPE && ` · ${c.libelleAPE}`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {rechercheActive && terme.trim().length >= 3 && !chercheEnCours && (resultats?.length ?? 0) === 0 && !erreurRecherche && (
                  <p className="text-[11.5px] text-km-faint">Aucune entreprise trouvée — complétez à la main ci-dessous.</p>
                )}
              </div>
            )}

            {choisie && (
              <div className="mb-[16px] flex items-center gap-[11px] rounded-[11px] border border-km-green-line bg-km-green-tint px-[13px] py-[10px]">
                <Check className="h-[15px] w-[15px] shrink-0 text-km-green" />
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-km-text">
                  Repris d’Ellisphere — <strong className="font-semibold">{choisie.raisonSociale || choisie.nomCommercial}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => { setChoisie(null); setRecherche(''); setTerme(''); setRechercheActive(true) }}
                  className="shrink-0 rounded-[8px] border border-km-green-line bg-white px-[11px] py-[5px] text-[11.5px] font-semibold text-km-green hover:bg-km-bg"
                >
                  Chercher une autre
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-[12px]">
              <Champ intitule="Raison sociale" className="col-span-2">
                <input value={nom} onChange={(e) => setNom(e.target.value)} className={SAISIE} />
              </Champ>
              {!type.sansSiren && (
                <>
                  <Champ intitule="SIREN">
                    <input value={siren} onChange={(e) => setSiren(e.target.value)} className={SAISIE_MONO} />
                  </Champ>
                  <Champ intitule="SIRET">
                    <input value={siret} onChange={(e) => setSiret(e.target.value)} className={SAISIE_MONO} />
                  </Champ>
                  <Champ intitule="Code NAF">
                    <input value={codeNaf} onChange={(e) => setCodeNaf(e.target.value)} className={SAISIE_MONO} />
                  </Champ>
                  <Champ intitule="Libellé APE">
                    <input value={libelleApe} onChange={(e) => setLibelleApe(e.target.value)} className={SAISIE} />
                  </Champ>
                </>
              )}
              <Champ intitule="Rue" className="col-span-2">
                <input value={rue} onChange={(e) => setRue(e.target.value)} className={SAISIE} />
              </Champ>
              <Champ intitule="Code postal">
                <input value={codePostal} onChange={(e) => setCodePostal(e.target.value)} className={SAISIE_MONO} />
              </Champ>
              <Champ intitule="Ville">
                <input value={ville} onChange={(e) => setVille(e.target.value)} className={SAISIE} />
              </Champ>
            </div>

            <div className="mt-auto flex items-center gap-4 border-t border-km-line-soft pt-4">
              <span className="text-[11.5px] text-km-faint">
                {type.sansSiren ? 'Aucun SIREN pour ce type — c’est normal.' : 'Vérifiez avant de continuer : ces champs viennent d’Ellisphere.'}
              </span>
              <span className="flex-1" />
              <Button variant="ghost" onClick={() => setEtape('type')}>Précédent</Button>
              <Button
                disabled={!nom.trim() || (!type.sansSiren && siren.replace(/\D/g, '').length !== 9)}
                onClick={() => setEtape('score')}
              >
                Continuer <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        )}

        {/* ════════ ÉTAPE 3 · LE SCORE, SUR TOUTE LA FENÊTRE ════════

            William, 24/09/2026 : « j'aimerais que l'affichage du score Ellipro prenne toute la
            popup. Je te laisse me proposer une organisation avec des éléments venus d'Ellipro qui
            pourraient avoir une valeur ajoutée dans la lecture. »

            CE QUI EST MONTRÉ VIENT DU MÊME RAPPORT, DÉJÀ PAYÉ. Le produit 50001 est commandé en
            entier depuis toujours ; on n'en gardait que la note et deux phrases. S'y ajoutent
            l'encours conseillé et l'historique des notes, sans un appel de plus.

            LA LECTURE SE FAIT EN TROIS TEMPS, de gauche à droite : le chiffre et sa position sur
            l'échelle ; ce qu'Ellisphere en dit ; qui est cette entreprise. C'est l'ordre dans
            lequel on décide — combien, pourquoi, et de qui parle-t-on.

            CE QUI MANQUE NE LAISSE PAS DE TROU : encours ou historique absents, leur bloc ne
            s'affiche pas. Un rapport pauvre donne un écran plus court, jamais un écran cassé. */}
        {/* CRÉER LE CONTACT MANQUANT SANS QUITTER LE PARCOURS.
            Naoëlle : « si le contact n'existe pas, il faut donner la possibilité de le créer ».
            Sortir d'ici pour aller le créer ailleurs, c'est perdre le compte en cours de saisie —
            la recherche Ellisphere, le score, tout serait à refaire. */}
        {etape === 'score' && creerContactPartenaire && partenaireChoisi && (
          <>
            <EnTeteEtape numero={3} total={4} titre={`Un contact chez ${partenaireChoisi.nom}`} />
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <ContactForm
                compteId={partenaireChoisi.id}
                compteNom={partenaireChoisi.nom}
                segment="Partenaire"
                submitLabel="Créer le contact"
                onCreated={(ct) => {
                  setContactPartenaireId(ct.id)
                  setCreerContactPartenaire(false)
                }}
                onCancel={() => setCreerContactPartenaire(false)}
              />
            </div>
          </>
        )}

        {etape === 'score' && type && !creerContactPartenaire && (
          <>
            <EnTeteEtape numero={3} total={4} titre="Ce qu’Ellisphere dit de cette entreprise" />

            {/* ════════ CE COMPTE VIENT-IL D'UN PARTENAIRE ? ════════

                Naoëlle, 25/09/2026 : « il faudrait ajouter au moment de la création de compte,
                dans tous les formulaires de création de compte, une option qui spécifie si ce
                compte doit être créé pour un partenaire ou géré par un partenaire ».

                ══ POURQUOI ICI, ET PAS À L'ÉTAPE 1 NI À L'ÉTAPE 4 ══

                À l'étape 1, un clic suffit et emmène directement à la recherche : y ajouter une
                question casserait ce mouvement. À l'étape 4, le compte est DÉJÀ créé — et un
                rattachement qui vient après coup ne se fait pas : la colonne `apporteur_partenaire_id`
                existait depuis des mois, modifiable dans un dialogue, et affichait 0 compte
                renseigné sur 2 779. Un champ qu'il faut aller chercher ne se remplit jamais.

                Ici, le compte n'est pas encore écrit : le partenaire part AVEC lui, en une seule
                écriture, et la question se pose au moment où le commercial connaît la réponse.

                ══ CE QUE LE RATTACHEMENT OUVRE, ET CE QU'IL NE CHANGE PAS ══

                `comptes_du_partenaire()` reconnaît `apporteur_partenaire_id` : le compte entre
                donc dans le périmètre du partenaire, qui le verra dans SON patrimoine.

                Pour les commerciaux, RIEN NE CHANGE : le compte reste un compte ordinaire, dans
                toutes les listes, sans filtre ni écran à part. Naoëlle : « même si ces comptes
                sont gérés et à la propriété d'un partenaire, que nos propres commerciaux puissent
                le voir dans tous les comptes ». C'est le cas — le rattachement AJOUTE un lecteur,
                il n'en retire aucun. Vérifié à l'écran avant livraison. */}
            {partenaires.length > 0 && (
              <div className="mb-[14px] rounded-[12px] border border-km-line bg-km-bg/40 p-[14px]">
                <label className="flex cursor-pointer items-start gap-[10px]">
                  <input
                    type="checkbox"
                    checked={vientDunPartenaire}
                    onChange={(e) => {
                      setVientDunPartenaire(e.target.checked)
                      if (!e.target.checked) { setPartenaireId(''); setContactPartenaireId('') }
                    }}
                    className="mt-[2px] h-[15px] w-[15px] shrink-0 accent-km-green"
                  />
                  <span className="flex flex-col gap-[2px]">
                    <span className="text-[13px] font-semibold text-km-text">
                      Ce compte vient d’un partenaire
                    </span>
                    <span className="text-[11.5px] leading-snug text-km-faint">
                      Il apparaîtra dans son espace, en plus de rester visible pour toute l’équipe.
                    </span>
                  </span>
                </label>

                {vientDunPartenaire && (
                  <div className="mt-[12px] flex flex-col gap-[10px] border-t border-km-line-soft pt-[12px]">
                    <div className="flex flex-col gap-[4px]">
                      <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-km-faint">
                        Lequel
                      </span>
                      <select
                        value={partenaireId}
                        onChange={(e) => { setPartenaireId(e.target.value); setContactPartenaireId('') }}
                        className="h-[32px] rounded-[8px] border border-km-line bg-white px-[9px] text-[13px] text-km-text outline-none focus:border-km-green"
                      >
                        <option value="">choisir un partenaire…</option>
                        {partenaires.map((p) => (
                          <option key={p.id} value={p.id}>{p.nom}</option>
                        ))}
                      </select>
                    </div>

                    {/* LE CONTACT CHEZ CE PARTENAIRE — qui suit l'affaire de leur côté.
                        S'il n'existe pas encore, on le crée sans quitter le parcours : sortir
                        d'ici pour aller créer un contact, c'est perdre le compte en cours. */}
                    {partenaireId && (
                      <div className="flex flex-col gap-[4px]">
                        <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-km-faint">
                          Qui le suit, chez eux
                        </span>
                        {contactsDuPartenaire.length > 0 ? (
                          <div className="flex items-center gap-[8px]">
                            <select
                              value={contactPartenaireId}
                              onChange={(e) => setContactPartenaireId(e.target.value)}
                              className="h-[32px] flex-1 rounded-[8px] border border-km-line bg-white px-[9px] text-[13px] text-km-text outline-none focus:border-km-green"
                            >
                              <option value="">aucun pour l’instant</option>
                              {contactsDuPartenaire.map((ct) => (
                                <option key={ct.id} value={ct.id}>
                                  {ct.prenom} {ct.nom}{ct.fonction ? ` — ${ct.fonction}` : ''}
                                </option>
                              ))}
                            </select>
                            <Button variant="ghost" onClick={() => setCreerContactPartenaire(true)}>
                              Nouveau
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-[8px]">
                            <span className="flex-1 text-[11.5px] leading-snug text-km-faint">
                              Ce partenaire n’a encore aucun contact.
                            </span>
                            <Button variant="ghost" onClick={() => setCreerContactPartenaire(true)}>
                              En créer un
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {type.sansSiren ? (
              <p className="rounded-[12px] border border-km-line bg-km-bg/40 px-[15px] py-[13px] text-[12.5px] leading-snug text-km-muted">
                Un syndic non professionnel n’a pas de SIREN : Ellisphere n’a rien à en dire, et
                c’est sans conséquence. Le compte se crée sans score.
              </p>
            ) : lireScore.isPending ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3">
                <Loader2 className="h-7 w-7 animate-spin text-km-green" />
                <p className="text-[13px] font-semibold text-km-text">Interrogation d’Ellisphere…</p>
              </div>
            ) : lireScore.data ? (
              /* TOUTE LA FENÊTRE POUR LA CARTE. William : « je veux que toutes les infos que tu
                 trouves pertinent à indiquer tiennent dans une grosse card Ellipro ». */
              <CarteEllipro donnees={lireScore.data} nom={nom} />
            ) : (
              <p className="rounded-[12px] border border-km-line bg-km-bg/40 px-[15px] py-[13px] text-[12.5px] leading-snug text-km-muted">
                Ellisphere n’a rien rendu pour ce SIREN. Le compte se crée quand même ; la note se
                redemandera depuis sa fiche.
              </p>
            )}

            {erreur && (
              <p className="mt-[12px] rounded-[10px] border border-km-red-line bg-km-red-soft px-[13px] py-[9px] text-[12.5px] text-red-700">
                {erreur}
              </p>
            )}

            <div className="mt-[14px] flex items-center gap-3 border-t border-km-line-soft pt-4">
              <span className="text-[11.5px] text-km-faint">
                Le score est enregistré avec le compte, et se rafraîchit ensuite depuis sa fiche.
              </span>
              <span className="flex-1" />
              <Button variant="ghost" onClick={() => setEtape('entreprise')}>Précédent</Button>
              {/* COCHÉ MAIS PAS RENSEIGNÉ : ON N'AVANCE PAS.
                  Laisser créer le compte ici l'écrirait SANS partenaire, alors que le commercial
                  vient d'affirmer qu'il en a un — et il faudrait retourner sur la fiche pour
                  réparer, c'est-à-dire ne jamais le faire. Le bouton dit ce qui manque. */}
              <Button
                disabled={creerCompte.isPending || (vientDunPartenaire && !partenaireId)}
                title={vientDunPartenaire && !partenaireId ? 'Choisissez le partenaire, ou décochez.' : undefined}
                onClick={() => void creer()}
              >
                {creerCompte.isPending
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Création…</>
                  : vientDunPartenaire && !partenaireId
                    ? 'Choisissez le partenaire'
                    : 'Créer le compte'}
              </Button>
            </div>
          </>
        )}

        {/* ════════ ÉTAPE 4 · CE QU'ON ATTACHE ════════ */}
        {etape === 'suite' && compte && suite === 'choix' && (
          <>
            <EnTeteEtape numero={4} total={4} titre={`${compte.nom} est créé`} />
            <p className="mb-[18px] text-[13px] leading-snug text-km-muted">
              Un compte seul ne sert à rien : il lui faut des gens à qui parler, et des compteurs à
              travailler. Faites-le maintenant, ou revenez plus tard depuis sa fiche.
            </p>

            <div className="grid grid-cols-2 gap-[12px]">
              <button
                type="button"
                onClick={() => setSuite('contact')}
                className="group flex flex-col gap-[10px] rounded-[14px] border border-km-line bg-white p-[17px] text-left transition-all duration-200 hover:-translate-y-[2px] hover:border-km-green hover:shadow-[0_8px_20px_-10px_rgba(6,10,8,.35)]"
              >
                <span className="flex h-[36px] w-[36px] items-center justify-center rounded-[10px] bg-km-soft transition-colors group-hover:bg-km-green">
                  <Users className="h-[18px] w-[18px] text-km-muted transition-colors group-hover:text-white" />
                </span>
                <span className="text-[14px] font-semibold text-km-text">Ajouter des contacts</span>
                <span className="text-[11.5px] leading-snug text-km-faint">
                  Les personnes à qui l’on parle. {contactsCrees.length > 0 && `${contactsCrees.length} déjà créé${contactsCrees.length > 1 ? 's' : ''}.`}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSuite('compteur')}
                className="group flex flex-col gap-[10px] rounded-[14px] border border-km-line bg-white p-[17px] text-left transition-all duration-200 hover:-translate-y-[2px] hover:border-km-green hover:shadow-[0_8px_20px_-10px_rgba(6,10,8,.35)]"
              >
                <span className="flex h-[36px] w-[36px] items-center justify-center rounded-[10px] bg-km-soft transition-colors group-hover:bg-km-green">
                  <Zap className="h-[18px] w-[18px] text-km-muted transition-colors group-hover:text-white" />
                </span>
                <span className="text-[14px] font-semibold text-km-text">Ajouter des compteurs</span>
                <span className="text-[11.5px] leading-snug text-km-faint">
                  Les points de livraison. {compteursCrees.length > 0 && `${compteursCrees.length} déjà créé${compteursCrees.length > 1 ? 's' : ''}.`}
                </span>
              </button>
            </div>

            <div className="mt-auto flex items-center gap-3 border-t border-km-line-soft pt-4">
              <span className="flex-1" />
              <Button onClick={fermer}>Terminer et ouvrir la fiche</Button>
            </div>
          </>
        )}

        {/* Le contact, dans le formulaire existant. */}
        {etape === 'suite' && compte && suite === 'contact' && (
          <>
            <EnTeteEtape numero={4} total={4} titre="Un contact pour ce compte" />
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <ContactForm
                compteId={compte.id}
                compteNom={compte.nom}
                segment={compte.segment}
                submitLabel="Créer le contact"
                onCreated={(c) => {
                  setContactsCrees((p) => [...p, `${c.prenom} ${c.nom}`])
                  setSuite('choix')
                }}
                onCancel={() => setSuite('choix')}
              />
            </div>
          </>
        )}
      </PanneauParcours>
    </FenetreParcours>
  )
}
