import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReponseBanc } from '@/lib/data/tradeo'
import { messageErreur } from '@/lib/data/tradeo'

/**
 * LA RÉPONSE BRUTE, TOUJOURS À PORTÉE. Le banc sert à voir ce que Tradeo rend vraiment : chaque
 * appel montre son code HTTP, sa durée et son corps tel quel, replié pour ne pas noyer l'écran.
 */
export function ReponseBrute({ reponse, titre = 'Réponse brute de Tradeo' }: { reponse: ReponseBanc | null; titre?: string }) {
  if (!reponse) return null
  return (
    <details className="mt-3 rounded-km border border-km-line bg-km-soft/60">
      <summary className="cursor-pointer select-none px-3 py-2 text-km-label font-semibold text-km-muted">
        {titre}
        {reponse.statut_http !== undefined && <> · HTTP {reponse.statut_http}</>}
        {reponse.duree_ms !== undefined && <> · {(reponse.duree_ms / 1000).toFixed(1)} s</>}
      </summary>
      <Json valeur={reponse.reponse ?? reponse} />
    </details>
  )
}

export function Json({ valeur }: { valeur: unknown }) {
  return (
    <pre className="max-h-[420px] overflow-auto border-t border-km-line px-3 py-2 font-mono text-[11.5px] leading-relaxed text-km-text">
      {JSON.stringify(valeur, null, 2)}
    </pre>
  )
}

/** Le résultat d'un appel en une ligne : vert s'il a abouti, rouge avec le message sinon. */
export function Verdict({ reponse, succes }: { reponse: ReponseBanc | null; succes: ReactNode }) {
  if (!reponse) return null
  const erreur = messageErreur(reponse)
  return (
    <div
      className={cn(
        'mt-3 flex items-start gap-2 rounded-km px-3 py-2 text-km-body',
        erreur ? 'bg-km-red-soft text-km-red' : 'bg-km-green-soft text-km-green',
      )}
    >
      {erreur ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
      <span className="min-w-0">
        {erreur ?? succes}
        {erreur && reponse.code && <span className="ml-1.5 font-mono text-km-tiny opacity-75">{reponse.code}</span>}
      </span>
    </div>
  )
}

export function Manques({ liste }: { liste: string[] }) {
  if (liste.length === 0) return null
  return (
    <div className="mt-3 rounded-km bg-km-amber-soft px-3 py-2 text-km-body text-km-amber">
      <p className="font-semibold">Tradeo refusera la demande en l’état :</p>
      <ul className="mt-1 list-disc pl-5">
        {liste.map((m) => <li key={m}>{m}</li>)}
      </ul>
    </div>
  )
}

export function Aide({ children }: { children: ReactNode }) {
  return <p className="mb-3 max-w-[760px] text-km-body text-km-muted">{children}</p>
}
