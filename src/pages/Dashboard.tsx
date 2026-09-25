import { useMemo, useState } from 'react'
import { TitreOnglet } from '@/components/layout/TitreOnglet'
import { TuileArgent, TuilesJournee } from '@/components/dashboard/TuilesDuJour'
import { useMonProfil } from '@/lib/data/roles'
import { useCartesDuJour } from '@/lib/data/cartesDuJour'
import { OffresDuJour } from '@/components/dashboard/OffresDuJour'
import {
  useOffresDuJour, useTotauxOffres,
  DEFAUT_PERIODE, PERIODES_MONTANT, type PeriodeMontant,
  DEFAUT_PORTEE, PORTEES_MONTANT, type PorteeMontant,
} from '@/lib/data/offresDuJour'
import { TachesDuJour } from '@/components/dashboard/TachesDuJour'
import { useTachesDuJour, useChargeAVenir, depuisIso, PLAFOND_JOURNALIER } from '@/lib/data/tachesDuJour'
import { useVueServiceClient } from '@/lib/data/roles'
import { useChargeLargeur } from '@/lib/data/serviceClient'
import { ChargeLarge } from '@/components/dashboard/ChargeLarge'
import { ZoneRequetes, ZoneFidelisation } from '@/components/dashboard/ZonesServiceClient'

/**
 * M+6 EN JOURS CALENDAIRES. Six mois valent entre 181 et 184 jours selon le mois de départ ; 185
 * les couvre tous sans jamais dépasser. La fonction en base ne garde ensuite que les jours ouvrés.
 */
const JOURS_M_PLUS_6 = 185
import { AppelsNonLies } from '@/components/allo/AppelsNonLies'
import { cn } from '@/lib/utils'

/**
 * ══ LE TABLEAU DE BORD ══
 *
 * Trois zones, dans l'ordre d'une matinée : ce que j'ai gagné et ce que je dois faire, les études
 * à rendre, les tâches à passer. D'abord ce qu'on doit à un client, ensuite ce qu'on se doit à
 * soi-même — les premières ont une date promise à quelqu'un, les secondes se replanifient.
 *
 * ── CE QUI A ÉTÉ RETIRÉ, ET OÙ ÇA VIT ENCORE ──
 *
 * Quatre blocs sont partis de cette page le 10/09/2026 : le bandeau de trois indicateurs, « Ma
 * journée », « Ma performance » et les quatre tuiles chiffrées. `MaJournee`, `MaPerformance`,
 * `TuileChiffre` et `BandeauMarge` restent au dépôt avec leurs crochets : une refonte en cours
 * n'est pas le moment de jeter du travail qui reviendra peut-être dans une autre disposition.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * TROIS BANDES TEINTÉES — LE CROISEMENT DE « C » ET DE « D »
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William a retenu la direction D (bento), puis, en voyant le rendu : « entre la zone du haut,
 * celle du milieu et celle du bas, je veux une meilleure démarcation. Là on dirait simplement un
 * amoncellement de cards et tableaux. »
 *
 * IL A RAISON, ET LA CAUSE EST ARITHMÉTIQUE. La grille bento posait toutes les tuiles avec le même
 * écart de 10 px — entre deux compteurs d'une même zone comme entre le dernier compteur et le
 * tableau des offres. Rien ne pouvait dire qu'on changeait de sujet, puisque le seul signal
 * disponible, l'espacement, était identique dans les deux cas.
 *
 * ── LA RÉPONSE VIENT DE LA DIRECTION « C », QU'IL AVAIT ÉCARTÉE ──
 *
 * Parmi les quatre propositions du 11/09/2026, la direction C séparait les zones par des BANDES DE
 * COULEUR pleine largeur. William a préféré D pour ses tuiles. Les deux idées ne s'excluent pas :
 * on garde les tuiles de D et on les pose sur les bandes de C. C'est exactement le croisement que
 * je lui avais proposé — « les bandes de C avec les tuiles de D ».
 *
 * ── POURQUOI UNE BANDE MARCHE LÀ OÙ L'ESPACE ÉCHOUAIT ──
 *
 * Une bande crée une FRONTIÈRE FERMÉE : tout ce qui est dedans appartient au même sujet, tout ce
 * qui est dehors n'y appartient pas. L'espacement, lui, ne fait qu'éloigner — il demande au
 * lecteur de décider où passe la limite, et il décide mal quand tous les espaces se ressemblent.
 *
 * ── ET LES TEINTES SONT TRÈS BASSES, POUR UNE RAISON PRÉCISE ──
 *
 * Trois fonds colorés plus les cinq encres des compteurs plus les trois couleurs d'état, cela
 * ferait onze couleurs à l'écran. Les bandes tiennent donc entre 2 et 4 % de saturation : assez
 * pour qu'on voie où commence une zone, pas assez pour entrer en concurrence avec le rouge d'un
 * retard. Elles se distinguent par leur TEINTE, pas par leur intensité.
 *
 *   vert Kiwee   ma journée — ce que je dois faire
 *   bleu         mes offres — ce que je dois à un client
 *   ambre        mes tâches — ce que je me dois à moi-même
 *
 * ── SIX COLONNES À L'INTÉRIEUR DE CHAQUE BANDE ──
 *
 *   2 × 2   l'argent signé et le pipe ouvert — le plus gros objet de l'écran
 *   1       chacun des quatre compteurs de gestes
 *   4       les opportunités à suivre, sur une bande
 *   —       les offres : trois cartes de statut à gauche, le tableau à droite
 *   4 + 2   les tâches, et la charge à venir
 *
 * En dessous de `lg`, chaque grille retombe à une ou deux colonnes : une grille asymétrique ne se
 * comprime pas, elle se déplie.
 */

