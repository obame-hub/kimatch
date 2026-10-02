import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUpdateDocumentPartiel } from '@/lib/data/documents'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_TYPES_DOCUMENTS } from '@/lib/referenceFallbacks'
import { teinteCategorie } from '@/lib/categoriesDocuments'

/**
 * LA CATÉGORIE D'UNE PIÈCE JOINTE, CHANGÉE EN UN CLIC — William, 02/10/2026 : « peu importe où tu
 * ajoutes une pièce jointe, cette pièce jointe doit toujours avoir une catégorie (Facture, mandat, appel
 * d'offres, contrat, RIB, certificat, avenant, appel, mail, offre fournisseur, autre). Sur le fichier,
 * possibilité de changer cette catégorie en un clic. »
 *
 * Une pastille teintée par catégorie ; un clic ouvre la liste, un choix l'enregistre. Le menu se pose
 * à l'écran (`fixed`) : les listes de fichiers défilent et rogneraient ce qui dépasse.
 */
export function CategorieDocument({ documentId, code, libelle, modifiable = true, onChange }: {
  documentId: string
  code: string | null | undefined
  libelle?: string | null
  modifiable?: boolean
  /** Prévenu après l'enregistrement (une liste locale à rafraîchir, un toast). */
  onChange?: (code: string) => void
}) {
  const { data } = useReferenceTable('types_documents')
  const types = data && data.length ? data : FALLBACK_TYPES_DOCUMENTS
  const maj = useUpdateDocumentPartiel()
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const bouton = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!pos) return
    const fermer = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node) && !bouton.current?.contains(e.target as Node)) setPos(null) }
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setPos(null) } }
    const defile = (e: Event) => { if (!menu.current?.contains(e.target as Node)) setPos(null) }
    document.addEventListener('mousedown', fermer)
    window.addEventListener('keydown', echap, true)
    window.addEventListener('scroll', defile, true)
    return () => {
      document.removeEventListener('mousedown', fermer)
      window.removeEventListener('keydown', echap, true)
      window.removeEventListener('scroll', defile, true)
    }
  }, [pos])

  const actuel = types.find((t) => t.code === code)
  const nom = actuel?.libelle ?? libelle ?? 'Autre'
  const [fg, bg] = teinteCategorie(code)
  const pastille = 'inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-[6px] px-2 py-[3px] text-[10px] font-bold leading-[14px]'

  if (!modifiable) return <span className={pastille} style={{ color: fg, background: bg }}>{nom}</span>

  const ouvrir = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (pos) { setPos(null); return }
    const r = bouton.current?.getBoundingClientRect()
    if (!r) return
    const hauteur = 36 + types.length * 30
    setPos({ top: window.innerHeight - r.bottom < hauteur + 8 ? Math.max(8, r.top - hauteur - 4) : r.bottom + 4, left: Math.min(r.left, window.innerWidth - 208) })
  }
  const choisir = (id: string, c: string) => {
    setPos(null)
    if (c === code) return
    setErreur(null)
    maj.mutateAsync({ id: documentId, patch: { type_document_id: id } })
      .then(() => onChange?.(c))
      .catch((x: Error) => setErreur(x.message))
  }

  return (
    <>
      <button
        ref={bouton}
        type="button"
        onClick={ouvrir}
        aria-haspopup="listbox"
        aria-expanded={!!pos}
        title={erreur ? `La catégorie n’a pas pu être changée : ${erreur}` : 'Changer la catégorie'}
        className={cn(pastille, 'group transition-shadow hover:shadow-[0_0_0_1px_currentColor]', erreur && 'ring-1 ring-km-red')}
        style={{ color: fg, background: bg }}
      >
        <span className="truncate">{maj.isPending ? '…' : nom}</span>
        <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-50 group-hover:opacity-100" aria-hidden="true" />
      </button>
      {pos && (
        <div ref={menu} role="listbox" aria-label="Catégorie du fichier" onClick={(e) => e.stopPropagation()} style={{ top: pos.top, left: pos.left }} className="fixed z-[80] flex w-[200px] flex-col rounded-km-md border border-km-line bg-white p-1 shadow-km-pop">
          <span className="px-2 pb-1 pt-1 text-[9.5px] font-extrabold uppercase tracking-[.08em] text-km-faint">Catégorie</span>
          {types.map((t) => {
            const [tfg, tbg] = teinteCategorie(t.code)
            return (
              <button key={t.id} type="button" role="option" aria-selected={t.code === code} onClick={(e) => { e.stopPropagation(); choisir(t.id, t.code) }} className="flex h-[30px] items-center gap-2 rounded-km-sm px-2 text-left text-[12px] font-semibold text-km-text hover:bg-km-soft">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tfg, boxShadow: `0 0 0 2px ${tbg}` }} aria-hidden="true" />
                <span className="flex-1">{t.libelle}</span>
                {t.code === code && <Check className="h-3.5 w-3.5 text-km-green" />}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
