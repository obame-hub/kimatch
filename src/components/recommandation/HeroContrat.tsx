import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, FileSignature } from 'lucide-react'
import { etatSignature } from '@/components/docusign/BlocSuiviDocusign'
import { etatEnveloppeContrat } from '@/lib/data/docusign'
import { cn } from '@/lib/utils'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE CONTRAT, TROISIÈME CELLULE DU HERO — ET SEULEMENT S'IL EXISTE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 18/09/2026 : « la place laissée par le hero de la proposition commerciale doit être
 * attribuée à un autre hero, celui du contrat. […] Il ne doit s'afficher qu'à partir du moment où
 * une demande de contrat a été faite et il doit afficher le statut de signature de ce contrat en
 * live. Si aucune demande de contrat n'a été faite, ce hero ne s'affiche juste pas. »
 *
 * Puis, sur la première version : « le design du hero sur le contrat doit d'ailleurs être bien
 * meilleur, améliore-le grandement. »
 *
 * ══ CE QUI N'ALLAIT PAS, ET CE QUI LE REMPLACE ══
 *
 * La première version empilait quatre lignes de texte de poids égal : un titre, une pastille, un
 * nom, une référence, une phrase. Cinq informations, aucune hiérarchie — donc rien à quoi
 * l'œil s'accroche, et un état de signature réduit à trois mots dans un coin alors que c'est LA
 * SEULE chose qu'on vient y chercher.
 *
 * LA SIGNATURE EST DONC DEVENUE UN PARCOURS, pas une étiquette. Quatre segments — préparé, envoyé,
 * ouvert, signé — remplis jusqu'où l'on en est. Un contrat ne se lit pas « il est à ENVOYE » : il se
 * lit « il en est là, il reste ça ». C'est la même idée que le chemin du dossier, à l'échelle d'une
 * cellule, et elle répond sans lecture à la question qu'on se pose vraiment : est-ce que ça avance ?
 *
 * LE RESTE SE RANGE DERRIÈRE. Le fournisseur en tête, gros, parce que c'est le nom du contrat. La
 * référence et la date en pied, petites, parce qu'on les cherche rarement mais qu'on ne pardonne pas
 * leur absence. Et un filet de couleur à gauche, qui donne l'état avant même qu'on ait lu un mot.
 *
 * ══ « EN LIVE » VEUT DIRE : ON DEMANDE À DOCUSIGN ══
 *
 * `contrats.statut_signature` n'est à jour que si la notification DocuSign est arrivée — et elle a
 * lâché deux fois, ce qui a fait lire « l'enveloppe n'a pas encore été envoyée » à Michel sur un
 * contrat que Marie avait signé (31/08/2026). Afficher cette colonne telle quelle serait afficher
 * une vérité parfois périmée, à l'endroit le plus visible de la fiche.
 *
 * La cellule interroge donc DocuSign à l'ouverture, exactement comme `BlocSuiviDocusign`. L'appel
 * est ÉVITÉ sur un état arrêté — signé, refusé, annulé : redemander l'état d'une enveloppe signée
 * est un appel pour rien, et c'est le cas de 15 des 17 enveloppes existantes. L'échec est
 * silencieux : la cellule garde ce que dit la base plutôt que de jeter une erreur au visage de
 * quelqu'un qui ouvrait la fiche pour autre chose.
 *
 * ══ IL REMPLACE LE BLOC « CE QUE CETTE RECOMMANDATION A PRODUIT » ══
 *
 * William, 18/09/2026 : « du coup le bloc "Contrat issu de cette recommandation" est inutile vu que
 * le hero existe. » Ce bloc vivait au milieu de la fiche et disait la même chose en moins bien :
 * pas d'état de signature, pas de mise à jour DocuSign, et il fallait faire défiler pour le trouver.
 * Les dossiers à plusieurs contrats — rares — sont annoncés ici et se déroulent au clic.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * ══ LA DURÉE SE CALCULE, ELLE NE SE LIT PAS ══
 *
 * `contrats.duree_mois` existe, et il est vide : 23 des 716 contrats issus d'une recommandation le
 * portent, soit 3 %. Les deux dates, elles, sont remplies sur les 716 — sans exception. Afficher la
 * colonne stockée aurait donc laissé la case vide 97 fois sur 100, pour une information que les
 * dates donnent à coup sûr.
 *
 * LE CALCUL PASSE PAR LES JOURS, pas par la différence de mois : un contrat du 01/01 au 31/12 fait
 * douze mois, mais `12 × (annéeFin − annéeDébut) + (moisFin − moisDébut)` en compte onze, parce que
 * le dernier jour n'est pas le premier du mois suivant. 364 jours divisés par la longueur moyenne
 * d'un mois donnent 11,96, qui s'arrondit juste.
 *
 * La colonne stockée reste le dernier recours, pour le cas — jamais observé — d'un contrat sans
 * dates.
 */
