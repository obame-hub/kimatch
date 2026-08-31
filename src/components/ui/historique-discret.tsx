import { useState } from 'react'
import { History } from 'lucide-react'
import { useHistorique } from '@/lib/data/historique'

/**
 * L'HISTORIQUE NE SE CHARGE QU'UNE FOIS DEPLIE.
 *
 * Ce bouton affichait le NOMBRE de modifications a cote de son libelle — et pour ce seul nombre,
 * il demandait la liste entiere. Mesure le 31/08/2026 sur la fiche du compte CABINET MICHAU :
 * 1 932 ms, la requete la plus lente de la page, pour un compteur pose dans un bouton replie que
 * personne n'avait ouvert. La table porte 122 683 lignes.
 *
 * Le nombre apparait donc au depliage, avec le reste. Et si l'onglet Historique de la fiche a deja
 * ete ouvert, il s'affiche instantanement : les deux partagent la meme cle de requete.
 */
export function HistoriqueDiscret({ tableNom, ligneId }: { tableNom: string; ligneId: string | undefined }) {
  const [open, setOpen] = useState(false)
  const { data: entries } = useHistorique(tableNom, ligneId, open)

  if (!ligneId) return null

  return (
    <div className="mt-3 text-km-label text-km-faint">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 hover:text-km-muted"
      >
        <History className="h-3 w-3" />
        Historique{entries && entries.length > 0 ? ` (${entries.length})` : ''}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 border-l border-km-line pl-2.5">
          {!entries || entries.length === 0 ? (
            <p className="text-km-faint">Aucune modification enregistrée.</p>
          ) : (
            entries.map((h) => (
              <p key={h.id} className="text-km-faint">
                <span className={h.estUnePersonne ? 'font-medium text-km-muted' : 'italic text-km-faint'}>{h.auteur}</span>
                {' a modifié '}
                <span className="font-medium text-km-muted">{h.champ_libelle}</span>
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
