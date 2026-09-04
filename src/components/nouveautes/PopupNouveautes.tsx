import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Check } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CartePublication } from '@/components/nouveautes/CartePublication'
import {
  useMarquerLues,
  useMesLectures,
  useNouveautesNonLues,
  usePublications,
  type Publication,
} from '@/lib/data/publications'

/**
 * CE QUE L'ÉQUIPE N'A PAS ENCORE LU.
 *
 * ══ LA LISTE EST GELÉE À L'OUVERTURE, ET C'EST TOUT L'ENJEU ══
 *
 * La popup montre les non-lues, et son ouverture les marque lues. Écrit naïvement, ce couple se
 * mange lui-même : l'enregistrement des lectures rafraîchit la requête, « non lues » devient vide,
 * et la fenêtre se vide sous les yeux de celui qui vient de l'ouvrir — il voit un éclair de texte
 * puis « vous êtes à jour ».
 *
 * D'où la copie prise au moment où les données sont prêtes, et affichée telle quelle jusqu'à la
 * fermeture. La pastille du menu, elle, s'éteint immédiatement : c'est le comportement attendu des
 * deux côtés, et ils ne lisent simplement pas la même source.
 */
export function PopupNouveautes({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { data: publications } = usePublications()
  const { data: lectures } = useMesLectures()
  const nonLues = useNouveautesNonLues()
  const marquerLues = useMarquerLues()

  const [gelees, setGelees] = useState<Publication[] | null>(null)
  const pret = publications !== undefined && lectures !== undefined

  useEffect(() => {
    if (!open) {
      setGelees(null)
      return
    }
    if (gelees !== null || !pret) return
    setGelees(nonLues)
    if (nonLues.length > 0) marquerLues.mutate(nonLues.map((p) => p.id))
    // `nonLues` et `marquerLues` sont volontairement hors des dépendances : la copie ne doit se
    // faire qu'une fois, et les y mettre relancerait l'effet à chaque rafraîchissement du cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pret, gelees])

  const liste = gelees ?? []

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Dernières mises à jour"
      description={
        liste.length > 0
          ? `${liste.length} publication${liste.length > 1 ? 's' : ''} que vous n’aviez pas encore lue${liste.length > 1 ? 's' : ''}`
          : undefined
      }
      className="max-w-2xl"
    >
      {!pret ? (
        <p className="py-8 text-center text-km-body text-km-faint">Chargement…</p>
      ) : liste.length === 0 ? (
        <div className="py-8 text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-km-green-soft">
            <Check className="h-5 w-5 text-km-green" />
          </span>
          <p className="mt-3 text-km-body font-semibold text-km-text">Vous êtes à jour</p>
          <p className="mt-1 text-km-label text-km-faint">
            Aucune nouveauté depuis votre dernière visite.
          </p>
        </div>
      ) : (
        <div className="-mx-1 max-h-[60vh] overflow-y-auto px-1">
          {liste.map((publication, i) => (
            <div
              key={publication.id}
              className={i > 0 ? 'mt-5 border-t border-km-line pt-5' : undefined}
            >
              <CartePublication publication={publication} />
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex justify-end border-t border-km-line pt-4">
        <Button
          type="button"
          onClick={() => {
            onClose()
            navigate('/nouveautes')
          }}
        >
          Voir toutes les modifications
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Dialog>
  )
}
