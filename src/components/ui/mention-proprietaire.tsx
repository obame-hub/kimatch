import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useProfilsAdmin } from '@/lib/data/roles'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE PROPRIÉTAIRE D'UNE FICHE — UNE MENTION QUI SE CLIQUE, PAS UNE CARTE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 14/09/2026, sur la fiche compte : « le rendu est complètement différent de ce que tu m'as
 * mis dans ton design, notamment concernant la card du propriétaire ». Une carte encadrée dans une
 * ligne d'identité fait un objet de plus à la hauteur du nom ; le propriétaire redevient une
 * mention — une initiale, un nom, un chevron.
 *
 * ══ POURQUOI C'EST UN COMPOSANT PARTAGÉ ══
 *
 * William, 16/09/2026, sur la fiche piste : « le système de propriétaire doit également être le
 * même, c'est-à-dire que c'est un champ modifiable en liste ». Il était ici en texte mort.
 *
 * La recopier aurait marché aujourd'hui et divergé au premier ajustement — c'est exactement ce qui
 * est arrivé à la frise, puis au suivi DocuSign, tous deux écrits deux fois avant d'être réunis. Le
 * dessin vit donc à un seul endroit ; ce qui change d'une fiche à l'autre — quoi enregistrer, et
 * quelles dates montrer — arrive en paramètres.
 *
 * LES DATES SONT EN INFOBULLE, pas sur deux lignes : « créé le… · modifié le… » se consulte une
 * fois par dossier, et l'onglet Historique existe pour ça.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function MentionProprietaire({
  nom,
  dates,
  canManage,
  onChoisir,
}: {
  /** Le nom affiché — `null` quand la fiche n'a pas de propriétaire. */
  nom: string | null
  /** La ligne « Créé le… · modifié le… », ou une chaîne vide. */
  dates?: string
  canManage: boolean
  /** Reçoit l'identifiant du profil retenu, ou `null` pour « Aucun ». */
  onChoisir: (profilId: string | null) => void | Promise<void>
}) {
  const { data: profilsAdmin } = useProfilsAdmin()
  const [ouvert, setOuvert] = useState(false)
  const zone = useRef<HTMLDivElement>(null)

  /* La liste se referme au clic dehors et à Échap — le même contrat que le menu « ⋯ » du bandeau.
     Sans ça, une liste ouverte suit la navigation d'onglet en onglet. */
  useEffect(() => {
    if (!ouvert) return
    const auClic = (e: MouseEvent) => {
      if (zone.current && !zone.current.contains(e.target as Node)) setOuvert(false)
    }
    const auClavier = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false) }
    document.addEventListener('mousedown', auClic)
    document.addEventListener('keydown', auClavier)
    return () => {
      document.removeEventListener('mousedown', auClic)
      document.removeEventListener('keydown', auClavier)
    }
  }, [ouvert])

  const initiales = nom
    ? nom.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
    : '—'

  return (
    <div className="relative shrink-0" ref={zone}>
      <button
        type="button"
        disabled={!canManage}
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        title={[canManage ? 'Propriétaire — cliquer pour réattribuer' : 'Propriétaire', dates].filter(Boolean).join(' — ')}
        className="flex h-8 items-center gap-1.5 rounded-km px-1.5 transition-colors enabled:hover:bg-km-soft disabled:cursor-default"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-km-soft text-km-tiny font-bold text-km-muted">{initiales}</span>
        <span className="hidden text-km-label font-semibold text-km-muted lg:inline">{nom || 'Sans propriétaire'}</span>
        {canManage && <ChevronDown className="h-3 w-3 text-km-faint" />}
      </button>

      {ouvert && (
        <div className="absolute right-0 top-full z-30 mt-1 max-h-64 w-52 overflow-y-auto rounded-km-md border border-km-line bg-km-surface py-1 shadow-km-pop">
          <button
            type="button"
            onClick={() => { setOuvert(false); void onChoisir(null) }}
            className="block w-full px-3 py-1.5 text-left text-km-name text-km-muted hover:bg-km-soft"
          >
            Aucun
          </button>
          {profilsAdmin?.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { setOuvert(false); void onChoisir(p.id) }}
              className="block w-full px-3 py-1.5 text-left text-km-name text-km-muted hover:bg-km-soft"
            >
              {p.prenom} {p.nom}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
