import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, HeartPulse, PhoneCall, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  calculerSante, joignabiliteEcrit, joignabiliteTelephone,
  type Joignabilite, type SanteRelation, type SignalRelation,
} from '@/lib/santeRelation'
import { useQueryClient } from '@tanstack/react-query'
import { useAvisFiche, type EntreeAvis, type EvenementFil, type FicheDetaillee, type LignePipe } from '@/lib/data/cockpit'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES TROIS HÉROS DU FIL D'ACTIVITÉ
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 22/09/2026 : « plus 3 héros : le taux de joignabilité, un score de santé de la relation
 * construit à partir d'un algorithme, et un agent IA qui conseille quoi faire. »
 *
 * ══ ILS NE RÉPONDENT PAS À LA MÊME QUESTION, ET C'EST POURQUOI ILS SONT TROIS ══
 *
 *   JOIGNABILITÉ   est-ce que ce numéro sert ? — un fait, mesuré, sans interprétation
 *   RELATION       où en est-on avec lui ? — un jugement, explicité et contestable
 *   AVIS           qu'est-ce que je fais maintenant ? — une recommandation, datée du jour
 *
 * Le premier ne coûte rien, le deuxième se calcule sur place, le troisième demande un appel à
 * Anthropic — il part avec la fiche et met quelques secondes, ce qu'il annonce plutôt que de
 * laisser un vide qui ressemble à une panne.
 *
 * ══ LA MÊME GRAMMAIRE POUR LES TROIS ══
 *
 * Un squelette commun (`Carte`), et la MÊME JAUGE pour les deux qui mesurent un pourcentage. Ce
 * n'est pas de la coquetterie : trois dessins différents pour trois chiffres obligent à réapprendre
 * la lecture à chaque carte, et le sprint se regarde le combiné déjà en main.
 */
export function HerosFil({
  ligne,
  fiche,
  evenements,
}: {
  ligne: LignePipe
  fiche: FicheDetaillee | undefined
  evenements: EvenementFil[]
}) {
  const signaux = useMemo<SignalRelation[]>(
    () => evenements.map((e) => ({
      quand: e.quand,
      nature: e.nature,
      sens: e.sens,
      sentiment: e.sentiment,
      etiquettes: e.etiquettes,
      aura: e.aura,
      issue: e.issue,
      /* SANS RÉPONSE veut dire « personne n'a parlé » : ni le répondeur ni le serveur vocal ne
         comptent pour une conversation. Même définition que le compteur « abouti » du sprint.
         On lit `qualification` — c'est elle qui porte qui a décroché ; `interlocuteur` ne dit que
         CONTACT ou AUTRE, et seulement quand c'était un humain. */
      sansReponse: e.nature === 'APPEL'
        && (e.manque || e.messagerie
          || (e.qualification != null && e.qualification !== 'HUMAIN')),
    })),
    [evenements],
  )

  const telephone = useMemo(() => joignabiliteTelephone(signaux), [signaux])
  const ecrit = useMemo(() => joignabiliteEcrit(signaux), [signaux])
  const sante = useMemo(() => calculerSante(signaux), [signaux])

  /* ══ LES TROIS SUR UNE SEULE LIGNE, ET DE MÊME HAUTEUR (William, 22/09/2026) ══
     `items-stretch` est implicite en grille : les trois cartes prennent la hauteur de la plus
     grande. C'est ce qui permet au héros « Relation » d'être le plus haut sans laisser les deux
     autres flotter au-dessus du vide — ils remplissent, chacun à sa manière. */
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <HeroJoignabilite telephone={telephone} ecrit={ecrit} />
      <HeroRelation sante={sante} />
      <HeroAvis ligne={ligne} fiche={fiche} evenements={evenements} />
    </div>
  )
}

/**
 * ══ LES TROIS CARTES ONT LE MÊME SQUELETTE ══
 *
 * William, 22/09/2026 : « tu dois ré-harmoniser les héros pour qu'ils aient une complétude
 * égale ». Elles avaient chacune leur rythme — l'une trois lignes de texte, l'autre une jauge et
 * six lignes de légende — et la rangée se lisait comme trois blocs sans rapport.
 *
 *   EN-TÊTE   un pictogramme, un mot, toujours à la même hauteur
 *   CORPS      ce que la carte mesure, centré, qui occupe la place disponible
 *   PIED       une ligne de contexte, collée en bas par `mt-auto`
 */
