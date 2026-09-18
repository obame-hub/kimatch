import { Lock, Trash2, ExternalLink, ChevronDown } from 'lucide-react'
import {
  useMajDateSouhaitee,
  useMajStatutVersion,
  libelleOffre,
} from '@/lib/data/recommandations'
import { InlineField } from '@/components/ui/inline-field'
import { OffresDuFournisseur } from '@/components/recommandation/OffresDuFournisseur'
import { PropositionsFournisseur } from '@/components/recommandation/PropositionsFournisseur'
import { PropositionCommerciale } from '@/components/recommandation/PropositionCommerciale'
import { PastilleStatutConsultation } from '@/components/recommandation/PastilleStatutConsultation'
import { budgetAnnuelDeLOffre } from '@/components/recommandation/CarteOffreEtude'
import { cn } from '@/lib/utils'
import type { ReferenceRow } from '@/lib/data/referenceTables'
import type { Contact, Recommandation, VersionRecommandation, Optimisation, FournisseurConsulte, Compteur, OffreFournisseur } from '@/types/domain'

const MISE_EN_CONCURRENCE = 'MISE_EN_CONCURRENCE'

/**
 * ══════════ LE DÉTAIL DES PRIX EST MASQUÉ, PAS SUPPRIMÉ ══════════
 *
 * William, 18/09/2026 : « tous les champs ou prix actuellement présents sur Kimatch doivent être
 * masqués », et plus tôt le même jour : « il est impossible de connaître le montant d'une offre
 * […] le but ici est surtout de savoir ce qui est disponible, ce qui est en attente, ce qui ne
 * l'est pas encore ».
 *
 * LES CHIFFRES LUI DONNENT RAISON : 10 offres chiffrées sur 291, 11 lignes de prix dans toute la
 * base. Ce qui s'affichait ici était vide 97 fois sur 100.
 *
 * MAIS C'EST UN INTERRUPTEUR ET NON UNE SUPPRESSION, pour la raison qu'il a donnée lui-même :
 * « l'objet offre sera utile lorsqu'on aura câblé les fonctionnalités permettant d'intégrer les
 * prix directement dans Kimatch ». `OffresDuFournisseur` est l'écran de saisie d'Erwan — 619 lignes
 * qui gèrent les prix au MWh, l'abonnement, le TURPE, l'acheminement et la désignation de l'offre
 * retenue. Le supprimer pour coller au dessin ferait perdre une fonction, pas un ornement ; le jour
 * où les prix arrivent, ce mot repasse à `true` et tout revient tel quel.
 *
 * CE QUI EST PERDU EN ATTENDANT, ET QU'IL FAUT SAVOIR : c'était le seul chemin depuis la fiche pour
 * saisir un prix ou désigner l'offre retenue. Les deux restent possibles depuis le comparatif.
 */
const AFFICHER_LE_DETAIL_DES_PRIX = false

const TONS_STATUT_VERSION: Record<string, string> = {
  EN_CONSTRUCTION: 'border-km-line bg-km-soft text-km-muted',
  DISPONIBLE: 'border-km-green-line bg-km-green-soft text-km-green',
  CLOTUREE: 'border-km-line bg-white text-km-faint',
}

/**
 * L'OFFRE À LAQUELLE TOUTES LES AUTRES SE COMPARENT, sur l'ensemble de la cotation.
 *
 * Michel, 27/08/2026 : la référence est DÉSIGNÉE, pas calculée — « je décide que c'est sur cette
 * offre-là que je vais me baser pour faire le comparatif ». Elle peut être de n'importe quelle
 * nature, y compris l'offre en cours, qui est même le cas le plus fréquent.
 *
 * DEUX DÉFAUTS CORRIGÉS ICI. Avant, le repère était calculé DANS chaque fournisseur : c'était la
 * moins chère de SES offres. Donc (1) ce n'était pas un choix mais un calcul, et (2) chaque
 * fournisseur se comparait à un repère différent — deux offres côte à côte n'étaient pas mesurées à
 * la même aune, et rien ne le disait.
 *
 * LE REPLI RESTE LA MOINS CHÈRE DE TOUTE LA COTATION, tant qu'aucune référence n'est désignée : sans
 * lui, la colonne d'écart serait vide sur tous les dossiers existants. Mais il porte désormais sur
 * l'ensemble, donc il est au moins cohérent d'une offre à l'autre.
 *
 * ══ « LA MOINS CHÈRE » SE MESURE COMME LE BUDGET AFFICHÉ (03/09/2026) ══
 *
 * Le repli ne regardait que `montant_annuel_ht`, le total annuel saisi à la main sur l'offre. Or la
 * carte d'offre affiche ce total À DÉFAUT la somme de ses points de livraison — et c'est cette somme
 * que produit la modale de saisie des prix, qui ne remplit pas le total annuel. Une cotation entière
 * chiffrée point par point n'avait donc aucun repère, et la colonne d'écart restait vide partout.
 *
 * Les deux endroits mesurent désormais un budget de la même façon, celle de `budgetAnnuelDeLOffre` :
 * une seule définition de « la moins chère » pour toute l'application.
 */
