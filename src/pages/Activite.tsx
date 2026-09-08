import { lazy, Suspense, useState } from 'react'
import { MessageSquare, PhoneOff, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FileAppelsContenu } from '@/pages/FileAppels'
import { KpiAppels } from '@/components/allo/KpiAppels'
import { useFileAppels } from '@/lib/data/fileAppels'

const Interactions = lazy(() => import('@/pages/Interactions'))

/**
 * ══ TOUTE L'ACTIVITÉ : LES MAILS ET LES APPELS ══
 *
 * Naoëlle, 07/09/2026 : « où est Appels non rattachés, je ne vois pas l'écran ? Il faudrait le
 * mettre dans un onglet dans Patrimoine qui recense un peu toutes les activités, tout ce qui
 * concerne les mails et appels, et mettre ça dedans. »
 *
 * ══ POURQUOI ELLE NE LE VOYAIT PAS ══
 *
 * L'écran existait et fonctionnait, mais je l'avais inscrit dans `pagesRecherchables` — la liste des
 * pages que la recherche trouve — et non dans le menu. Il n'était donc accessible qu'en le
 * cherchant, c'est-à-dire en sachant déjà qu'il existe. Une fonctionnalité qu'on ne trouve pas
 * n'existe pas.
 *
 * ══ DEUX VUES DU MÊME SUJET, ET L'ORDRE COMPTE ══
 *
 * MAILS ET APPELS d'abord : ce qui est consigné, sur les fiches, et qu'on vient consulter.
 * APPELS NON RATTACHÉS ensuite : ce qui attend une décision. C'est du travail, pas de la lecture,
 * et son compteur le dit — 3 897 appels en attente ne doivent pas se découvrir par hasard.
 *
 * Le second onglet porte donc un badge. Sans lui, la file resterait invisible pour qui ne pense pas
 * à l'ouvrir, et une file qu'on n'ouvre pas ne se vide jamais.
 */
type Vue = 'consignees' | 'file' | 'chiffres'

export default function Activite() {
  const [vue, setVue] = useState<Vue>('consignees')
  const { data: file } = useFileAppels()

  const enAttente = (file?.lignes ?? []).reduce((t, l) => t + Number(l.nb_appels), 0)

  return (
    <div>
      <div className="mb-3 flex gap-1.5 border-b border-km-line px-4 pt-3">
        <SousOnglet actif={vue === 'consignees'} onClick={() => setVue('consignees')} icone={MessageSquare}>
          Mails et appels
        </SousOnglet>
        <SousOnglet actif={vue === 'file'} onClick={() => setVue('file')} icone={PhoneOff} badge={enAttente}>
          Appels non rattachés
        </SousOnglet>
        {/* LES CHIFFRES EN TROISIÈME, et c'est délibéré : on vient d'abord chercher un échange
            précis, ou vider la file. Le bilan de la semaine se consulte, il ne s'utilise pas.
            William, réunion du 08/09/2026 : « on peut savoir tu as eu 20 personnes au téléphone
            aujourd'hui et tu as passé 60 appels ». */}
        <SousOnglet actif={vue === 'chiffres'} onClick={() => setVue('chiffres')} icone={BarChart3}>
          Chiffres d’appels
        </SousOnglet>
      </div>

      {vue === 'chiffres' ? (
        <KpiAppels />
      ) : vue === 'consignees' ? (
        // Le montage paresseux, comme les autres onglets de Patrimoine : la liste des interactions
        // pèse quelques dizaines de kilo-octets qu'on ne charge que si on la regarde.
        <Suspense fallback={null}>
          <Interactions />
        </Suspense>
      ) : (
        <div className="mx-auto max-w-[1100px] px-4 pb-6">
          <FileAppelsContenu />
        </div>
      )}
    </div>
  )
}

function SousOnglet({
  actif, onClick, icone: Icone, badge, children,
}: {
  actif: boolean
  onClick: () => void
  icone: typeof MessageSquare
  badge?: number
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-t-km px-3 py-2 text-km-body font-semibold transition-colors',
        actif
          ? 'border-b-2 border-km-green text-km-text'
          : 'border-b-2 border-transparent text-km-muted hover:text-km-text',
      )}
    >
      <Icone className="h-3.5 w-3.5" />
      {children}
      {/* LE COMPTEUR NE S'AFFICHE QUE S'IL Y A QUELQUE CHOSE : un « 0 » attirerait l'œil sur une
          file vide, exactement l'inverse de ce qu'on veut. */}
      {badge != null && badge > 0 && (
        <span className="rounded-km-sm bg-km-amber-soft px-1.5 py-px font-mono text-km-label font-bold tabular-nums text-km-amber">
          {badge.toLocaleString('fr-FR')}
        </span>
      )}
    </button>
  )
}
