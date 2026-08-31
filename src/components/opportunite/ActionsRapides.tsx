import { Phone, Mail, Gauge, TrendingUp, CalendarDays, Sparkle, Check, FileText, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Le bloc « Actions rapides » de la maquette de William, avec ses six familles.
 *
 * SES MOTS, SUR SA MAQUETTE : « chaque action est consignée dans le flux, sans changer le statut ».
 * C'est toute la logique du bloc — on note ce qu'on vient de faire, on ne fait pas avancer le
 * dossier. Le statut, lui, se calcule à partir des objets réunis.
 *
 * LES SIX FAMILLES ET LEURS COULEURS SONT LES SIENNES, relevées dans sa constante `FAMILIES` :
 * Qualification #a8317f, Contact #7c5bb0, Données #4f5aa8, Analyse #0d7a5f, Organisation #c8940a,
 * Décision #8a4b2a. Chacune porte deux actions, les mêmes que chez lui.
 *
 * CHAQUE ACTION CRÉE UNE INTERACTION rattachée à l'opportunité (colonne ajoutée par la migration
 * 20260823210000), au compte et au contact. Elle apparaît donc dans le flux de la colonne de droite,
 * exactement comme la maquette le montre. Le type d'interaction est choisi par action — un appel est
 * un APPEL, une demande de facture une NOTE_INTERNE — pour que les filtres existants les retrouvent.
 *
 * QUATRE ACTIONS NE SONT PAS DE SIMPLES NOTES, et elles sont traitées à part. « Créer une
 * recommandation » et « Écarter l'opportunité » changent l'état du dossier ; « Planifier un rappel »
 * et « Créer une tâche » créent une vraie tâche dans `actions`. Toutes quatre portent
 * `typeInteraction: null` et sont déléguées à l'écran, qui sait les faire (règle de conversion,
 * dialogue de clôture, formulaire de tâche).
 */

export interface ActionRapide {
  cle: string
  libelle: string
  /** Code du type d'interaction à consigner, ou `null` si l'action est déléguée à l'écran. */
  typeInteraction: string | null
  icone: typeof Phone
}

export interface FamilleActions {
  nom: string
  /** Classes Tailwind : texte et fond de la pastille, aux teintes de William. */
  teinte: string
  actions: ActionRapide[]
}

const FAMILLES_ACTIONS: FamilleActions[] = [
  {
    nom: 'Qualification',
    teinte: 'bg-opp-100 text-opp-600',
    actions: [
      { cle: 'besoin', libelle: 'Qualifier le besoin', typeInteraction: 'NOTE_INTERNE', icone: Check },
      { cle: 'perimetre', libelle: 'Vérifier le périmètre', typeInteraction: 'NOTE_INTERNE', icone: Check },
    ],
  },
  {
    nom: 'Contact',
    teinte: 'bg-violet-100 text-violet-500',
    actions: [
      { cle: 'appel', libelle: 'Appeler le contact', typeInteraction: 'APPEL', icone: Phone },
      { cle: 'email', libelle: 'Envoyer un email', typeInteraction: 'EMAIL', icone: Mail },
    ],
  },
  {
    nom: 'Données',
    teinte: 'bg-indigo-50 text-indigo-600',
    actions: [
      { cle: 'facture', libelle: 'Demander une facture', typeInteraction: 'NOTE_INTERNE', icone: FileText },
      { cle: 'index', libelle: 'Relever un index', typeInteraction: 'NOTE_INTERNE', icone: Gauge },
    ],
  },
  {
    nom: 'Analyse',
    teinte: 'bg-kiwi-50 text-km-green',
    actions: [
      { cle: 'economie', libelle: 'Simuler une économie', typeInteraction: 'NOTE_INTERNE', icone: TrendingUp },
      { cle: 'marche', libelle: 'Comparer au marché', typeInteraction: 'NOTE_INTERNE', icone: TrendingUp },
    ],
  },
  {
    nom: 'Organisation',
    teinte: 'bg-km-amber-soft text-amber-700',
    actions: [
      // ══ CES DEUX-LÀ NE SONT PAS DES NOTES : ELLES CRÉENT UNE TÂCHE ══
      //
      // Elles portaient `NOTE_INTERNE`, donc « Créer une tâche » écrivait une INTERACTION. L'écran
      // répondait « consigné dans le flux », la note apparaissait — et la table `actions` ne recevait
      // rien. Mesuré le 31/08/2026 : zéro tâche rattachée à une opportunité, sur 11 en base.
      //
      // `typeInteraction: null` les fait remonter à l'écran, comme « Créer une recommandation » :
      // c'est lui qui ouvre le formulaire de tâche.
      { cle: 'rappel', libelle: 'Planifier un rappel', typeInteraction: null, icone: CalendarDays },
      { cle: 'tache', libelle: 'Créer une tâche', typeInteraction: null, icone: CalendarDays },
    ],
  },
  {
    nom: 'Décision',
    // #8a4b2a sur #f7ece3 : le brun de William, absent de la palette, posé en valeurs littérales.
    teinte: 'bg-[#f7ece3] text-[#8a4b2a]',
    actions: [
      { cle: 'recommandation', libelle: 'Créer une recommandation', typeInteraction: null, icone: Sparkle },
      { cle: 'ecarter', libelle: "Écarter l'opportunité", typeInteraction: null, icone: Check },
    ],
  },
]

export function ActionsRapides({ onAction, enCours }: {
  /** `typeInteraction` nul : l'action est déléguée à l'écran, qui sait quoi en faire. */
  onAction: (action: ActionRapide) => void | Promise<void>
  /** Clé de l'action en cours d'enregistrement, pour ne pas la déclencher deux fois. */
  enCours: string | null
}) {
  return (
    <div className="rounded-[13px] border border-km-line bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-km-faint">Actions rapides</p>
        <span className="flex-1" />
        <p className="text-[10px] text-km-faint">
          chaque action est consignée dans le flux, sans changer le statut
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {FAMILLES_ACTIONS.map((f) => {
          const IconeFamille = f.actions[0].icone
          return (
          <div key={f.nom} className="rounded-[11px] border border-km-line bg-km-soft p-2.5">
            <div className="mb-2 flex items-center gap-1.5">
              <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md', f.teinte)}>
                <IconeFamille className="h-3 w-3" />
              </span>
              <span className="text-[10.5px] font-bold text-km-text">{f.nom}</span>
            </div>
            <div className="flex flex-col gap-1">
              {f.actions.map((a) => {
                const IconeAction = a.icone
                return (
                <button
                  key={a.cle}
                  type="button"
                  disabled={enCours === a.cle}
                  onClick={() => void onAction(a)}
                  className="flex items-center gap-1.5 rounded-lg border border-transparent px-2 py-1 text-left text-[11.5px] font-medium text-km-muted transition-colors hover:border-km-line hover:bg-white hover:text-km-text disabled:opacity-50"
                >
                  {enCours === a.cle ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : <IconeAction className="h-3 w-3 shrink-0 text-km-faint" />}
                  {a.libelle}
                </button>
                )
              })}
            </div>
          </div>
          )
        })}
      </div>
    </div>
  )
}