function repereDeLaCotation(optimisation: Optimisation): OffreFournisseur | null {
  const toutes = optimisation.fournisseurs_consultes.flatMap((f) => f.offres)
  const designee = toutes.find((o) => o.est_offre_reference)
  if (designee) return designee
  return toutes
    .filter((o) => budgetAnnuelDeLOffre(o) != null)
    .reduce<OffreFournisseur | null>(
      (a, o) => (a == null || budgetAnnuelDeLOffre(o)! < budgetAnnuelDeLOffre(a)! ? o : a),
      null,
    )
}

/**
 * Détail de la version affichée : optimisations, offres reçues, et suivi des fournisseurs consultés.
 *
 * CE BLOC N'EST PAS DANS LA MAQUETTE, et il est gardé volontairement. Le design s'arrête au
 * comparatif, qui compare des versions mais ne dit rien de la mise en concurrence : qui a été
 * consulté, où en est chacun, quelle offre est arrivée. C'est la matière même d'une cotation, et
 * c'est le seul endroit de l'application où l'on peut enregistrer un suivi de consultation. Le
 * supprimer pour coller au dessin ferait perdre une fonction, pas un ornement.
 *
 * Il est simplement resserré sur LA version affichée, au lieu de dérouler toutes les versions les
 * unes sous les autres comme avant le portage.
 */