function Carte({
  icone: Icone, libelle, accent, children, pied,
}: {
  icone: typeof PhoneCall
  libelle: string
  accent?: boolean
  children: React.ReactNode
  pied: React.ReactNode
}) {
  return (
    <div className={cn(
      /* PAS D'`overflow-hidden` ICI : les trois cartes prennent la hauteur de la plus haute, et un
         conseil un peu long dans un corps centré déborderait alors PAR LE HAUT, invisible et coupé
         net. La carte grandit, c'est tout — le glisseur et le panneau de survol posent leur propre
         découpe, là où elle sert vraiment. */
      'group/hero relative flex min-h-[11rem] flex-col rounded-km-lg border p-3.5',
      accent ? 'border-km-side-green/35 bg-km-side-green/8' : 'border-km-side-line bg-km-side',
    )}>
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icone className={cn('h-3 w-3 shrink-0', accent ? 'text-km-side-green' : 'text-km-side-faint')} aria-hidden="true" />
        <span className={cn(
          'truncate font-mono text-km-label font-semibold uppercase tracking-[0.12em]',
          accent ? 'text-km-side-green' : 'text-km-side-faint',
        )}>
          {libelle}
        </span>
      </div>
      {children}
      <div className="mt-auto pt-2 text-km-label leading-snug text-km-side-muted">{pied}</div>
    </div>
  )
}

/**
 * ══ LA JAUGE, PARTAGÉE PAR LES DEUX PREMIERS HÉROS ══
 *
 * William, 22/09/2026 : « le chiffre devient central », et « le plus important, c'est que tu fasses
 * quelque chose d'harmonieux ».
 *
 * LES DEUX CARTES MESURENT UN POURCENTAGE SUR CENT : les dessiner de deux façons différentes — une
 * barre à gauche, un arc au milieu — faisait de la rangée trois objets étrangers. Une seule forme,
 * répétée, et l'œil n'a plus qu'une grammaire à apprendre.
 *
 * LE CHIFFRE EST EN HTML, PAS EN `<text>` SVG. Mesuré dans le navigateur : un `<text>` rendait un
 * rectangle de 0 × 0 — présent dans le DOM, avec la bonne couleur et la bonne taille, et jamais
 * peint. Le SVG ne dessine plus que ce qu'il sait faire : l'arc.
 */
const RAYON = 46
const LONGUEUR = Math.PI * RAYON

