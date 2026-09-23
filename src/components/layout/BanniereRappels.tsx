import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { CalendarClock, X } from 'lucide-react'
import { useAlertes, type Alerte } from '@/lib/data/alertes'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE RAPPEL À L'HEURE SUIT PARTOUT DANS KIMATCH
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 23/09/2026 : « je veux que la bannière puisse apparaître partout sur Kimatch, pas
 * uniquement dans Cockpit. Si la bannière apparaît dans Kimatch, le clic dessus doit renvoyer vers
 * Cockpit sur cette fiche en question. »
 *
 * ══ POURQUOI CELUI-LÀ, ET LUI SEUL ══
 *
 * Un rendez-vous téléphonique tombe à 14 h 30, qu'on soit en train de prospecter, de relire une
 * recommandation ou de chercher un compteur. Le réserver au Cockpit revenait à ne prévenir que ceux
 * qui n'avaient pas besoin de l'être — ceux qui y étaient déjà.
 *
 * LES FACTURES REÇUES NE SONT PAS ICI. Elles ont la cloche des notifications, qui est faite pour
 * ça : elles peuvent attendre cinq minutes sans que rien ne soit perdu. Un créneau manqué, non.
 * Deux bandeaux permanents en haut de l'écran, ce serait un de trop.
 *
 * ══ LE CLIC MÈNE AU COCKPIT, PAS À LA FICHE ══
 *
 * On ne veut pas lire la fiche, on veut APPELER. Le Cockpit reçoit la cible dans l'adresse et
 * ouvre le sprint dessus ; aller sur la fiche demanderait de revenir au Cockpit ensuite, et le
 * créneau se joue à la minute.
 *
 * ══ ELLE NE PARAÎT PAS DANS LE COCKPIT ══
 *
 * Le sprint a la sienne, dans ses couleurs, et qui fait autre chose : elle replace la fiche juste
 * après celle en cours. Deux bandeaux pour le même rappel se contrediraient à l'écran.
 */
export function BanniereRappels() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const dansLeCockpit = pathname.startsWith('/cockpit')
  const { data: alertes } = useAlertes({ actif: !dansLeCockpit })
  const [masquees, setMasquees] = useState<string[]>([])

  if (dansLeCockpit) return null

  const rappels = (alertes ?? []).filter((a) => a.nature === 'RAPPEL_HEURE' && !masquees.includes(a.cle))
  if (rappels.length === 0) return null

  const a: Alerte = rappels[0]
  const autres = rappels.length - 1

  return (
    <div className="flex items-center justify-center gap-3 border-b border-km-amber-line bg-km-amber-soft px-4 py-2">
      <CalendarClock className="h-4 w-4 shrink-0 text-km-amber" aria-hidden="true" />
      <p className="min-w-0 truncate text-km-body">
        <b className="font-bold text-km-amber">{a.titre}</b>
        {a.detail ? <span className="ml-2 text-km-text">{a.detail}</span> : null}
        {autres > 0 ? <span className="ml-2 text-km-muted">et {autres} autre{autres > 1 ? 's' : ''}</span> : null}
      </p>

      {a.cible_id ? (
        <button
          onClick={() => navigate(`/cockpit?rappel=${a.cible_type}:${a.cible_id}`)}
          className="shrink-0 rounded-km bg-km-amber px-3 py-1 text-km-label font-bold text-white transition-[filter] hover:brightness-110"
        >
          Appeler maintenant
        </button>
      ) : null}

      {/* MASQUER NE TOUCHE PAS LA TÂCHE : elle reste ouverte, et le bandeau revient au prochain
          chargement tant que l'heure est dans la fenêtre. On ne fait pas disparaître un
          rendez-vous d'un clic distrait. */}
      <button
        onClick={() => setMasquees((m) => [...m, a.cle])}
        aria-label="Masquer ce rappel"
        title="Masquer — la tâche reste ouverte"
        className="shrink-0 rounded-km-sm p-1 text-km-faint transition-colors hover:text-km-text"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