export function DetailVersion({
  reco,
  version,
  statutsVersions,
  onAjouterFournisseur,
  onChangerStatut,
  statutsConsultation,
  compteurs,
  typeDocumentOffreId,
  peutModifier,
  signaler,
  onSupprimer,
  contactSignataire,
  typeDocumentPropositionId,
  onPresentationEnvoyee,
}: {
  /** Le dossier, pour l'e-mail au client : son compte, son nom, son identifiant. */
  reco: Recommandation
  version: VersionRecommandation
  statutsVersions: ReferenceRow[]
  onAjouterFournisseur: (optimisation: Optimisation) => void
  /** Change le statut de la demande, en enregistrant un événement de suivi daté. */
  onChangerStatut: (fc: FournisseurConsulte, statutId: string) => void
  statutsConsultation: ReferenceRow[]
  /** Les compteurs du périmètre, pour la saisie des prix par PDL. */
  compteurs: Compteur[]
  typeDocumentOffreId: string | null
  peutModifier: boolean
  signaler: (message: string) => void
  /** Ouvre la confirmation de suppression, tenue par la fiche : elle sait ce qui va être perdu. */
  onSupprimer: () => void
  /** Le destinataire de la proposition commerciale. */
  contactSignataire: Contact | null | undefined
  typeDocumentPropositionId: string | null
  /** Date la présentation au client quand la proposition part — voir `PropositionCommerciale`. */
  onPresentationEnvoyee: () => void
}) {
  const statutLabel = statutsVersions.find((s) => s.code === version.statut)?.libelle ?? version.statut

  /* ══ LE STATUT DE VERSION, CORRIGEABLE À LA MAIN ══
     Michel, 27/08/2026 : « il faut rendre les statuts de version manuels car il y a eu trop de bugs
     à l'import Salesforce ». Depuis que le Pricing écarte les versions au statut terminal, un statut
     faux hérité de la reprise fait disparaître une consultation de l'écran — il faut donc pouvoir
     le rattraper. Voir useMajStatutVersion. */
  const majStatut = useMajStatutVersion()
  const majDateSouhaitee = useMajDateSouhaitee()

  const estClose = version.statut === 'CLOTUREE'

  /**
   * Le délai jusqu'à la livraison souhaitée, dit en français.
   *
   * MIDI PLUTÔT QUE MINUIT pour comparer : une date ISO se lit à 00:00 UTC, donc en France une
   * livraison « aujourd'hui » se trouvait déjà dans le passé dès 2 h du matin — et s'affichait
   * « en retard d'un jour » alors qu'on avait la journée devant soi.
   */
  const delaiLivraison = (() => {
    if (!version.date_souhaitee) return null
    const cible = new Date(String(version.date_souhaitee).slice(0, 10) + 'T12:00:00')
    const aujourdhui = new Date()
    aujourdhui.setHours(12, 0, 0, 0)
    const jours = Math.round((cible.getTime() - aujourdhui.getTime()) / 86_400_000)
    if (jours === 0) return "aujourd'hui"
    if (jours === 1) return 'demain'
    if (jours > 1) return `dans ${jours} jours`
    if (jours === -1) return 'hier'
    return `en retard de ${-jours} jours`
  })()

  /**
   * ══════════ « TOUT EST LÀ — ON PASSE EN DISPONIBLE ? » ══════════
   *
   * William, 18/09/2026 : « c'est la version qui est "Disponible" une fois que toutes les offres
   * sont reçues ».
   *
   * IL A DEMANDÉ QUE CE SOIT PROPOSÉ, PAS IMPOSÉ — sa réponse à la question posée le même jour. Le
   * basculement automatique aurait été plus simple à écrire et faux : une version peut n'attendre
   * que deux fournisseurs sur cinq, les trois autres ayant refusé, et c'est Erwan qui sait si la
   * consultation est finie. Kimatch constate, Erwan décide.
   *
   * CE QUI COMPTE COMME « FINI » : plus aucun fournisseur en attente. Un refus est une réponse — il
   * libère de l'attente au même titre qu'une proposition reçue, sinon un seul fournisseur muet
   * empêcherait à jamais l'invite d'apparaître. Mais il faut au moins une proposition : une version
   * dont tous les fournisseurs ont refusé n'a rien à rendre disponible.
   */
  const consultes = version.optimisations.flatMap((o) => o.fournisseurs_consultes)
  const enAttente = consultes.filter((fc) => fc.statut_code !== 'DISPONIBLE' && fc.statut_code !== 'REFUSEE')
  const recues = consultes.filter((fc) => fc.statut_code === 'DISPONIBLE')
  const proposerDisponible =
    peutModifier && version.statut === 'EN_CONSTRUCTION' && enAttente.length === 0 && recues.length > 0

  const changerStatutVersion = async (code: string) => {
    const cible = statutsVersions.find((st) => st.code === code)
    // Les tables de référence ont un repli local dont les identifiants ne sont PAS des UUID ('1',
    // 'd1'…). Écrire avec l'un d'eux échoue en base tout en paraissant réussir à l'écran : on
    // refuse donc explicitement au lieu de laisser croire à une correction enregistrée.
    if (!cible || !/^[0-9a-f-]{36}$/i.test(cible.id)) {
      signaler('Statuts de version indisponibles — rechargez la page avant de corriger.')
      return
    }
    try {
      await majStatut.mutateAsync({ versionId: version.id, statutVersionId: cible.id })
      signaler(`✓ Statut de la version : ${cible.libelle}`)
    } catch (e) {
      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="rounded-[13px] border border-km-line bg-white">
      {/* ══════════════════════════════════════════════════════════════════════════════════════
          L'EN-TÊTE DE LA VERSION, TEL QUE LA MAQUETTE L'ARRÊTE

          William, 18/09/2026 : « je veux un bloc version exactement comme sur ta maquette, tous les
          champs ou prix actuellement présents sur Kimatch doivent être masqués ».

          CINQ CHOSES SEULEMENT : quel numéro, si c'est celle sur laquelle on travaille, où elle en
          est, et pour quand elle est attendue. Ce qui est parti — « Détail de version 2 », le badge
          « Actuelle » en double du mot « active », l'icône de calendrier — nommait le bloc au lieu
          de renseigner. Un en-tête qui commence par dire ce qu'il est prend la place de ce qu'il dit.
          ══════════════════════════════════════════════════════════════════════════════════════ */}
      {/* ══ UN FOND POUR DÉTACHER L'EN-TÊTE DU RESTE DE LA FICHE ══
          William, 18/09/2026 : « j'ajouterai un fond à l'en-tête du bloc version afin qu'il se
          dissocie bien du reste de la fiche ».

          LA FICHE EST DEVENUE UNE SUITE DE CARTES BLANCHES sur fond clair — le chemin, le hero, la
          version. Toutes de la même matière, elles se lisaient comme une seule surface, et l'en-tête
          de la version ne signalait plus qu'on entrait dans autre chose.

          LE FOND VA D'UN GRIS À DU BLANC, pas d'un gris plein : un aplat aurait pesé autant que la
          grille des fournisseurs qu'il annonce. Le dégradé donne un bord franc en haut, là où la
          carte commence, et se dissout vers le bas, là où le contenu prend la main. Le filet
          inférieur ferme la bande. */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-t-[13px] border-b border-km-line bg-gradient-to-b from-km-soft to-white px-[17px] py-3">
        <span className="rounded-km-pill bg-km-amber-soft px-2 py-[2px] text-km-label font-extrabold text-[#8a4b2a]">
          Version {version.numero_version ?? ''}
        </span>
        <span className="text-km-body font-extrabold text-km-text">
          {version.version_actuelle ? 'Version active' : 'Version archivée'}
        </span>
        {version.est_figee && (
          <span title="Version figée">
            <Lock className="h-3 w-3 text-km-faint" />
          </span>
        )}

        {/* ══ LE STATUT DE LA VERSION EST LE BOUTON ══

            Il s'écrivait « Corriger le statut », en gris et en petit : un outil de rattrapage
            d'import, pas un état. C'était juste tant que le rail du cycle de vie portait le statut
            en tête de fiche — le répéter ici « embrouillait », disaient Michel et Naoëlle le
            28/08/2026.

            LE RAIL EST PARTI le 18/09/2026 (« le cycle de recommandation est calculé
            automatiquement il doit donc être masqué »). Leur objection tombe avec lui : il n'y a
            plus de doublon, il y a un seul endroit — et c'est le bon, puisque le statut de version
            est le seul des deux qui se pose à la main.

            TROIS STATUTS, PAS TREIZE. Le repli garde quand même le statut courant en tête de liste
            pour les versions d'avant qui en portent un autre : sans lui, la liste s'ouvrirait sur
            une autre valeur et le premier clic écraserait le statut sans que personne l'ait
            demandé. */}
        {peutModifier ? (
          <span
            className={cn(
              'relative inline-flex items-center gap-1 rounded-km-pill border px-2.5 py-[3px] text-km-body font-bold transition-colors',
              TONS_STATUT_VERSION[version.statut ?? ''] ?? 'border-km-line bg-km-soft text-km-muted',
              !majStatut.isPending && 'cursor-pointer hover:brightness-[.97]',
            )}
          >
            <span className="inline-flex items-center gap-1">
              {majStatut.isPending ? 'Enregistrement…' : statutLabel}
              <ChevronDown className="h-2.5 w-2.5 opacity-70" />
            </span>
            <select
              aria-label="Statut de cette version"
              value={version.statut ?? ''}
              disabled={majStatut.isPending}
              onChange={(e) => changerStatutVersion(e.target.value)}
              className="absolute inset-0 w-full cursor-pointer opacity-0"
            >
              {!statutsVersions.some((st) => st.code === version.statut) && version.statut && (
                <option value={version.statut}>{statutLabel}</option>
              )}
              {statutsVersions.map((st) => (
                <option key={st.id} value={st.code ?? ''}>
                  {st.libelle}
                </option>
              ))}
            </select>
          </span>
        ) : (
          <span
            className={cn(
              'inline-flex items-center rounded-km-pill border px-2.5 py-[3px] text-km-body font-bold',
              TONS_STATUT_VERSION[version.statut ?? ''] ?? 'border-km-line bg-km-soft text-km-muted',
            )}
          >
            {statutLabel}
          </span>
        )}

        <span className="flex-1" />

        {/* ══ LA LIVRAISON SOUHAITÉE, AVEC SON DÉLAI ══

            La date seule oblige à compter mentalement — et c'est justement cette date qui décide de
            l'ordre du travail d'Erwan. « dans 3 jours » et « en retard de 5 jours » se lisent sans
            calcul ; la date reste devant pour qui veut la donner au téléphone.

            ══ ET ELLE SE MODIFIE ══
            William, 18/09/2026 : « elle doit être modifiable, même lorsque la version est déjà
            créée ». Elle ne se saisissait qu'au formulaire de création, où elle était facultative :
            une date oubliée était perdue pour toujours, et 153 versions sur 2 104 n'en portent
            aucune. Elle s'affiche donc même vide, en pointillés — un champ qu'on ne peut remplir que
            s'il est déjà rempli ne sert à personne. */}
        <span className="text-km-tiny font-extrabold uppercase tracking-[0.09em] text-km-faint">
          Livraison souhaitée
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-km-pill border px-2 py-[2px] text-km-label font-bold',
            version.date_souhaitee
              ? 'border-km-amber/40 bg-km-amber-soft text-[#8a4b2a]'
              : 'border-dashed border-km-line text-km-faint',
          )}
        >
          <InlineField
            variant="date"
            label=""
            emptyLabel="à définir"
            className="inline-flex"
            value={version.date_souhaitee ? String(version.date_souhaitee).slice(0, 10) : null}
            disabled={!peutModifier}
            onCommit={(v) => majDateSouhaitee.mutateAsync({ versionId: version.id, date: v })}
            onSaved={() => signaler('✓ enregistré')}
            onError={(e: Error) => signaler(`Erreur : ${e.message}`)}
          />
          {delaiLivraison && <span className="whitespace-nowrap">· {delaiLivraison}</span>}
        </span>

        {/* ══ LE BOUTON « CLÔTURER » EST RETIRÉ (William, 18/09/2026) ══

            « Inutile d'avoir le bouton Clôturer puisque le changement de statut permet de faire la
            même chose. »

            IL A RAISON DEPUIS CE MATIN, ET PAS AVANT. Quand ce bouton est né le 15/09/2026, le
            statut de version ne s'atteignait que par un menu « Corriger le statut » — un outil de
            rattrapage d'import, écrit en gris, qui ne disait pas qu'il servait aussi à ranger une
            version morte. Le bouton était la seule porte qui le disait.

            Le statut est devenu la pastille de l'en-tête, en couleur et en un clic : poser
            « Clôturée » se voit et se fait au même endroit que les deux autres statuts. Deux gestes
            pour un même changement, c'est un de trop — et c'est l'argument que Naoëlle avait déjà
            opposé à « Étape suivante » le 31/08/2026.

            CE QU'ON PERD, ET POURQUOI C'EST ACCEPTABLE : `useCloturerVersion` enregistrait un
            RÉSULTAT (expirée, remplacée) que le simple changement de statut ne pose pas. Ce résultat
            n'était affiché nulle part, et la création d'une nouvelle version continue de le poser
            elle-même sur la version qu'elle remplace — le seul chemin par lequel il était vraiment
            renseigné. */}
        {/* Supprimer une version créée par erreur (demande de la réunion du 17/08/2026). Discret et
            à droite : c'est un geste de rattrapage, pas une action courante. */}
        {peutModifier && (
          <button
            type="button"
            onClick={onSupprimer}
            title="Supprimer cette version"
            className="rounded-km-sm p-1 text-km-faint hover:bg-km-red-soft hover:text-km-red"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {proposerDisponible && (
        <div className="mx-[15px] mt-3 flex flex-wrap items-center gap-2.5 rounded-km border border-km-green-line bg-km-green-soft px-3 py-2">
          <span className="min-w-[200px] flex-1 text-km-body font-semibold text-km-green">
            Les {recues.length} proposition{recues.length > 1 ? 's sont' : ' est'} arrivée
            {recues.length > 1 ? 's' : ''} et plus personne n'est attendu — passer la version en
            « Disponible » ?
          </span>
          <button
            type="button"
            onClick={() => changerStatutVersion('DISPONIBLE')}
            disabled={majStatut.isPending}
            className="shrink-0 rounded-km-sm bg-km-green px-3 py-1.5 text-km-body font-bold text-white hover:brightness-110 disabled:opacity-60"
          >
            Passer en Disponible
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════════════════
          LA VERSION SE LIT EN UNE GRILLE DE FOURNISSEURS

          William, 18/09/2026 : « le but ici est surtout de savoir ce qui est disponible, ce qui est
          en attente, ce qui ne l'est pas encore ».

          ══ CE QUI ÉTAIT EMPILÉ ICI, ET POURQUOI C'ÉTAIT ILLISIBLE ══

          Une liste verticale : l'optimisation, son gain estimé, puis chaque fournisseur sur toute
          la largeur avec en dessous le détail de ses offres, leurs budgets, leurs prix au MWh.
          Quatre fournisseurs remplissaient deux écrans, et répondre à « qui manque ? » demandait de
          faire défiler en retenant les statuts au passage.

          En grille, quatre cartes tiennent côte à côte et la réponse se lit d'un coup d'œil : les
          vertes sont arrivées, les autres non.

          ══ LES PRIX NE SONT PAS SUPPRIMÉS, ILS SONT REPLIÉS ══

          « Il est impossible de connaître le montant d'une offre » — et les chiffres lui donnent
          raison : 10 offres chiffrées sur 291, 11 lignes de prix dans toute la base. Les afficher en
          permanence, c'était donner la première place à une colonne vide dans 97 % des cas.

          Mais la saisie existe et Erwan s'en sert : `OffresDuFournisseur` reste entier, derrière un
          repli par fournisseur. William l'a dit lui-même — « l'objet offre sera utile lorsqu'on aura
          câblé les fonctionnalités permettant d'intégrer les prix directement dans Kimatch ». On
          range, on ne détruit pas.
          ══════════════════════════════════════════════════════════════════════════════════════ */}
      {/* ══════════════════════════════════════════════════════════════════════════════════════
          LE CORPS DE LA VERSION : SES FOURNISSEURS, ET RIEN D'AUTRE

          William, 18/09/2026 : « tous les champs ou prix actuellement présents sur Kimatch doivent
          être masqués ». Ce bloc en portait sept avant celui-ci, et voici ce que chacun devient.

          ══ CE QUI EST MASQUÉ, ET POURQUOI CHACUN LE MÉRITAIT ══

          · LE RÉSUMÉ. Il contenait « Durées 24/36 mois — Fixe — 2 fournisseurs consultés —
            commission estimée 8 600,76 € ». Les trois premiers faits sont déjà lisibles sur les
            cartes ci-dessous, et le quatrième est UN PRIX au milieu d'une fiche où il ne doit plus
            y en avoir. C'est un texte figé écrit à la création : il ne se met pas à jour quand un
            fournisseur est ajouté, donc il vieillit faux.
          · LE CONTEXTE ET HYPOTHÈSES, qui répétait « Date souhaitée : 21/09/2026 » — déjà dans
            l'en-tête, en plus lisible et, lui, modifiable.
          · LE MOTIF et LE TYPE DE PRIX : le premier ne sert qu'au moment de créer la version, le
            second se lit sur chaque pastille de combinaison.
          · LE NOM DE L'OPTIMISATION et LE COMPTE DE FOURNISSEURS : la grille les montre.
          · LE GAIN ESTIMÉ de l'optimisation et LES MONTANTS des offres orphelines : des prix.
          · ÉCONOMIE, CONFIANCE, DATE DE DÉCISION, CONTACT DE LA VERSION : nuls sur la TOTALITÉ des
            2 106 versions (mesuré le 18/09/2026). Ils n'ont jamais rien affiché.

          Rien n'est supprimé en base. Ce sont des colonnes qu'on cesse de montrer, pas des données
          qu'on efface — la distinction que Naoëlle avait demandé de tenir le 25/08/2026.
          ══════════════════════════════════════════════════════════════════════════════════════ */}
      <div className="px-[17px] py-3.5">
        {version.optimisations.length === 0 ? (
          <p className="text-km-body text-km-faint">Aucun fournisseur consulté sur cette version.</p>
        ) : (
          version.optimisations.map((optimisation) => (
            <div key={optimisation.id} className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(258px,1fr))]">
              {optimisation.fournisseurs_consultes.map((fc) => {
                const recue = fc.statut_code === 'DISPONIBLE'
                const refusee = fc.statut_code === 'REFUSEE'
                /* UNE COMBINAISON EST « EN JEU » DÈS QUE LA DEMANDE EST PARTIE. Avant ça — à
                   traiter — ou après un refus, elle reste ce qu'on a demandé, pas ce qu'on
                   attend : la maquette la dessine en pointillés et en italique, et c'est cette
                   nuance qui distingue une consultation commencée d'une consultation prévue. */
                const enJeu = !refusee && fc.statut_code != null && fc.statut_code !== 'A_TRAITER'
                return (
                  <div
                    key={fc.id}
                    className={cn(
                      'flex flex-col rounded-km-md border px-3 py-2.5',
                      recue ? 'border-km-green-line bg-km-green-tint' : 'border-km-line bg-white',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 text-km-name font-extrabold leading-tight text-km-text">
                        {fc.fournisseur_nom}
                      </span>
                      {/* Le statut EST le bouton : on clique ce qu'on lit. Ses trois règles —
                          ne pas reproposer le statut courant, masquer « Demande envoyée » chez un
                          fournisseur à outil en ligne, et la couleur qui dit l'attente — vivent
                          dans `PastilleStatutConsultation`, partagé avec le Pricing depuis le
                          18/09/2026. Les recopier ici aurait donné deux endroits à corriger le jour
                          où un sixième statut apparaît, et l'expérience de cette base est qu'on
                          n'en corrige qu'un. */}
                      <PastilleStatutConsultation
                        statutCode={fc.statut_code}
                        statutLibelle={fc.statut_actuel}
                        modeConsultation={fc.mode_consultation}
                        statuts={statutsConsultation}
                        onChoisir={(st) => onChangerStatut(fc, st.id)}
                        peutModifier={peutModifier}
                        nomFournisseur={fc.fournisseur_nom}
                      />
                    </div>

                    {/* Ce qu'on lui a demandé : une pastille par combinaison durée × type de prix.
                        C'est la seule chose qui distingue deux lignes d'un même fournisseur, et elle
                        se lit sans prix. */}
                    {fc.offres.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {fc.offres.map((offre) => (
                          <span
                            key={offre.id}
                            className={cn(
                              'rounded-km-sm border px-2 py-[2px] text-km-label font-semibold',
                              enJeu
                                ? 'border-km-line bg-white text-km-text'
                                : 'border-dashed border-km-line italic text-km-faint',
                            )}
                          >
                            {libelleOffre(offre.duree_mois, offre.type_prix)}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Un fournisseur à outil en ligne n'attend aucun mail : Erwan va lire les prix
                        chez lui. Le dire évite de le compter comme une relance à faire. */}
                    {fc.mode_consultation === 'OUTIL_EN_LIGNE' && fc.url_outil_consultation && (
                      <a
                        href={fc.url_outil_consultation}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex w-fit items-center gap-1 text-km-label font-bold text-km-blue hover:underline"
                      >
                        Outil en ligne <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}

                    {AFFICHER_LE_DETAIL_DES_PRIX && (
                      <div className="mt-2">
                        <details>
                          <summary className="cursor-pointer text-km-label font-semibold text-km-faint hover:text-km-muted">
                            Détail des offres et des prix
                          </summary>
                          <OffresDuFournisseur
                            fournisseur={fc}
                            optimisationId={optimisation.id}
                            repere={repereDeLaCotation(optimisation)}
                            version={version}
                            compteurs={compteurs}
                            typeDocumentOffreId={typeDocumentOffreId}
                            dureesDemandees={version.durees}
                            typesPrixDemandes={version.types_prix}
                            peutModifier={peutModifier}
                            signaler={signaler}
                          />
                        </details>
                        {fc.historique.length > 0 && (
                          <details>
                            <summary className="cursor-pointer text-km-label font-semibold text-km-faint hover:text-km-muted">
                              Historique de consultation ({fc.historique.length})
                            </summary>
                            <div className="mt-1 space-y-0.5 border-t border-km-line-soft pt-1">
                              {fc.historique.map((h) => (
                                <p key={h.id} className="text-km-label text-km-muted">
                                  {new Date(h.date_evenement).toLocaleDateString('fr-FR')} — {h.statut}
                                  {h.commentaire ? ` · ${h.commentaire}` : ''}
                                </p>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    )}

                    <div className="mt-auto pt-2">
                      {refusee ? (
                        /* UN REFUS EST UNE RÉPONSE. Proposer d'y déposer une proposition
                           inviterait à attendre ce qui ne viendra pas — la carte le dit, et elle
                           libère l'attente au lieu de la prolonger. */
                        <p className="border-t border-km-line-soft pt-2 text-km-label text-km-faint">
                          aucune proposition attendue
                        </p>
                      ) : (
                        <PropositionsFournisseur
                          consultationId={fc.id}
                          fournisseurNom={fc.fournisseur_nom}
                          typeDocumentId={typeDocumentOffreId}
                          peutModifier={peutModifier}
                          signaler={signaler}
                        />
                      )}
                    </div>
                  </div>
                )
              })}

              {/* CONSULTER UN FOURNISSEUR DE PLUS : une carte creuse à la fin de la grille plutôt
                  qu'un bouton dans un en-tête. La maquette n'en montre pas — elle dessine une
                  version déjà constituée — mais la retirer supprimerait le seul chemin pour ajouter
                  un fournisseur à une version en cours. À la place d'une carte, elle ne pèse rien
                  et se trouve là où on la cherche : au bout de la rangée. */}
              {peutModifier && !estClose && (optimisation.type_optimisation_code === MISE_EN_CONCURRENCE
                || optimisation.fournisseurs_consultes.length > 0) && (
                <button
                  type="button"
                  onClick={() => onAjouterFournisseur(optimisation)}
                  className="flex min-h-[92px] items-center justify-center gap-1.5 rounded-km-md border border-dashed border-km-line px-3 py-2.5 text-km-body font-bold text-km-faint transition-colors hover:border-km-green hover:bg-km-green-soft hover:text-km-green"
                >
                  + Consulter un fournisseur
                </button>
              )}

              {optimisation.fournisseurs_consultes.length === 0 && !peutModifier && (
                <p className="text-km-body text-km-faint">Aucun fournisseur consulté pour l'instant.</p>
              )}
            </div>
          ))
        )}

        {/* ══ « ENVOYER CETTE VERSION PAR EMAIL » EST RETIRÉ (William, 18/09/2026) ══

            « Supprime le "Envoyer cette version par mail" et utilise cette place gagnée pour aérer
            le contenu. »

            IL FAISAIT DOUBLON AVEC LE GESTE QUI COMPTE. Depuis le hero, « Envoyer au client » ouvre
            le volet d'e-mail avec l'adresse du signataire ET la proposition commerciale en pièce
            jointe, puis date la présentation — donc alimente la relance. Ce bouton-ci ouvrait un
            formulaire de demande fournisseur, sans destinataire évident depuis la fiche, et sans
            rien dater. Deux boutons « envoyer » dans le même écran pour deux destinataires
            différents : le risque n'était pas l'encombrement, c'était l'erreur d'envoi. */}
      </div>

      {/* ══ LA PROPOSITION COMMERCIALE CLÔT LE BLOC ══
          Une version se lit en trois temps : ce qu'on a demandé, qui a répondu, ce qu'on envoie.
          La proposition est le troisième — elle SYNTHÉTISE les cartes du dessus, donc elle les suit.
          Voir `PropositionCommerciale` pour le reste du raisonnement. */}
      <PropositionCommerciale
        reco={reco}
        version={version}
        contactSignataire={contactSignataire}
        typeDocumentPropositionId={typeDocumentPropositionId}
        peutModifier={peutModifier}
        signaler={signaler}
        onPresentationEnvoyee={onPresentationEnvoyee}
      />
    </div>
  )
}
