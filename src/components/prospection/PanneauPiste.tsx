import { ArrowRight, Check, Paperclip, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Sheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useMajPiste, VALIDATIONS_PISTE, pisteQualifiee } from '@/lib/data/prospection'
import { cn } from '@/lib/utils'
import type { Piste } from '@/types/domain'

/**
 * LE PANNEAU D'UNE PISTE — tout ce qu'on peut faire dessus, au clic sur sa carte.
 *
 * Naoëlle, 25/08/2026 : « crée les actions sur les pistes, les listes ne servent à rien, on fera tout
 * sur pistes ». Et avant cela, la contrainte qui rendait le kanban impossible : retirer la liste des
 * pistes supprimait les SEULES actions qui existent sur une piste — cocher ses cinq validations, la
 * convertir en opportunité, y joindre un fichier. Une opportunité ou une recommandation a une fiche
 * où sa carte peut mener ; la piste n'en a pas.
 *
 * UN PANNEAU PLUTÔT QU'UNE PAGE, et c'est un choix assumé. Une fiche piste demanderait une route, un
 * chargement par identifiant, un fil d'Ariane et un retour — pour un objet qui vit quelques jours et
 * dont le travail consiste à cocher cinq cases avant de disparaître en opportunité. Le panneau garde
 * le tableau visible derrière lui : on coche, on ferme, on voit la carte changer de colonne.
 *
 * LES CINQ VALIDATIONS SE FIGENT APRÈS CONVERSION. Une piste convertie a produit son opportunité :
 * décocher une case après coup ne défferait rien et laisserait deux objets qui se contredisent.
 */
export function PanneauPiste({
  piste,
  onFermer,
  onConvertir,
  onFichiers,
  signaler,
}: {
  piste: Piste | null
  onFermer: () => void
  /** Ouvre le dialogue de conversion — il demande le signal, donc il vit au niveau de la page. */
  onConvertir: (piste: Piste) => void
  onFichiers: (piste: Piste) => void
  signaler: (message: string) => void
}) {
  const navigate = useNavigate()
  const maj = useMajPiste()

  const mure = piste ? pisteQualifiee(piste) : false
  const faites = piste ? VALIDATIONS_PISTE.filter((v) => Boolean(piste[v.cle])).length : 0
  const convertie = Boolean(piste?.opportunite_id)

  return (
    <Sheet
      open={Boolean(piste)}
      onClose={onFermer}
      title={piste?.societe || piste?.contact_nom || 'Piste'}
      description={
        convertie
          ? 'Convertie en opportunité — ses vérifications sont figées.'
          : 'Cinq vérifications avant de pouvoir lancer l’opportunité.'
      }
    >
      {piste && (
        <div className="space-y-4">
          {/* ── QUI C'EST ── */}
          <div className="flex items-start gap-2.5 rounded-km-md border border-km-line bg-km-soft p-3">
            <span
              className={cn(
                'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                convertie ? 'bg-kiwi-50 text-km-green' : 'bg-indigo-50 text-indigo-600',
              )}
            >
              <Users className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-km-body font-bold text-km-text">{piste.societe || 'Société inconnue'}</p>
              <p className="truncate text-km-body text-km-muted">
                {piste.reference && <span className="font-mono text-km-faint">{piste.reference} · </span>}
                {piste.contact_nom || 'Contact inconnu'}
              </p>
              <p className="truncate text-km-label text-km-faint">
                {[piste.email, piste.telephone].filter(Boolean).join(' · ') || 'Ni e-mail ni téléphone'}
              </p>
            </div>
            {convertie ? (
              <Badge tone="kiwi">Convertie</Badge>
            ) : (
              <Badge tone={mure ? 'kiwi' : 'amber'}>{faites}/5</Badge>
            )}
          </div>

          {/* ── L'AVANCEMENT ──
              Cinq cases cochées se comptent mal du regard, une barre se lit d'un coup. */}
          {!convertie && (
            <div className="h-1 overflow-hidden rounded-full bg-km-soft">
              <div
                className={cn('h-full rounded-full transition-[width] duration-500', mure ? 'bg-km-green' : 'bg-indigo-500')}
                style={{ width: `${(faites / VALIDATIONS_PISTE.length) * 100}%` }}
              />
            </div>
          )}

          {/* ── LES CINQ VÉRIFICATIONS ── */}
          <div className="flex flex-col gap-1">
            {VALIDATIONS_PISTE.map((v) => {
              const coche = Boolean(piste[v.cle])
              return (
                <button
                  key={v.cle}
                  type="button"
                  disabled={convertie}
                  onClick={async () => {
                    try {
                      await maj.mutateAsync({ id: piste.id, patch: { [v.cle]: !coche } })
                    } catch (e) {
                      signaler(e instanceof Error ? e.message : 'Enregistrement impossible')
                    }
                  }}
                  className={cn(
                    'flex items-center gap-2.5 rounded-km px-2.5 py-2 text-left text-km-body transition-colors',
                    coche ? 'text-km-text' : 'text-km-muted',
                    !convertie && 'hover:bg-km-soft',
                    convertie && 'cursor-default',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded',
                      coche ? 'bg-km-green text-white' : 'border border-km-line bg-white',
                    )}
                  >
                    {coche && <Check className="h-2.5 w-2.5" />}
                  </span>
                  {v.libelle}
                </button>
              )
            })}
          </div>

          {/* ── CE QU'ON PEUT FAIRE ── */}
          {convertie ? (
            <Button
              variant="outline"
              onClick={() => {
                onFermer()
                navigate(`/opportunites/${piste.opportunite_id}`)
              }}
            >
              Ouvrir l’opportunité
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <div>
              <Button disabled={!mure} onClick={() => onConvertir(piste)}>
                Créer l’opportunité
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
              {!mure && (
                <p className="mt-1.5 text-km-label leading-snug text-km-faint">
                  Les cinq vérifications doivent être faites : sans elles on ouvrirait une affaire sur
                  un contact qu’on ne sait pas joindre.
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => onFichiers(piste)}
            className="flex items-center gap-1.5 text-km-body font-bold text-indigo-600 hover:underline"
          >
            <Paperclip className="h-3 w-3" /> Fichiers de la piste
          </button>
        </div>
      )}
    </Sheet>
  )
}