/**
 * Une bande de zone : la teinte du fond, le liseré qui la referme, et l'encre de son titre.
 *
 * L'ENCRE EST LA TEINTE DE LA BANDE, POUSSÉE JUSQU'AU LISIBLE. Un titre en gris neutre sur un
 * fond bleuté flotte au-dessus de sa bande sans lui appartenir ; à la même teinte en foncé, il en
 * fait partie. Les trois encres sont vérifiées au-dessus de 7:1 sur leur propre fond.
 */
const ZONES = {
  journee: { bande: 'bg-[#EAF2EE] ring-[#D8E8E1]', encre: 'text-[#0A5F4A]' },
  offres:  { bande: 'bg-[#EBF1F7] ring-[#D9E4EF]', encre: 'text-[#25496B]' },
  taches:  { bande: 'bg-[#F8F3E9] ring-[#EDE2CE]', encre: 'text-[#7A4E12]' },
} as const

/**
 * L'enveloppe d'une zone : sa bande teintée, son titre, sa synthèse.
 *
 * ── LE TITRE EST SUR LA BANDE, PAS DANS LA TUILE ──
 *
 * William, 11/09/2026 : « pour les zones 2 et 3, ajoute un titre à ces zones ». Ces titres
 * existaient déjà — mais DANS la barre du tableau, donc à l'intérieur de la tuile. Les ajouter
 * sur la bande sans les retirer d'en dessous les aurait écrits deux fois à quarante pixels
 * d'écart, ce qui est le défaut qu'on avait mis deux versions à corriger.
 *
 * Ils sont donc montés d'un cran. La règle qui en sort est nette : LA BANDE NOMME, LA TUILE
 * COMPTE. Le titre appartient à la zone entière — le tableau des tâches et la matrice de charge
 * sont tous deux « les tâches du jour » — tandis que le décompte appartient au tableau, puisque
 * c'est lui que les filtres font varier.
 *
 * `ring-1 ring-inset` PLUTÔT QU'UNE BORDURE : un anneau intérieur ne s'ajoute pas aux dimensions
 * de la boîte, donc les trois bandes gardent exactement la même largeur que le contenu de la
 * page, au pixel, quelle que soit l'épaisseur du trait.
 */
function Zone({
  teinte,
  titre,
  synthese,
  children,
}: {
  teinte: { bande: string; encre: string }
  /** Le nom de la zone, sur sa bande. Les trois en ont un depuis le 11/09/2026. */
  titre?: string
  /** La ligne chiffrée à droite du titre, calculée depuis les données de la zone. */
  synthese?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn('rounded-[26px] p-2.5 ring-1 ring-inset sm:p-3', teinte.bande)}>
      {titre && (
        /* `px-1.5` ALIGNE LE TITRE SUR LE CONTENU, pas sur le bord de la bande : sans ce léger
           retrait il tomberait quelques pixels à gauche de la première tuile, et l'œil verrait
           l'écart sans savoir le nommer. */
        <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 px-1.5">
          <h2 className={cn('text-km-name font-semibold', teinte.encre)}>{titre}</h2>
          {synthese && <p className="min-w-0 truncate text-km-body text-km-muted">{synthese}</p>}
        </div>
      )}
      {children}
    </section>
  )
}

