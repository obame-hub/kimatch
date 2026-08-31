import { useMemo, useState } from 'react'
import type { DocumentItem } from '@/types/domain'
import { ZoneDepotFichiers } from '@/components/ui/zone-depot-fichiers'

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
  onOuvrir,
  onDeposer,
  typesDocuments,
  nomEntite,
}: {
  documents: DocumentItem[]
  onOuvrir: (doc: DocumentItem) => void
  /** Dépôt réel de fichiers. C'est le seul moyen d'ajouter : parcourir le poste, ou glisser. */
  onDeposer: (fichiers: File[], typeDocumentId: string | null) => Promise<void>
  typesDocuments?: { id: string; libelle: string }[]
  /**
   * Ce dont on parle quand il n'y a aucun fichier. Le composant a ete ecrit pour la fiche compte et
   * annoncait « aucun fichier sur ce compte » partout ou on le reutilisait — vu sur la fiche
   * opportunite le 23/08/2026.
   */
  nomEntite?: string
}) {
  const [categorie, setCategorie] = useState<string>('tous')

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
              className="cursor-pointer rounded-lg border px-[11px] py-[5px] text-km-label font-semibold transition-all duration-[130ms]"
              style={{
                color: actif ? '#fff' : '#5c5f66',
                background: actif ? '#16181d' : '#fff',
                borderColor: actif ? '#16181d' : '#e0dfdb',
              }}
            >
              {label} <span className="font-mono text-km-tiny opacity-70">{n}</span>
            </button>
          )
        })}
        {/* PAS DE BOUTON « Ajouter un fichier ». Naoelle, 21/08/2026 : « si on peut cliquer ou
            deposer c'est bon, pas besoin de bruit visuel avec un bouton. » La zone juste en dessous
            dit deja les deux gestes et les accepte tous les deux — le bouton doublait l'un d'eux
            sans rien ouvrir de plus. */}
      </div>

      {/*
        Zone de dépôt — un VRAI dépôt depuis le 16/08/2026.
        Jusque-là, glisser un fichier ne faisait qu'ouvrir un formulaire réclamant une URL : le
        fichier était perdu. Ce n'était pas un choix d'interface mais une contrainte de la base —
        le bucket « documents » ne portait aucune politique d'écriture, il n'y avait donc aucun
        moyen d'y déposer quoi que ce soit depuis le navigateur (migration 20260816130000).

        Il n'y a plus de zone de repli vers ce formulaire : Naoëlle, 21/08/2026 — « on n'ajoute
        jamais par URL, seulement parcourir le PC et glisser-déposer. »
      */}
      <ZoneDepotFichiers types={typesDocuments ?? []} onDeposer={onDeposer} />

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
                className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg text-km-tiny font-extrabold uppercase"
                style={{ color: plaque.couleur, background: plaque.fond }}
              >
                {ext}
              </span>
              <div className="min-w-[170px] flex-1">
                <div className="truncate text-xs font-bold">{d.nom}</div>
                <div className="mt-px truncate text-km-xs text-[#a3a5a0]">
                  {d.auteur} · {new Date(d.date_creation).toLocaleDateString('fr-FR')}
                  {d.objet_lie ? ` · ${d.objet_lie}` : ''}
                </div>
              </div>
              <span className="rounded-[5px] bg-[#f2f1ee] px-2 py-1 text-km-xs font-semibold text-[#5c5f66]">
                {d.type_document}
              </span>
              <button
                type="button"
                onClick={() => onOuvrir(d)}
                className="cursor-pointer rounded-md border border-[#e0dfdb] px-2.5 py-1 text-km-xs font-semibold transition-colors hover:bg-[#f6f6f4]"
              >
                Ouvrir
              </button>
            </div>
          )
        })}

        {affiches.length === 0 && (
          <div className="p-5 text-center text-xs text-[#83868f]">
            {documents.length === 0 ? `Aucun fichier sur ${nomEntite ?? 'ce compte'}` : 'Aucun fichier dans cette catégorie'}
          </div>
        )}
      </div>
    </div>
  )
}