function dureeEnMois(debut: string | null, fin: string | null, stockee: number | null): number | null {
  if (debut && fin) {
    const d = new Date(debut).getTime()
    const f = new Date(fin).getTime()
    if (!Number.isNaN(d) && !Number.isNaN(f) && f > d) {
      const mois = Math.round((f - d) / 86_400_000 / 30.436_875)
      if (mois > 0) return mois
    }
  }
  return stockee ?? null
}

/** Les quatre temps d'une signature, dans l'ordre. L'index sert à remplir le parcours. */
const PARCOURS = ['BROUILLON', 'ENVOYE', 'CONSULTE', 'SIGNE'] as const

/** Les trois familles d'état : en cours (ambre), abouti (vert), arrêté (rouge). */
function famille(statut: string | null): 'attente' | 'signe' | 'arrete' {
  if (statut === 'SIGNE') return 'signe'
  if (statut === 'REFUSE' || statut === 'ANNULE') return 'arrete'
  return 'attente'
}

const TEINTES = {
  attente: {
    filet: 'bg-km-amber',
    pastille: 'border-km-amber/40 bg-km-amber-soft text-km-amber',
    segment: 'bg-km-amber',
    icone: 'text-km-amber',
  },
  signe: {
    filet: 'bg-km-green',
    pastille: 'border-km-green-line bg-km-green-soft text-km-green',
    segment: 'bg-km-green',
    icone: 'text-km-green',
  },
  arrete: {
    filet: 'bg-km-red',
    pastille: 'border-km-red-line bg-km-red-soft text-km-red',
    segment: 'bg-km-red',
    icone: 'text-km-red',
  },
} as const

export interface ContratDuHero {
  id: string
  fournisseur_nom: string
  reference_fournisseur: string | null
  date_debut: string | null
  date_fin: string | null
  duree_mois: number | null
  type_prix: string | null
  statut_signature: string | null
  date_envoi_signature: string | null
  date_signature: string | null
  docusign_envelope_id: string | null
  date_creation: string | null
}