export default function Dashboard() {
  const { data: monProfil } = useMonProfil()
  const { data: cartes, isLoading: cartesEnCours } = useCartesDuJour()
  const { data: offres, isLoading: offresEnCours } = useOffresDuJour()
  /* ══ LA PÉRIODE DU MONTANT SIGNÉ, RETENUE D'UNE VISITE À L'AUTRE ══
     William, 15/09/2026 : « je veux que ce soit fluide et pratique ». Quelqu'un qui pilote au mois
     le choisit une fois, pas à chaque ouverture du tableau de bord. Le choix est propre au
     navigateur : c'est une préférence d'affichage, pas une donnée de l'entreprise.

     LA VALEUR RELUE EST VÉRIFIÉE : un `localStorage` se modifie à la main et survit aux versions.
     Une valeur devenue inconnue ferait échouer l'appel — la fonction en base refuse ce qu'elle ne
     connaît pas — au lieu de simplement repartir sur le jour. */
  const [periode, setPeriode] = useState<PeriodeMontant>(() => {
    try {
      const garde = localStorage.getItem('km-periode-montant-signe')
      return PERIODES_MONTANT.includes(garde as PeriodeMontant) ? (garde as PeriodeMontant) : DEFAUT_PERIODE
    } catch {
      return DEFAUT_PERIODE
    }
  })
  const choisirPeriode = (p: PeriodeMontant) => {
    setPeriode(p)
    // Le stockage local peut être refusé (navigation privée, réglage d'entreprise) : l'écran doit
    // continuer de fonctionner, simplement sans mémoire.
    try { localStorage.setItem('km-periode-montant-signe', p) } catch { /* sans mémoire, tant pis */ }
  }
  /* LA PORTÉE SE RETIENT DE LA MÊME FAÇON, et sous sa propre clé : quelqu'un qui pilote l'équipe
     au mois et quelqu'un qui suit son propre jour ne doivent pas se marcher dessus. Même garde à
     la relecture — une valeur inconnue en mémoire ferait refuser l'appel par la fonction en base. */
  const [portee, setPortee] = useState<PorteeMontant>(() => {
    try {
      const garde = localStorage.getItem('km-portee-montant-signe')
      return PORTEES_MONTANT.includes(garde as PorteeMontant) ? (garde as PorteeMontant) : DEFAUT_PORTEE
    } catch {
      return DEFAUT_PORTEE
    }
  })
  const choisirPortee = (p: PorteeMontant) => {
    setPortee(p)
    try { localStorage.setItem('km-portee-montant-signe', p) } catch { /* sans mémoire, tant pis */ }
  }
  const { data: totaux, isLoading: totauxEnCours } = useTotauxOffres(periode, portee)
  const { data: taches, isLoading: tachesEnCours } = useTachesDuJour()
  const { data: charge, isLoading: chargeEnCours } = useChargeAVenir()

  /* LE RÔLE DÉCIDE DE CE QU'ON VOIT. Il se lit sur un réglage, jamais sur le nom du rôle — voir
     `useVueServiceClient`. La charge large n'est demandée que pour ceux qui la regardent. */
  const vueServiceClient = useVueServiceClient()
  const { data: chargeLarge, isLoading: chargeLargeEnCours } = useChargeLargeur(
    vueServiceClient ? JOURS_M_PLUS_6 : 0,
  )
  /* LE JOUR SUR LEQUEL LES DEUX TABLEAUX SONT ARRÊTÉS. `null` = tout ce qui est ouvert. Il vit ici,
     et non dans la matrice : c'est le seul endroit d'où les deux zones le voient. */
  const [jourChoisi, setJourChoisi] = useState<string | null>(null)

  // « vendredi 11 septembre 2026 » — la date complète, à côté du prénom.
  const dateDuJour = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  /* ══ LES TROIS SYNTHÈSES DE ZONE ══
     Elles répondent à « si je ne lis qu'une ligne de cette zone, laquelle ? ». Calculées ICI, au
     seul endroit qui voit les trois jeux de données : recalculées dans les composants enfants,
     elles finiraient par dire autre chose que ce qu'on lit juste en dessous. */

  const syntheseJournee = useMemo(() => {
    if (!cartes) return undefined
    const gestes = cartes.appels + cartes.mails + cartes.livrables
    const opportunites = cartes.perimetreADetecter + cartes.mandatARecuperer + cartes.recommandationACreer
    /* RIEN À FAIRE EST UNE INFORMATION, et elle se dit en clair plutôt qu'en « 0 geste · 0 piste »,
       qui se lirait comme un écran en panne. */
    if (gestes + cartes.pistesAProspecter + opportunites === 0) {
      return 'rien en retard, rien d’échu aujourd’hui'
    }
    /* ON NE LISTE QUE CE QUI N'EST PAS À ZÉRO. Une synthèse qui énumère trois familles dont deux
       vides fait lire deux fois « 0 » pour arriver au seul chiffre qui compte. */
    return [
      gestes > 0 ? `${gestes} geste${gestes > 1 ? 's' : ''} à passer` : null,
      cartes.pistesAProspecter > 0 ? `${cartes.pistesAProspecter} piste${cartes.pistesAProspecter > 1 ? 's' : ''} à relancer` : null,
      opportunites > 0 ? `${opportunites} opportunité${opportunites > 1 ? 's' : ''} à faire avancer` : null,
    ].filter(Boolean).join(' · ')
  }, [cartes])

  const syntheseOffres = useMemo(() => {
    if (!offres) return undefined
    if (offres.length === 0) return 'rien à traiter aujourd’hui'
    const enRetard = offres.filter((o) => o.section === 'EN_RETARD').length
    return enRetard > 0
      ? `${enRetard} en retard sur ${offres.length}`
      : `${offres.length} étude${offres.length > 1 ? 's' : ''}, aucun retard`
  }, [offres])

  const syntheseTaches = useMemo(() => {
    if (!taches || !charge) return undefined
    if (taches.length === 0) return 'rien en retard ni dû aujourd’hui'
    const enRetard = taches.filter((t) => t.statut === 'EN_RETARD').length
    const morceaux = [enRetard > 0 ? `${enRetard} en retard` : 'aucun retard']

    /* LA JOURNÉE LA PLUS CHARGÉE À VENIR est le seul chiffre de la matrice qu'on ne peut PAS voir
       d'un coup d'œil : il faut comparer dix cases. C'est donc exactement ce que la synthèse doit
       extraire — et on ne la mentionne que si elle dépasse l'objectif, sinon c'est du bruit. */
    const pire = charge.reduce<{ jour: string; taches: number } | null>(
      (max, j) => (max === null || j.taches > max.taches ? j : max), null,
    )
    if (pire && pire.taches > PLAFOND_JOURNALIER) {
      const d = depuisIso(pire.jour).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
      morceaux.push(`journée saturée à venir : ${d} (${pire.taches})`)
    }
    return morceaux.join(' · ')
  }, [taches, charge])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TitreOnglet title="Tableau de bord" />

      {/* `km-canevas` POSE LE FOND : un gris-vert légèrement sous le blanc, deux lueurs très
          faibles et une trame de points, toutes fixes. C'est lui qui fait exister les bandes
          teintées posées dessus. Voir `index.css`. */}
      <div className="km-canevas min-h-0 flex-1 overflow-y-auto px-4 pb-12 pt-5 lg:px-6">
        {/* ══════ L'EN-TÊTE ══════
            `items-baseline` et non `items-center` : le prénom est en 28 px, la date en 15 px, et
            c'est le pied des lettres qui doit s'aligner, pas le milieu des boîtes. */}
        <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h1 className="font-display text-km-h1 font-[570] tracking-[-0.04em] text-km-text">
            Bonjour{monProfil?.prenom ? ` ${monProfil.prenom}` : ''}
          </h1>
          <p className="text-km-lead text-km-muted">
            <span aria-hidden className="mr-3 text-km-faint">·</span>
            {dateDuJour}
          </p>
        </div>

        {/* L'ÉCART ENTRE DEUX BANDES EST DE 14 PX, CELUI ENTRE DEUX TUILES DE 10. Le rapport n'a
            pas besoin d'être spectaculaire : la bande porte déjà la frontière, l'espacement ne
            fait que la confirmer. */}
        <div className="flex flex-col gap-3.5">

          {/* ══════ 01 · MA JOURNÉE ══════
              Trois gestes concrets — appeler, écrire, produire — les pistes à relancer, et les
              dossiers qui attendent une suite. Toutes ces mesures ne comptent que ce qui est EN
              RETARD OU DÛ AUJOURD'HUI, et uniquement pour celui qui regarde.

              ELLES SE METTENT À JOUR SEULES. Une tâche cochée ailleurs — par un collègue, ou par
              soi-même dans un autre onglet — fait descendre le compteur sous les yeux. */}
          <Zone
            teinte={ZONES.journee}
            titre="Ma journée"
            synthese={syntheseJournee}
          >
            {/* ══ DEUX JOURNÉES DIFFÉRENTES, SELON LE MÉTIER ══
                William, 25/09/2026 : « garde la card avec le montant signé et les filtres mais
                supprime pour lui la vision du pipe […] les 5 cards à droite du montant doivent
                disparaître et être remplacées par le composant Charge à venir ».

                Le service client ne suit pas un pipe et n'a pas d'offres à produire : les cinq
                compteurs de la rangée — appels, mails, propositions, pistes, dossiers — décrivent
                le travail d'un commercial. À leur place, ce qu'il regarde vraiment : sa charge, sur
                six mois au lieu de dix jours. */}
            {vueServiceClient ? (
              <div className="grid auto-rows-min grid-cols-1 gap-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <TuileArgent sansPipe totaux={totaux} chargement={totauxEnCours} periode={periode} onPeriode={choisirPeriode} portee={portee} onPortee={choisirPortee} />
                <ChargeLarge jours={chargeLarge} chargement={chargeLargeEnCours} jourChoisi={jourChoisi} onChoisirJour={setJourChoisi} />
              </div>
            ) : (
              <div className="grid auto-rows-min grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
                {/* La grande tuile ouvre la grille : deux colonnes, deux rangées. Les quatre
                    compteurs et la bande des opportunités se placent ensuite autour d'elle. */}
                <TuileArgent totaux={totaux} chargement={totauxEnCours} periode={periode} onPeriode={choisirPeriode} portee={portee} onPortee={choisirPortee} />
                <TuilesJournee nombres={cartes} chargement={cartesEnCours} />
              </div>
            )}
          </Zone>

          {/* ══════ 02 · LES DEUX ZONES DU SERVICE CLIENT ══════
              William, 25/09/2026 : « ensuite tu dois me créer 2 zones en full largeur ». Elles
              prennent la place des offres du jour, qui décrivent un travail de commercial —
              propositions envoyées, études chez le client — dont le service client n'a pas la
              charge. */}
          {vueServiceClient ? (
            <>
              <ZoneRequetes jour={jourChoisi} />
              <ZoneFidelisation jour={jourChoisi} />
            </>
          ) : (
            <Zone
              teinte={ZONES.offres}
              titre="Offres du jour"
              synthese={syntheseOffres}
            >
              <OffresDuJour lignes={offres} chargement={offresEnCours} />
            </Zone>
          )}

          {/* ══════ 03 · TÂCHES DU JOUR ══════
              William, 25/09/2026 : « tous les autres blocs doivent être masqués, car inutiles pour
              Fabien ». Ce bloc reprend la matrice de charge sur dix jours et la liste des tâches du
              jour — deux choses que sa vue porte déjà, en mieux : la charge sur six mois, et deux
              tableaux qui la détaillent au clic. Le garder afficherait la même journée deux fois,
              à deux échelles différentes. */}
          {!vueServiceClient && (
          <Zone
            teinte={ZONES.taches}
            titre="Tâches du jour"
            synthese={syntheseTaches}
          >
            <div className="grid auto-rows-min grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
              <TachesDuJour
                lignes={taches}
                charge={charge}
                chargement={tachesEnCours || chargeEnCours}
              />
            </div>
            {/* LES APPELS À RATTACHER, sous les tâches du jour : c'est le même geste — ce qui
                reste à faire avant de refermer la journée. Le bloc disparaît quand il n'y a rien,
                voir `AppelsNonLies`. */}
            <div className="mt-2.5">
              <AppelsNonLies />
            </div>
          </Zone>
          )}
        </div>
      </div>
    </div>
  )
}
