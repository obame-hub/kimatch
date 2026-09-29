import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChoixParRecherche } from '@/components/ui/choix-recherche'
import { CreationCompteurDialog, type BrouillonLot } from '@/components/compteur/CreationCompteurDialog'
import { MandatChainPrompt, type ChainedCompteur } from '@/components/compteur/MandatChainPrompt'
import {
  EnTeteEtape, FenetreParcours, PanneauParcours, RailParcours, useSortieParcours,
  type EtapeParcours, type ResumeEtape, type ElementRail,
} from '@/components/parcours/Parcours'
import { useComptes } from '@/lib/data/comptes'
import { useContacts } from '@/lib/data/contacts'
import { useSites } from '@/lib/data/sites'
import { contactsDuCompte as contactsRattaches } from '@/lib/contactsDuCompte'
import type { Compte } from '@/types/domain'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CRÉER UN COMPTEUR — LE PARCOURS À PART ENTIÈRE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 29/09/2026 : « on a déjà travaillé ce process comme une brique du process de conversion
 * d'une piste. J'aimerais que tu en fasses cette fois un process à part entière avec le même design.
 * Garde bien en tête qu'on peut créer soit manuellement (en notant toutes les datas) soit en
 * demandant l'extraction d'une facture, ce qui pré-remplit les champs. »
 *
 * ══ LA BRIQUE EST RÉEMPLOYÉE, PAS RECOPIÉE ══
 *
 * L'étape « Le compteur » EST `CreationCompteurDialog`, rendu sans sa propre fenêtre — exactement
 * comme dans la conversion d'une piste et dans la création d'un compte. Un quatrième formulaire de
 * PDL divergerait au premier réglage d'éligibilité, et c'est la cotation qui paierait l'écart.
 * Ce parcours ne fait que ce que la brique ne sait pas faire seule : trouver le compte, et dire la
 * suite.
 *
 * ══ PAS D'ÉCRAN « QUELLE MÉTHODE ? » ══
 *
 * William, 29/09/2026 : « pas besoin de choisir la méthode… À l'étape du compteur on propose de
 * déposer la facture. Toute facture déposée est lue, et ensuite au commercial de modifier certaines
 * infos s'il se rend compte qu'il y a des erreurs. S'il ne dépose pas de facture, pas de lecture, et
 * tous les éléments devront être renseignés à la main. » La méthode, c'est le geste : la zone de
 * dépôt du formulaire suffit à la dire.
 *
 * ══ TROIS ÉTAPES, DANS L'ORDRE OÙ L'ON CONNAÎT LES RÉPONSES ══
 *
 *   LE COMPTE      chez qui poser ce PDL. Passée d'elle-même quand on part d'une fiche : le compte
 *                  est celui de la fiche. On peut toujours y revenir pour en changer.
 *   LE COMPTEUR    le formulaire, avec sa zone de dépôt. Une facture déposée est lue et pré-remplit
 *                  les champs, que l'on corrige ; sans facture, on les saisit. « Ajouter un
 *                  compteur » en enregistre un et rend l'écran au suivant ; les précédents se
 *                  rangent dans le rail.
 *   ET ENSUITE     le mandat à envoyer, ou la fiche du compteur.
 *
 * ══ UNE FACTURE, UN COMPTEUR ══
 *
 * William, 29/09/2026 : « si j'en dépose 3, alors 3 compteurs sont pré-créés avec les infos extraites
 * et présents dans la barre latérale gauche sous "Le compteur" (qui se transforme alors en "Les
 * compteurs"). Au clic sur ces compteurs, j'atterris sur leur écran avec la facture liée
 * (visualisable en popup) et leurs données. » Le formulaire tient le lot (`lot`), ce parcours en
 * tient l'affichage : la liste du rail, et lequel est à l'écran. Ce sont des BROUILLONS — rien n'est
 * écrit avant « Créer les 3 compteurs », qui attend que tous soient complets.
 */

const etapes = (plusieurs: boolean): EtapeParcours[] => [
  { cle: 'compte', libelle: 'Le compte' },
  { cle: 'compteur', libelle: plusieurs ? 'Les compteurs' : 'Le compteur' },
  { cle: 'suite', libelle: 'Et ensuite' },
]

type CleEtape = 'compte' | 'compteur' | 'suite'

export function ParcoursCreationCompteur({ compteInitial, onFermer }: {
  /** Le compte de la fiche d'où l'on part, s'il y en a une. Présent, l'étape du compte est passée. */
  compteInitial?: { id: string; nom: string } | null
  onFermer: () => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { data: comptes } = useComptes()
  const { data: sites } = useSites()
  const { data: contacts } = useContacts()

  const [compteId, setCompteId] = useState(compteInitial?.id ?? '')
  const [etape, setEtape] = useState<CleEtape>(compteInitial ? 'compteur' : 'compte')
  const [crees, setCrees] = useState<ChainedCompteur[]>([])
  /* Chaque passage à l'étape du compteur remonte un formulaire neuf : changer de compte en revenant
     en arrière ne doit pas laisser l'ancienne saisie — ni l'ancienne facture — en place. */
  const [session, setSession] = useState(0)
  /* Le lot du formulaire, tel que le rail l'affiche, et le compteur à l'écran. */
  const [brouillons, setBrouillons] = useState<BrouillonLot[]>([])
  const [actif, setActif] = useState<string | null>(null)
  const plusieurs = brouillons.length > 1
  const ETAPES = etapes(plusieurs || crees.length > 1)

  /* LE COMPTE N'EST PAS UN FOURNISSEUR : c'est la règle du formulaire lui-même, reprise telle quelle
     pour que le compte proposé ici soit toujours un compte que la brique accepte. */
  const comptesPossibles = useMemo(
    () => (comptes ?? []).filter((c) => c.type_compte !== 'fournisseur'),
    [comptes],
  )
  const compte: Compte | undefined = comptesPossibles.find((c) => c.id === compteId)
  const nomCompte = compte?.nom ?? (compteInitial?.id === compteId ? compteInitial?.nom : undefined)

  /* ══ UNE NAVIGATION FERME LE PARCOURS ══
     La proposition de mandat mène à la création du mandat, sur une autre page. Le parcours est une
     fenêtre posée par-dessus toute l'application : sans ceci, il resterait ouvert au-dessus de la
     page où l'on vient d'arriver. */
  const cheminInitial = useRef(location.pathname)
  useEffect(() => {
    if (location.pathname !== cheminInitial.current) onFermer()
  }, [location.pathname, onFermer])

  function allerAuCompteur() {
    setBrouillons([])
    setActif(null)
    setSession((n) => n + 1)
    setEtape('compteur')
  }

  /* LA MÊME SORTIE QUE LE DIALOGUE : un seul compteur mène à sa fiche, plusieurs à celle du compte,
     qui les liste tous — en désigner un parmi quatre serait arbitraire. */
  function terminer() {
    onFermer()
    if (crees.length === 1) navigate(`/compteurs/${crees[0].id}`)
    else if (crees.length > 1 && compteId) navigate(`/comptes/${compteId}`)
  }

  /* ══ FERMER NE JETTE PAS UN LOT SANS PRÉVENIR ══
     William, 29/09/2026 : « demande une confirmation avant de fermer ». Trois factures lues, c'est
     trois lectures payées et autant de vérifications : on ne les perd plus d'un clic à côté.
     Seuls comptent les compteurs PAS ENCORE ENREGISTRÉS où quelque chose a été déposé ou saisi ;
     un formulaire vide se ferme sans question. Voir `useSortieParcours`. */
  const enAttente = etape === 'compteur' ? brouillons.filter((b) => b.statut !== 'saved' && b.entame) : []
  const n = enAttente.length
  const sortie = useSortieParcours({
    entame: n > 0,
    onFermer: () => (crees.length > 0 ? terminer() : onFermer()),
    titre: n > 1 ? `Fermer sans créer les ${n} compteurs ?` : 'Fermer sans créer le compteur ?',
    description: 'Rien n’est encore enregistré dans Kimatch.',
    lignes: [
      { perdu: true, texte: `${n > 1 ? `Les ${n} compteurs en cours seront perdus` : 'Le compteur en cours sera perdu'} — les factures lues comme les champs saisis.` },
      ...(crees.length > 0
        ? [{ texte: crees.length > 1 ? `Les ${crees.length} compteurs déjà créés restent en place.` : 'Le compteur déjà créé reste en place.' }]
        : []),
    ],
    libelleFermer: 'Fermer sans créer',
  })
  const demanderSortie = sortie.demander

  const cleActive = brouillons.some((b) => b.cle === actif) ? actif : brouillons[0]?.cle ?? null
  const rangActif = brouillons.findIndex((b) => b.cle === cleActive)

  const resumes: Record<string, ResumeEtape | undefined> = {
    compte: { lignes: nomCompte ? [nomCompte] : [] },
    /* PENDANT LA SAISIE, le lot — cliquable dès qu'il y a plus d'un compteur. UNE FOIS CRÉÉS, les
       numéros enregistrés, comme avant. */
    compteur: etape === 'compteur'
      ? { lignes: [], elements: plusieurs ? brouillons.map((b, i) => elementDuLot(b, i, b.cle === cleActive, () => setActif(b.cle))) : undefined }
      : { lignes: crees.map((c) => c.numero_pdl), mono: true },
    suite: { lignes: [] },
  }

  const numero = (cle: CleEtape) => ETAPES.findIndex((e) => e.cle === cle) + 1

  return (
    <FenetreParcours sortie={sortie}>
      <RailParcours
        titre={nomCompte ?? 'Nouveau compteur'}
        etapes={ETAPES}
        courante={etape}
        sousTitre={
          etape === 'compte' ? 'Chez qui ?'
          : etape === 'compteur' ? (plusieurs ? `${brouillons.length} compteurs, une facture chacun` : 'Facture ou saisie')
          : 'La suite'
        }
        resumes={resumes}
        note={
          crees.length > 0
            ? { titre: `${crees.length} compteur${crees.length > 1 ? 's' : ''} enregistré${crees.length > 1 ? 's' : ''}`, texte: 'Ils existent déjà : fermer ne les efface pas.' }
            : { titre: 'Rien n’est écrit avant l’enregistrement', texte: 'Vous pouvez fermer sans rien laisser derrière.' }
        }
        onFermer={demanderSortie}
      />

      <PanneauParcours>
        {/* ════════ ÉTAPE 1 · LE COMPTE ════════ */}
        {etape === 'compte' && (
          <>
            <EnTeteEtape numero={numero('compte')} total={ETAPES.length} titre="Pour quel compte ?" />
            <p className="mb-[14px] text-[13px] leading-snug text-km-muted">
              Le compteur et son libellé de site lui seront rattachés. Le site est retrouvé ou créé
              automatiquement à partir de l’adresse.
            </p>
            {/* Recherche et non liste déroulante : on ne fait pas défiler 2 700 comptes. */}
            <ChoixParRecherche<Compte>
              items={comptesPossibles}
              valeur={compteId}
              onChoisir={(c) => {
                setCompteId(c?.id ?? '')
                /* UN CLIC, COMME AILLEURS : choisir le compte mène au compteur. */
                if (c) allerAuCompteur()
              }}
              placeholder="Chercher un compte par son nom, son SIRET ou son SIREN…"
              principal={(c) => c.nom}
              secondaire={(c) => [c.ville, c.siret ? `SIRET ${c.siret}` : null].filter(Boolean).join(' · ') || null}
              filtre={(c, q) => c.nom.toLowerCase().includes(q) || (c.siret ?? '').includes(q) || (c.siren ?? '').includes(q)}
              totalLibelle={`${comptesPossibles.length} comptes`}
            />
            <div className="mt-auto flex items-center gap-4 border-t border-km-line-soft pt-4">
              <span className="text-[11.5px] text-km-faint">Choisir le compte vous emmène à l’étape suivante.</span>
              <span className="flex-1" />
              <Button variant="ghost" onClick={demanderSortie}>Annuler</Button>
            </div>
          </>
        )}

        {/* ════════ ÉTAPE 2 · LE COMPTEUR, DANS LA BRIQUE RÉEMPLOYÉE ════════ */}
        {etape === 'compteur' && compte && (
          <>
            <EnTeteEtape
              numero={numero('compteur')}
              total={ETAPES.length}
              titre={plusieurs ? `Compteur ${rangActif + 1} sur ${brouillons.length}` : 'Les données du compteur'}
            />
            <p className="mb-[14px] text-[13px] leading-snug text-km-muted">
              {/* LE COMPTE RESTE MODIFIABLE LÀ OÙ IL S'AFFICHE — règle de William. Parti d'une fiche,
                  on n'a pas vu l'étape du compte : c'est ici qu'on la retrouve. */}
              Pour <b className="font-semibold text-km-text">{compte.nom}</b>
              {' · '}
              <button type="button" onClick={() => setEtape('compte')} className="font-semibold text-km-green hover:underline">
                changer de compte
              </button>
              <br />
              Déposez une ou plusieurs factures : chacune devient un compteur, lu et pré-rempli, à
              corriger si besoin. Sans facture, vous renseignez les champs à la main.
            </p>
            <CreationCompteurDialog
              key={session}
              sansCadre
              unParUn
              open
              compte={compte}
              sites={sites ?? []}
              lot={{ actif: cleActive, onActif: setActif, onEtat: setBrouillons }}
              onSaved={() => { /* le rail annonce lui-même chaque compteur créé */ }}
              onCompteurCree={(c) => setCrees((p) => (p.some((x) => x.id === c.id) ? p : [...p, c]))}
              onCrees={(tous) => {
                setCrees((p) => [...p, ...tous.filter((c) => !p.some((x) => x.id === c.id))])
                setEtape('suite')
              }}
              /* « Fermer » du formulaire : on passe à la suite si des compteurs ont déjà été
                 enregistrés — ils existent, ne pas les montrer serait laisser croire qu'ils sont
                 perdus. Sinon, le parcours se ferme. */
              onClose={() => (crees.length > 0 && enAttente.length === 0 ? setEtape('suite') : demanderSortie())}
            />
          </>
        )}

        {/* ════════ ÉTAPE 3 · ET ENSUITE ════════ */}
        {etape === 'suite' && compte && (
          <>
            <EnTeteEtape
              numero={numero('suite')}
              total={ETAPES.length}
              titre={crees.length > 1 ? `${crees.length} compteurs créés` : 'Le compteur est créé'}
            />
            <ul className="mb-[18px] flex flex-col gap-[6px]">
              {crees.map((c) => (
                <li key={c.id} className="flex items-center gap-[10px] rounded-[10px] border border-km-line bg-km-bg/40 px-[12px] py-[9px]">
                  <span className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full bg-km-green">
                    <Check className="h-[11px] w-[11px] stroke-[3.4] text-white" />
                  </span>
                  <span className="font-mono text-[13px] font-semibold tabular-nums text-km-text">{c.numero_pdl}</span>
                </li>
              ))}
            </ul>
            {/* LE MANDAT, TOUT DE SUITE : c'est ce qui rend ces PDL cotables. La même proposition que
                le dialogue d'avant — un mandat par responsable. */}
            <MandatChainPrompt
              compteId={compte.id}
              compteNom={compte.nom}
              compteurs={crees}
              contacts={contactsRattaches(contacts, compte.id)}
              onDone={terminer}
            />
            <div className="mt-auto flex items-center gap-4 border-t border-km-line-soft pt-4">
              <span className="flex-1" />
              <Button
                variant="ghost"
                onClick={allerAuCompteur}
              >
                Créer un autre compteur
              </Button>
              <Button onClick={terminer}>
                {crees.length === 1 ? 'Ouvrir le compteur' : 'Ouvrir le compte'} <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        )}
      </PanneauParcours>
    </FenetreParcours>
  )
}

/* ══ UN COMPTEUR DU LOT, DANS LE RAIL ══
   Son PDL dès qu'il est lu — c'est ce qu'on reconnaît —, sinon son rang ; dessous, ce qu'il attend.
   La facture n'est nommée que tant qu'il n'y a rien d'autre à dire : un nom de fichier (« scan
   0042.pdf ») n'apprend rien quand on sait déjà ce qui manque. */
function elementDuLot(b: BrouillonLot, i: number, actif: boolean, onChoisir: () => void): ElementRail {
  const libelle = b.numeroPdl || `Compteur ${i + 1}`
  if (b.lecture === 'en_cours') return { cle: b.cle, libelle, detail: 'Lecture de la facture…', etat: 'lecture', actif, onChoisir }
  if (b.statut === 'error') return { cle: b.cle, libelle, detail: 'Non enregistré — à revoir', etat: 'erreur', actif, onChoisir }
  if (b.enDouble) return { cle: b.cle, libelle, detail: 'PDL en double dans le lot', etat: 'erreur', actif, onChoisir }
  if (b.manquants > 0) {
    return {
      cle: b.cle, libelle, etat: 'incomplet', actif, onChoisir,
      detail: `${b.manquants} champ${b.manquants > 1 ? 's' : ''} à renseigner${b.lecture === 'erreur' ? ' · facture illisible' : ''}`,
    }
  }
  return { cle: b.cle, libelle, detail: b.nomFichier ?? 'Saisi à la main', etat: 'complet', actif, onChoisir }
}
