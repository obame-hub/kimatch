import { useState } from 'react'
import { Bell } from 'lucide-react'
import { useNotificationsNonLues } from '@/lib/data/notifications'
import { PanneauNotifications } from '@/components/layout/PanneauNotifications'

/**
 * ══ LA CLOCHE DESCEND DU MENU ET SE POSE À CÔTÉ DU TÉLÉPHONE ══
 *
 * Naoëlle, 10/09/2026 : « pour notification j'aimerais que ce soit une petite cloche à côté du logo
 * téléphone en bas à gauche et non dans le menu, que quand je clique dessus ça ouvre un volet à
 * droite avec toutes les notifs ».
 *
 * ELLE A RAISON, ET LA RAISON EST DE FOND. La barre latérale est une NAVIGATION : chacune de ses
 * lignes emmène quelque part et y reste. La cloche, elle, n'emmène nulle part — elle interrompt.
 * Assise entre « Support » et « Nouveautés », elle se lisait comme une quinzième destination, et il
 * fallait rouvrir le menu pour savoir si quelque chose attendait. La pastille du téléphone est
 * exactement le bon voisinage : deux boutons qui ne changent pas de page, visibles en permanence,
 * quel que soit l'écran affiché.
 *
 * ── POURQUOI ELLE SE COLLE À 52 PX ──
 *
 * Le téléphone vit à `left-4` sur mobile et `left-[231px]` à partir de `md` (la barre latérale fait
 * 215 px, plus sa marge). Une pastille fait 44 px, l'écart entre deux boutons appariés en fait 8 :
 * la cloche se pose donc 52 px plus à droite, aux deux points d'ancrage. Elles ne se touchent pas
 * et ne se cherchent pas — on lit une paire.
 *
 * Même taille, même bordure, même ombre que le téléphone, délibérément : deux pastilles voisines de
 * tailles différentes se liraient comme un bouton et son accessoire, pas comme deux outils.
 */
export function PastilleNotifications() {
  const [ouvert, setOuvert] = useState(false)
  const nonLues = useNotificationsNonLues()

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        title="Ouvrir les notifications"
        aria-label={
          nonLues.length > 0
            ? `Notifications, ${nonLues.length} à traiter`
            : 'Notifications, rien à traiter'
        }
        className="fixed bottom-[4.5rem] left-[4.25rem] z-[65] flex h-11 w-11 items-center justify-center rounded-full bg-kiwi-gradient text-white shadow-km-green transition-opacity hover:opacity-90 md:bottom-4 md:left-[283px]"
      >
        <Bell className="h-[18px] w-[18px] text-white" />
        {nonLues.length > 0 && (
          /* LE COMPTEUR EN MÉDAILLON, comme le point de session sur le téléphone — sauf qu'ici il
             porte un nombre : « il y a quelque chose » ne suffit pas à décider si on s'arrête. */
          <span
            className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-km-pill border-2 border-km-green bg-white px-1 text-km-tiny font-bold tabular-nums text-km-green"
            aria-hidden="true"
          >
            {nonLues.length > 9 ? '9+' : nonLues.length}
          </span>
        )}
      </button>

      <PanneauNotifications ouvert={ouvert} onFermer={() => setOuvert(false)} />
    </>
  )
}