function Jauge({
  valeur, couleur, suffixe, legende, detail, ariaLabel,
}: {
  /** 0 à 100, ou `null` quand la mesure n'existe pas — l'arc reste alors vide. */
  valeur: number | null
  couleur: string
  suffixe?: string
  legende: string
  /** La phrase qui explique le chiffre. Elle appartient à la tuile, pas au pied : sur un glisseur,
      elle change avec la vue — la laisser en pied obligeait à la tronquer pour loger les flèches. */
  detail?: string
  ariaLabel: string
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full max-w-[9.5rem]">
        {/* `block` ET NON L'`inline` PAR DÉFAUT : un SVG en ligne réserve sous lui la place du
            jambage d'une ligne de texte — quatre pixels de vide que le conteneur compte dans sa
            hauteur, et le chiffre calé sur `bottom-0` descendait d'autant, jusqu'à chevaucher
            l'arc. Vu en reconstruisant la rangée à la largeur réelle du volet. */}
        <svg viewBox="0 0 120 62" className="block w-full" role="img" aria-label={ariaLabel}>
          <path
            d={`M ${60 - RAYON} 56 A ${RAYON} ${RAYON} 0 0 1 ${60 + RAYON} 56`}
            fill="none" strokeWidth="7" strokeLinecap="round"
            style={{ stroke: 'rgb(var(--km-side-line))' }}
          />
          {valeur != null ? (
            <path
              d={`M ${60 - RAYON} 56 A ${RAYON} ${RAYON} 0 0 1 ${60 + RAYON} 56`}
              fill="none" strokeWidth="7" strokeLinecap="round"
              strokeDasharray={LONGUEUR}
              strokeDashoffset={LONGUEUR * (1 - Math.max(0, Math.min(100, valeur)) / 100)}
              style={{ stroke: `rgb(${couleur})`, transition: 'stroke-dashoffset 700ms cubic-bezier(.32,.72,0,1)' }}
            />
          ) : null}
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex items-baseline justify-center gap-0.5 leading-none">
          <span className="text-km-sprint font-bold tabular-nums tracking-tight" style={{ color: `rgb(${couleur})` }}>
            {valeur ?? '—'}
          </span>
          {valeur != null && suffixe ? (
            <span className="text-km-body font-semibold" style={{ color: `rgb(${couleur})` }}>{suffixe}</span>
          ) : null}
        </div>
      </div>
      <p className="mt-1 text-center text-km-name font-bold text-km-side-text">{legende}</p>
      {detail ? (
        <p className="mt-0.5 text-center text-km-label leading-snug text-km-side-muted">{detail}</p>
      ) : null}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   HÉROS 1 · LA JOIGNABILITÉ, PAR LES DEUX CANAUX
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

function HeroJoignabilite({ telephone, ecrit }: { telephone: Joignabilite; ecrit: Joignabilite }) {
  const [vue, setVue] = useState(0)

  /* LES SEUILS SONT CEUX DU MÉTIER. Au téléphone, en prospection syndic, un contact qu'on joint une
     fois sur trois est un bon numéro ; en dessous d'un sur cinq, c'est le numéro qu'il faut
     changer, pas l'heure. À l'écrit, on est plus exigeant : une adresse qui ne répond jamais est
     une adresse morte, et un mail sur quatre reste une relation vivante. */
  const ton = (t: number | null, bon: number, moyen: number) =>
    t == null ? 'var(--km-side-muted)'
    : t >= bon ? 'var(--km-side-green)'
    : t >= moyen ? 'var(--km-amber)'
    : 'var(--km-side-red)'

  const vues = [
    {
      cle: 'tel',
      legende: 'Au téléphone',
      v: telephone,
      couleur: ton(telephone.taux, 34, 20),
      detail: telephone.tentatives === 0
        ? 'Jamais appelé.'
        : `${telephone.retours} conversation${telephone.retours > 1 ? 's' : ''} sur ${telephone.tentatives} appel${telephone.tentatives > 1 ? 's' : ''}.`,
    },
    {
      cle: 'mail',
      legende: 'Par écrit',
      v: ecrit,
      couleur: ton(ecrit.taux, 40, 15),
      detail: ecrit.tentatives === 0
        ? 'Aucun mail envoyé.'
        : `${ecrit.retours} réponse${ecrit.retours > 1 ? 's' : ''} pour ${ecrit.tentatives} mail${ecrit.tentatives > 1 ? 's' : ''} envoyé${ecrit.tentatives > 1 ? 's' : ''}.`,
    },
  ]

  const precedent = () => setVue((v) => Math.max(0, v - 1))
  const suivant = () => setVue((v) => Math.min(vues.length - 1, v + 1))

  return (
    <Carte
      icone={PhoneCall}
      libelle="Joignabilité"
      pied={
        /* ══ LES FLÈCHES DISENT QUE ÇA GLISSE ══

           William, 22/09/2026 : « une flèche cliquable doit indiquer qu'on peut slide ».

           DEUX PASTILLES SEULES NE LE DISENT PAS : elles se lisent comme un état — « il y a deux
           choses » — et non comme une commande. Une flèche est la seule forme que personne n'a
           besoin d'apprendre. Elles restent DÉSACTIVÉES aux extrémités plutôt que de disparaître :
           un bouton qui s'efface fait sauter la mise en page à chaque glissement.

           LES PASTILLES RESTENT ENTRE LES DEUX, parce qu'elles disent où l'on est — ce que les
           flèches, elles, ne disent pas. */
        <div className="flex items-center justify-center gap-2">
          <Fleche sens="precedent" onClick={precedent} desactive={vue === 0} />
          <span className="flex items-center gap-1">
            {vues.map((x, i) => (
              <button
                key={x.cle}
                onClick={() => setVue(i)}
                aria-label={`Voir la joignabilité ${x.legende.toLowerCase()}`}
                aria-pressed={vue === i}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  vue === i ? 'w-4 bg-km-side-green' : 'w-1.5 bg-km-side-line hover:bg-km-side-muted',
                )}
              />
            ))}
          </span>
          <Fleche sens="suivant" onClick={suivant} desactive={vue === vues.length - 1} />
        </div>
      }
    >
      {/* DEUX PANNEAUX QUI GLISSENT, et non un seul qu'on remplace : le remplacement fait clignoter
          la carte, le glissement dit d'où l'on vient. La piste est en `flex` à 200 % de large et se
          translate d'une demi-largeur. La découpe est ici, et nulle part ailleurs. */}
      <div className="flex flex-1 flex-col justify-center overflow-hidden">
        <div
          className="flex w-[200%] transition-transform duration-500 [transition-timing-function:cubic-bezier(.32,.72,0,1)]"
          style={{ transform: `translateX(-${vue * 50}%)` }}
        >
          {vues.map((x, i) => (
            <div key={x.cle} className="w-1/2 shrink-0 px-1" aria-hidden={vue !== i}>
              <Jauge
                valeur={x.v.taux}
                couleur={x.couleur}
                suffixe="%"
                legende={x.legende}
                detail={x.detail}
                ariaLabel={`${x.legende} : ${x.v.taux == null ? 'aucune donnée' : `${x.v.taux} %`}`}
              />
            </div>
          ))}
        </div>
      </div>
    </Carte>
  )
}

