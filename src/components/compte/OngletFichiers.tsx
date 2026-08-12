import { useMemo, useState } from 'react'
import type { DocumentItem } from '@/types/domain'

/**
 * Onglet « Fichiers » — maquette « Fiche Compte » de William (12/08/2026).
 *
 * Filtres par catégorie en pastilles, zone de glisser-déposer, puis la liste avec une plaque
 * d'extension colorée par famille de fichier.
 */

/** Teinte de la plaque d'extension, par famille. */
const PLAQUES: Record<string, { couleur: string; fond: string }> = {
  pdf: { couleur: '#c2452d', fond: '#fbeae5' },
  jpg: { couleur: '#7c5bb0', fond: '#f1ecf8' },
  jpeg: { couleur: '#7c5bb0', fond: '#f1ecf8' },
  png: { couleur: '#7c5bb0', fond: '#f1ecf8' },
  eml: { couleur: '#3b5f8a', fond: '#e9eff6' },
  msg: { couleur: '#3b5f8a', fond: '#e9eff6' },
  xlsx: { couleur: '#0d7a5f', fond: '#eaf4f0' },
  csv: { couleur: '#0d7a5f', fond: '#eaf4f0' },
  docx: { couleur: '#4f5aa8', fond: '#eef0fa' },
}

function extension(nom: string): string {
  const point = nom.lastIndexOf('.')
  return point > 0 ? nom.slice(point + 1).toLowerCase() : 'fic'
}

export function OngletFichiers({
  documents,
  onAjouter,
  onOuvrir,
}: {
  documents: DocumentItem[]
  onAjouter: () => void
  onOuvrir: (doc: DocumentItem) => void
}) {
  const [categorie, setCategorie] = useState<string>('tous')
  const [survol, setSurvol] = useState(false)

  const categories = useMemo(() => {
    const parType = new Map<string, number>()
    for (const d of documents) parType.set(d.type_document, (parType.get(d.type_document) ?? 0) + 1)
    return [
      ['tous', 'Tous', documents.length] as const,
      ...[...parType.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => [t, t, n] as const),
    ]
  }, [documents])

  const affiches = categorie === 'tous' ? documents : documents.filter((d) => d.type_document === categorie)

  return (
    <div className="animate-kw-fade-slide flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {categories.map(([cle, label, n]) => {
          const actif = categorie === cle
          return (
            <button
              key={cle}
              type="button"
              onClick={() => setCategorie(cle)}
              className="cursor-pointer rounded-lg border px-[11px] py-[5px] text-[11px] font-semibold transition-all duration-[130ms]"
              style={{
                color: actif ? '#fff' : '#5c5f66',
                background: actif ? '#16181d' : '#fff',
                borderColor: actif ? '#16181d' : '#e0dfdb',
              }}
            >
              {label} <span className="font-mono text-[9.5px] opacity-70">{n}</span>
            </button>
          )
        })}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onAjouter}
          className="cursor-pointer whitespace-nowrap rounded-[7px] bg-[#16181d] px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#2c2f36]"
        >
          ＋ Ajouter un fichier
        </button>
      </div>

      {/*
        Zone de dépôt. Le `preventDefault` sur dragOver n'est pas décoratif : sans lui le navigateur
        refuse le dépôt et ouvre le fichier dans un onglet à la place, ce qui fait quitter la fiche.
        Le dépôt ouvre le formulaire d'ajout au lieu d'envoyer directement : le document a besoin
        d'une catégorie et d'un objet lié, que seul l'utilisateur peut donner.
      */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setSurvol(true)
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => {
          e.preventDefault()
          setSurvol(false)
          onAjouter()
        }}
        onClick={onAjouter}
        className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-all duration-[150ms]"
        style={{
          borderColor: survol ? '#0d7a5f' : '#dcdad5',
          background: survol ? '#eaf4f0' : '#fbfbfa',
          color: survol ? '#0d7a5f' : '#83868f',
        }}
      >
        <span className="text-xs font-bold">Glissez-déposez vos fichiers ici</span>
        <span className="text-[10.5px] opacity-75">PDF, images, emails — catégorisés ensuite en un clic</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#e7e6e2] bg-white">
        {affiches.map((d) => {
          const ext = extension(d.nom_fichier || d.nom)
          const plaque = PLAQUES[ext] ?? { couleur: '#5c5f66', fond: '#f2f1ee' }
          return (
            <div
              key={d.id}
              className="flex flex-wrap items-center gap-[11px] border-b border-[#f5f4f1] px-4 py-2.5 transition-colors last:border-b-0 hover:bg-[#fbfbfa]"
            >
              <span
                className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg text-[9px] font-extrabold uppercase"
                style={{ color: plaque.couleur, background: plaque.fond }}
              >
                {ext}
              </span>
              <div className="min-w-[170px] flex-1">
                <div className="truncate text-xs font-bold">{d.nom}</div>
                <div className="mt-px truncate text-[10px] text-[#a3a5a0]">
                  {d.auteur} · {new Date(d.date_creation).toLocaleDateString('fr-FR')}
                  {d.objet_lie ? ` · ${d.objet_lie}` : ''}
                </div>
              </div>
              <span className="rounded-[5px] bg-[#f2f1ee] px-2 py-1 text-[10px] font-semibold text-[#5c5f66]">
                {d.type_document}
              </span>
              <button
                type="button"
                onClick={() => onOuvrir(d)}
                className="cursor-pointer rounded-md border border-[#e0dfdb] px-2.5 py-1 text-[10.5px] font-semibold transition-colors hover:bg-[#f6f6f4]"
              >
                Ouvrir
              </button>
            </div>
          )
        })}

        {affiches.length === 0 && (
          <div className="p-5 text-center text-xs text-[#83868f]">
            {documents.length === 0 ? 'Aucun fichier sur ce compte' : 'Aucun fichier dans cette catégorie'}
          </div>
        )}
      </div>
    </div>
  )
}
