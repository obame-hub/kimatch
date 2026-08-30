import { useState } from 'react'
import { History } from 'lucide-react'
import { useHistorique } from '@/lib/data/historique'

export function HistoriqueDiscret({ tableNom, ligneId }: { tableNom: string; ligneId: string | undefined }) {
  const [open, setOpen] = useState(false)
  const { data: entries } = useHistorique(tableNom, ligneId)

  if (!ligneId) return null

  return (
    <div className="mt-3 text-[11px] text-navy-300">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 hover:text-navy-500"
      >
        <History className="h-3 w-3" />
        Historique{entries && entries.length > 0 ? ` (${entries.length})` : ''}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 border-l border-navy-100 pl-2.5">
          {!entries || entries.length === 0 ? (
            <p className="text-navy-300">Aucune modification enregistrée.</p>
          ) : (
            entries.map((h) => (
              <p key={h.id} className="text-navy-400">
                <span className={h.estUnePersonne ? 'font-medium text-navy-500' : 'italic text-navy-400'}>{h.auteur}</span>
                {' a modifié '}
                <span className="font-medium text-navy-500">{h.champ_libelle}</span>
                {' : '}
                <span className="line-through">{h.ancienne_valeur ?? '—'}</span>
                {' → '}
                <span>{h.nouvelle_valeur ?? '—'}</span>
                {' · '}
                {new Date(h.date_modification).toLocaleString('fr-FR')}
              </p>
            ))
          )}
        </div>
      )}
    </div>
  )
}
