import { useRef, useState } from 'react'
import { Upload, Loader2, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Glisser-deposer de fichiers, avec categorisation.
 *
 * Demande du brief de William : « le glisser-deposer de fichiers est IMPERATIF, sur toutes les
 * fiches, avec categorisation (contrat, facture, avenant, mail, photo…) ». L'ajout passait
 * jusqu'ici par une modale, sur chaque fiche.
 *
 * Le composant ne sait rien du stockage : il collecte les fichiers, laisse choisir leur type, et
 * appelle `onDeposer`. Chaque fiche branche ce qu'elle veut derriere — c'est ce qui permet de le
 * poser sur compte, site, compteur, contrat, mandat et recommandation sans le dupliquer.
 *
 * Le clic reste possible : le glisser-deposer n'existe pas sur mobile, et certains preferent
 * l'explorateur de fichiers.
 */
export function ZoneDepotFichiers({
  types,
  onDeposer,
  accept,
  className,
}: {
  /** Categories proposees, telles que la table types_documents les nomme. */
  types: { id: string; libelle: string }[]
  /** Depot effectif. Recoit les fichiers et la categorie retenue. */
  onDeposer: (fichiers: File[], typeDocumentId: string | null) => Promise<void>
  accept?: string
  className?: string
}) {
  const [survol, setSurvol] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enAttente, setEnAttente] = useState<File[]>([])
  const [typeId, setTypeId] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function recevoir(liste: FileList | null) {
    setErreur(null)
    const fichiers = Array.from(liste ?? [])
    if (fichiers.length === 0) return
    // On ne depose pas tout de suite : la categorie se choisit d'abord, sinon les fichiers
    // arrivent tous en « Autre » et le classement est a refaire a la main.
    setEnAttente(fichiers)
  }

  async function confirmer() {
    if (enCours || enAttente.length === 0) return
    setEnCours(true)
    setErreur(null)
    try {
      await onDeposer(enAttente, typeId || null)
      setEnAttente([])
      setTypeId('')
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Le dépôt a échoué.")
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className={className}>
      <div
        onDragOver={(e) => { e.preventDefault(); setSurvol(true) }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => { e.preventDefault(); setSurvol(false); recevoir(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors',
          survol ? 'border-kiwi-500 bg-kiwi-50' : 'border-navy-200 hover:border-kiwi-400 hover:bg-navy-50',
        )}
      >
        <Upload className={cn('h-5 w-5', survol ? 'text-kiwi-600' : 'text-navy-400')} />
        <p className="text-sm font-medium text-navy-700">
          {survol ? 'Déposez vos fichiers ici' : 'Glissez des fichiers, ou cliquez pour parcourir'}
        </p>
        <p className="text-xs text-navy-400">Contrat, facture, avenant, mail, photo…</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={(e) => { recevoir(e.target.files); e.target.value = '' }}
        />
      </div>

      {enAttente.length > 0 && (
        <div className="mt-2.5 space-y-2 rounded-xl border border-navy-100 bg-white p-3">
          <ul className="space-y-1">
            {enAttente.map((f) => (
              <li key={f.name} className="flex items-center gap-2 text-xs text-navy-600">
                <FileText className="h-3.5 w-3.5 shrink-0 text-navy-400" />
                <span className="truncate">{f.name}</span>
                <span className="ml-auto shrink-0 font-mono text-navy-400">
                  {f.size > 1024 * 1024 ? `${(f.size / 1024 / 1024).toFixed(1)} Mo` : `${Math.round(f.size / 1024)} Ko`}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <select
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
              className="flex-1 rounded-lg border border-navy-200 bg-white px-2 py-1.5 text-xs text-navy-700 outline-none focus:border-kiwi-500"
            >
              <option value="">Catégorie…</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
            </select>
            <button
              type="button"
              onClick={() => { setEnAttente([]); setErreur(null) }}
              className="rounded-lg px-2.5 py-1.5 text-xs text-navy-500 hover:bg-navy-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={confirmer}
              disabled={enCours}
              className="flex items-center gap-1.5 rounded-lg bg-kiwi-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {enCours && <Loader2 className="h-3 w-3 animate-spin" />}
              {enCours ? 'Dépôt…' : `Déposer ${enAttente.length > 1 ? `(${enAttente.length})` : ''}`}
            </button>
          </div>

          {erreur && <p className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">{erreur}</p>}
        </div>
      )}
    </div>
  )
}