/** Une flèche de glisseur : assez grande pour se cliquer, assez discrète pour ne pas voler l'œil. */
function Fleche({
  sens, onClick, desactive,
}: {
  sens: 'precedent' | 'suivant'
  onClick: () => void
  desactive: boolean
}) {
  const Icone = sens === 'precedent' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desactive}
      aria-label={sens === 'precedent' ? 'Vue précédente' : 'Vue suivante'}
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
        desactive
          ? 'cursor-default border-km-side-line/60 text-km-side-line'
          : 'border-km-side-line text-km-side-muted hover:border-km-side-green hover:text-km-side-green',
      )}
    >
      <Icone className="h-3 w-3" aria-hidden="true" />
    </button>
  )
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   HÉROS 2 · LA RELATION
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ LE SCORE D'ABORD, LE DÉTAIL AU SURVOL ══
 *
 * William, 22/09/2026 : « dans le héros relation le plus important c'est le score, le détail peut
 * s'afficher au survol ». La légende des preuves prenait six lignes sous la jauge et ramenait le
 * chiffre — la seule chose qu'on regarde en décrochant — à un élément parmi d'autres.
 *
 * LA BARRE DE PREUVES RESTE VISIBLE, elle : six pixels de haut, et elle dit d'un coup d'œil s'il y
 * a du rouge. C'est le détail chiffré qui passe au survol — et au FOCUS CLAVIER, sinon la carte
 * devient muette pour qui n'a pas de souris.
 *
 * ══ POURQUOI LA BARRE NE DOIT PAS MENTIR ══
 *
 * Le segment « à analyser » est hachuré, jamais un aplat gris : il ne pèse rien dans le calcul, et
 * un aplat le ferait passer pour un neutre. La différence entre « je ne sais pas » et « c'est
 * neutre » est exactement celle qui fausserait le score dans le sens le plus flatteur.
 */