export function HeroContrat({ contrats }: { contrats: ContratDuHero[] }) {
  /* LE PLUS RÉCENT FAIT FOI. Un dossier peut produire plusieurs contrats — 693 en ont un, quelques
     uns en ont deux — et c'est le dernier demandé qu'on suit. Les autres sont de l'historique, et
     l'onglet du compte les porte tous. */
  const contrat = [...contrats].sort((a, b) => (b.date_creation ?? '').localeCompare(a.date_creation ?? ''))[0] ?? null

  const [statutVivant, setStatutVivant] = useState<string | null>(null)
  const [signeLeVivant, setSigneLeVivant] = useState<string | null>(null)

  const statutBase = contrat?.statut_signature ?? null
  const enveloppe = contrat?.docusign_envelope_id ?? null
  const fige = ['SIGNE', 'REFUSE', 'ANNULE'].includes(statutBase ?? '')

  useEffect(() => {
    if (!contrat || !enveloppe || fige) return
    let vivant = true
    void etatEnveloppeContrat(contrat.id)
      .then((r) => {
        if (!vivant) return
        setStatutVivant(r.statut)
        setSigneLeVivant(r.signeLe)
      })
      /* Silencieux : voir l'en-tête. La cellule retombe sur ce que dit la base. */
      .catch(() => {})
    return () => { vivant = false }
  }, [contrat, enveloppe, fige])

  if (!contrat) return null

  const statut = statutVivant ?? statutBase
  const e = etatSignature(statut, contrat.date_envoi_signature, signeLeVivant ?? contrat.date_signature)
  const mois = dureeEnMois(contrat.date_debut, contrat.date_fin, contrat.duree_mois)
  const typePrix = contrat.type_prix?.trim() || null
  const t = TEINTES[famille(statut)]

  /* Jusqu'où le parcours est rempli. Un statut inconnu — ou absent, ce qui est le cas de 1 591
     contrats repris sans enveloppe — remplit le premier segment : la demande existe, c'est tout ce
     qu'on sait. Un refus ou une annulation remplit tout, en rouge : le parcours est fini, mal. */
  const atteint = famille(statut) === 'arrete'
    ? PARCOURS.length - 1
    : Math.max(0, PARCOURS.indexOf((statut ?? 'BROUILLON') as typeof PARCOURS[number]))

  return (
    <Link
      to={`/contrats/${contrat.id}`}
      title={e.detail || 'Ouvrir le contrat'}
      className="group/contrat relative flex min-h-[132px] flex-col justify-between gap-2.5 overflow-hidden rounded-km-lg border border-km-line bg-white py-[15px] pl-[21px] pr-[18px] transition-shadow hover:shadow-km-card"
    >
      {/* Le filet de couleur : l'état avant le premier mot lu. */}
      <span className={cn('absolute inset-y-0 left-0 w-[3px]', t.filet)} aria-hidden="true" />

      <div className="flex items-start gap-2">
        <FileSignature className={cn('mt-px h-[15px] w-[15px] shrink-0', t.icone)} />
        <span className="min-w-0 flex-1">
          <span className="block text-km-tiny font-extrabold uppercase tracking-[0.09em] text-km-faint">
            Contrat
          </span>
          <span className="mt-px block truncate text-km-name font-extrabold leading-tight text-km-text">
            {contrat.fournisseur_nom || 'Fournisseur non renseigné'}
          </span>
        </span>
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-km-faint transition-colors group-hover/contrat:text-km-green" />
      </div>

      {/* ══════════ CE QU'ON A SIGNÉ, ET POUR COMBIEN DE TEMPS ══════════

          William, 22/09/2026 : « dans le hero du contrat, il y a encore une large zone blanche.
          Utilise-la pour indiquer la durée, le fournisseur et le type de prix. »

          LE FOURNISSEUR N'EST PAS RÉPÉTÉ ICI : il est déjà le titre de la cellule, en gras, sous
          l'intitulé « Contrat » — c'est le nom du contrat, et le redire dix pixels plus bas ferait
          lire deux fois la même chose dans un cadre qui en fait 132 de haut. Restent les deux
          faits qui manquaient vraiment.

          DEUX COLONNES ET NON TROIS, pour la même raison, et un filet au-dessus : la bande se lit
          comme un pied de cartouche, pas comme une suite du titre.

          AUCUN PRIX N'Y FIGURE, et ce n'est pas un oubli : « ne jamais afficher de prix sur la
          recommandation » (William, 18/09/2026). Le TYPE de prix — Fixe, Marché, Indexé, ARENH —
          dit la nature du contrat sans en donner le montant. `contrats.prix_molecule_eur_mwh`
          existe à côté ; il reste dans la fiche contrat.

          CHAQUE CASE DIT « — » QUAND ELLE NE SAIT PAS, plutôt que de disparaître : 245 des 716
          contrats issus d'une recommandation n'ont pas de type de prix renseigné, et une bande qui
          change de forme d'une fiche à l'autre se relit à chaque ouverture. */}
      <dl className="flex items-stretch gap-3 border-t border-km-line-soft pt-2">
        <div className="min-w-0 flex-1">
          <dt className="text-km-tiny font-extrabold uppercase tracking-[0.09em] text-km-faint">Durée</dt>
          <dd
            className="mt-px truncate font-mono text-km-body font-bold tabular-nums text-km-text"
            title={
              contrat.date_debut && contrat.date_fin
                ? `Du ${new Date(contrat.date_debut).toLocaleDateString('fr-FR')} au ${new Date(contrat.date_fin).toLocaleDateString('fr-FR')}`
                : undefined
            }
          >
            {mois != null ? `${mois} mois` : <span className="font-sans font-medium text-km-faint">—</span>}
          </dd>
        </div>
        <div className="min-w-0 flex-1 border-l border-km-line-soft pl-3">
          <dt className="text-km-tiny font-extrabold uppercase tracking-[0.09em] text-km-faint">Type de prix</dt>
          <dd className="mt-px truncate text-km-body font-bold text-km-text" title={typePrix ?? undefined}>
            {typePrix ?? <span className="font-medium text-km-faint">—</span>}
          </dd>
        </div>
      </dl>

      {/* ══ LE PARCOURS DE SIGNATURE ══
          Quatre segments plutôt qu'une étiquette : un contrat ne se lit pas « il est à ENVOYÉ », il
          se lit « il en est là, il reste ça ». Les segments franchis prennent la couleur de l'état,
          les autres restent creux. */}
      <div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'shrink-0 rounded-km-pill border px-2 py-[2px] text-km-label font-bold',
              t.pastille,
            )}
          >
            {e.libelle}
          </span>
          {/* LA DATE DIT DEPUIS QUAND, et c'est elle qui décide s'il faut relancer. */}
          <span className="min-w-0 flex-1 truncate text-right text-km-label text-km-faint">
            {signeLeVivant ?? contrat.date_signature
              ? `signé le ${new Date((signeLeVivant ?? contrat.date_signature) as string).toLocaleDateString('fr-FR')}`
              : contrat.date_envoi_signature
                ? `envoyé le ${new Date(contrat.date_envoi_signature).toLocaleDateString('fr-FR')}`
                : contrat.reference_fournisseur || ''}
          </span>
        </div>

        <div className="mt-2 flex gap-1" aria-hidden="true">
          {PARCOURS.map((etape, i) => (
            <span
              key={etape}
              className={cn(
                'h-[3px] flex-1 rounded-full transition-colors',
                i <= atteint ? t.segment : 'bg-km-line',
              )}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-km-tiny font-semibold text-km-faint">
          <span>Préparé</span>
          <span>Envoyé</span>
          <span>Ouvert</span>
          <span>Signé</span>
        </div>
      </div>

      {contrats.length > 1 && (
        <span className="text-km-label text-km-faint">
          {contrats.length} contrats sur ce dossier — le plus récent est affiché.
        </span>
      )}
    </Link>
  )
}