function HeroRelation({ sante }: { sante: SanteRelation }) {
  const couleur =
    sante.score >= 62 ? 'var(--km-side-green)'
    : sante.score >= 45 ? 'var(--km-amber)'
    : 'var(--km-side-red)'

  const preuves = [
    { n: sante.positifs, couleur: 'var(--km-side-green)', libelle: sante.positifs > 1 ? 'positifs' : 'positif' },
    { n: sante.neutres, couleur: 'var(--km-side-muted)', libelle: sante.neutres > 1 ? 'neutres' : 'neutre' },
    { n: sante.negatifs, couleur: 'var(--km-side-red)', libelle: sante.negatifs > 1 ? 'négatifs' : 'négatif' },
  ]
  const totalPreuves = preuves.reduce((n, p) => n + p.n, 0) + sante.aAnalyser

  return (
    <Carte
      icone={HeartPulse}
      libelle="Relation"
      pied={
        /* LE PIED DIT LE TEMPS, PAS LE DÉTAIL. La consigne « survolez pour le détail » que j'avais
           mise là expliquait l'interface au lieu de dire quelque chose du contact — William l'a
           fait retirer, et il a raison : une carte qui s'explique elle-même n'a rien à dire. */
        sante.joursDepuisSignal == null
          ? 'Il ne nous a jamais répondu.'
          : sante.joursDepuisSignal === 0
            ? 'Un signe de lui aujourd’hui.'
            : sante.joursDepuisSignal > 90
              ? `Plus rien de lui depuis ${Math.round(sante.joursDepuisSignal / 30)} mois.`
              : `Dernier signe de lui il y a ${sante.joursDepuisSignal} jour${sante.joursDepuisSignal > 1 ? 's' : ''}.`
      }
    >
      <div className="flex flex-1 flex-col justify-center">
        <Jauge
          valeur={sante.score}
          couleur={couleur}
          legende={sante.etat}
          ariaLabel={`Score de relation : ${sante.score} sur 100, ${sante.etat}. ${sante.explication}`}
        />

        {/* LA BARRE DE PREUVES RESTE VISIBLE : six pixels, et elle dit d'un coup d'œil s'il y a du
            rouge. Le segment « à analyser » est HACHURÉ, jamais un aplat — il ne pèse rien dans le
            calcul, et un aplat le ferait passer pour un neutre. La différence entre « je ne sais
            pas » et « c'est neutre » est exactement celle qui flatterait le score. */}
        {totalPreuves > 0 ? (
          <div
            className="mt-2.5 flex h-1.5 w-full overflow-hidden rounded-full bg-km-side-line"
            tabIndex={0}
            role="img"
            aria-label={sante.explication}
          >
            {preuves.filter((p) => p.n > 0).map((p) => (
              <span key={p.libelle} style={{ flexGrow: p.n, backgroundColor: `rgb(${p.couleur})` }} />
            ))}
            {sante.aAnalyser > 0 ? (
              <span
                style={{
                  flexGrow: sante.aAnalyser,
                  backgroundImage:
                    'repeating-linear-gradient(45deg, rgb(var(--km-side-muted) / .45) 0 2px, transparent 2px 4px)',
                }}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ══ LE DÉTAIL, AU SURVOL, SUR UN FOND OBSCURCI ══

          William, 22/09/2026 : « au survol, il faut obscurcir le fond de 90 % pour que la lecture
          du contenu se fasse correctement ». Ma première version posait le panneau à 97 % — donc
          presque opaque, donc un changement de carte plutôt qu'un voile. À 90 %, la jauge reste
          devinable dessous : on comprend qu'on lit le DÉTAIL de ce qu'on regardait, et non autre
          chose. Le flou fait le reste du travail de lisibilité.

          IL S'OUVRE AUSSI AU FOCUS CLAVIER, sinon la carte devient muette pour qui n'a pas de
          souris — d'où le `tabIndex` sur la barre de preuves.

          IL EST POSÉ À L'INTÉRIEUR DE LA CARTE : le volet de droite défile, un panneau qui
          déborderait serait coupé net par son `overflow`. */}
      {totalPreuves > 0 ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-center gap-2 rounded-km-lg bg-km-side/90 p-3.5 opacity-0 backdrop-blur-[3px] transition-opacity duration-150 group-hover/hero:opacity-100 group-focus-within/hero:opacity-100">
          <span className="font-mono text-km-label font-semibold uppercase tracking-[0.12em] text-km-side-faint">
            Sur quoi repose ce {sante.score}
          </span>
          <ul className="grid gap-1 text-km-label">
            {preuves.filter((p) => p.n > 0).map((p) => (
              <li key={p.libelle} className="flex items-center gap-1.5 text-km-side-muted">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: `rgb(${p.couleur})` }} />
                <b className="font-semibold tabular-nums text-km-side-text">{p.n}</b> signal{p.n > 1 ? 'aux' : ''} {p.libelle}
              </li>
            ))}
            {sante.aAnalyser > 0 ? (
              <li className="flex items-center gap-1.5 text-km-side-faint">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-km-side-muted/60" />
                <b className="font-semibold tabular-nums">{sante.aAnalyser}</b> échange{sante.aAnalyser > 1 ? 's' : ''} sans valence
              </li>
            ) : null}
          </ul>
          <p className="text-km-label leading-snug text-km-side-muted">{sante.explication}</p>
        </div>
      ) : null}
    </Carte>
  )
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   HÉROS 3 · L'AVIS
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

function HeroAvis({
  ligne, fiche, evenements,
}: {
  ligne: LignePipe
  fiche: FicheDetaillee | undefined
  evenements: EvenementFil[]
}) {
  const qc = useQueryClient()

  const perimetre = ligne.cible_type === 'PISTE'
    ? (fiche?.nombre_coproprietes
      ? `${fiche.nombre_coproprietes} copropriétés, ${fiche.nombre_de_lots ?? '?'} lots (déclarés, sans facture)`
      : 'inconnu — aucune facture reçue')
    : (fiche?.compteurs?.length
      ? `${fiche.compteurs.length} compteurs, dont ${fiche.compteurs.filter((c) => c.est_client).length} déjà clients`
      : 'vide — aucun compteur rattaché')

  const entree = useMemo<EntreeAvis>(() => ({
    fiche: {
      type: ligne.cible_type,
      nom: ligne.nom_complet,
      societe: ligne.compte_nom,
      statut: fiche?.statut ?? null,
      perimetre,
      tache: ligne.tache_titre,
    },
    /* ON N'ENVOIE QUE CE QUI SE LIT — ni numéro, ni adresse, ni enregistrement. Le modèle n'a pas
       besoin des coordonnées pour dire s'il faut relancer, et ce qu'on n'envoie pas ne fuite pas. */
    echanges: evenements.map((e) => ({
      id: e.id,
      nature: e.nature,
      sens: e.sens,
      quand: e.quand,
      objet: e.objet,
      resume: e.resume,
      etiquettes: e.etiquettes,
      aura: e.aura,
      issue: e.issue,
    })),
  }), [ligne, fiche, perimetre, evenements])

  const avis = useAvisFiche(ligne, entree)

  /* ══ LE FIL SE RELIT UNE FOIS, APRÈS L'ANALYSE ══
     Le point d'entrée vient d'écrire les valences en base, et ce sont elles qui refont le score de
     la carte voisine. Sans cette relecture, « Relation » afficherait encore le chiffre d'avant.
     UNE SEULE FOIS : la clé de la requête porte le NOMBRE d'échanges, qui ne bouge pas à la
     relecture — c'est ce qui empêche la boucle. */
  const rendu = avis.data
  useEffect(() => {
    if (rendu) void qc.invalidateQueries({ queryKey: ['cockpit', 'fil'] })
  }, [rendu, qc])

  const corps = (() => {
    if (evenements.length === 0) {
      return <p className="text-km-body leading-snug text-km-side-muted">Rien à relire pour l’instant.</p>
    }
    if (avis.isPending || avis.isFetching) {
      return (
        <>
          <p className="text-km-body text-km-side-muted">
            Kimatch relit {evenements.length} échange{evenements.length > 1 ? 's' : ''}…
          </p>
          <div className="mt-2 h-1 w-full animate-pulse rounded-full bg-km-side-green/40" />
        </>
      )
    }
    /* ══ UNE PANNE N'EST PAS UN AVIS NÉGATIF ══
       William, 22/09/2026 : « si j'ai rien dans l'avis, il faut le mentionner plutôt qu'avoir un
       message d'erreur ». Une clé manquante sur le serveur n'apprend rien à quelqu'un qui est en
       train d'appeler, et le rouge lui fait croire que la FICHE a un problème. On dit simplement
       qu'il n'y a pas d'avis ; le détail technique reste dans l'infobulle, pour qui le cherche. */
    if (avis.isError) {
      return (
        <p className="text-km-body leading-snug text-km-side-muted" title={(avis.error as Error).message}>
          Pas d’avis disponible pour cette fiche.
        </p>
      )
    }
    if (rendu) {
      return (
        <>
          <p className="text-km-name font-bold leading-tight text-km-side-text">{rendu.titre}</p>
          <p className="mt-1 text-km-body leading-snug text-km-side-muted">{rendu.texte}</p>
          {rendu.risque ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-km-label leading-snug text-km-amber">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
              {rendu.risque}
            </p>
          ) : null}
        </>
      )
    }
    return <p className="text-km-body leading-snug text-km-side-muted">Rien de particulier à signaler.</p>
  })()

  return (
    <Carte
      icone={Sparkles}
      libelle="L’avis de Kimatch"
      accent
      pied={
        evenements.length === 0
          ? 'Le premier appel écrira la première ligne du fil.'
          : avis.isPending || avis.isFetching
            ? 'Quelques secondes.'
            : (
              <button
                onClick={() => void avis.refetch()}
                className="font-semibold text-km-side-green hover:underline"
              >
                {avis.isError ? 'Réessayer' : 'Relire le fil'}
              </button>
            )
      }
    >
      <div className="flex flex-1 flex-col justify-center">{corps}</div>
    </Carte>
  )
}
