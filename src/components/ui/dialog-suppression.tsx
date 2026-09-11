import { Link2Off, Trash2, Ban, RotateCcw } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  useInventaireSuppression,
  pluriel,
  type TypeObjet,
} from '@/lib/data/inventaireSuppression'

/**
 * ══ LA POPUP QUI DIT CE QUE LA SUPPRESSION VA EMPORTER ══
 *
 * Naoëlle, 07/09/2026 : « quand on supprime un compte et n'importe quel objet, il faudrait qu'on ait
 * une pop-up qui montre tous les objets liés qui vont être supprimés. »
 *
 * Elle remplace un texte figé qui affirmait le contraire de ce qui se passe — voir l'en-tête de
 * `inventaireSuppression.ts`. Le principe : rien n'est écrit d'avance, tout est COMPTÉ sur le
 * dossier ouvert. « 4 contacts, 2 sites, 7 compteurs, 312 relevés » se lit autrement que « les
 * objets rattachés seront supprimés ».
 *
 * ══ TROIS DÉCISIONS DE FORME, ET CHACUNE A UNE RAISON ══
 *
 * LE BOUTON RESTE INERTE JUSQU'À CE QUE LE COMPTE SOIT FAIT. Un bouton actif pendant le chargement
 * laisse cliquer avant d'avoir lu, ce qui annule tout l'intérêt de la popup. Il attend, et il le dit.
 *
 * DÉTRUIT ET DÉTACHÉ NE SE MÉLANGENT PAS. Ce sont deux conséquences différentes : l'une est
 * irréversible, l'autre rend une ligne introuvable sans la perdre. Les afficher ensemble ferait soit
 * paniquer pour rien, soit rassurer à tort.
 *
 * UN COMPTAGE QUI ÉCHOUE BLOQUE LA SUPPRESSION. On ne propose pas de supprimer ce qu'on n'a pas su
 * mesurer : c'est précisément la situation où l'on découvre après coup ce qui est parti.
 */
export function DialogSuppression({
  ouvert,
  onFermer,
  type,
  id,
  /** Le nom de l'objet, tel qu'il s'affiche sur sa fiche. Sert à écrire le titre sans ambiguïté. */
  nom,
  onConfirmer,
  enCours,
  erreur,
}: {
  ouvert: boolean
  onFermer: () => void
  type: TypeObjet
  id: string | undefined
  nom: string
  onConfirmer: () => void
  enCours?: boolean
  erreur?: string | null
}) {
  const { data: inventaire, isLoading, error } = useInventaireSuppression(type, id, ouvert)

  const detruits = inventaire?.lignes.filter((l) => l.regime === 'detruit') ?? []
  const detaches = inventaire?.lignes.filter((l) => l.regime === 'detache') ?? []
  const bloquants = inventaire?.bloquants ?? []
  const bloque = bloquants.length > 0
  const pretAConfirmer = Boolean(inventaire) && !error && !bloque && !enCours

  return (
    <Dialog
      open={ouvert}
      onClose={onFermer}
      title={`Supprimer ${LIBELLE[type]} « ${nom} » ?`}
      className="max-w-[560px]"
    >
      {/* ── L'attente, annoncée ── */}
      {isLoading && (
        <p className="flex items-center gap-2 rounded-km border border-km-line bg-km-soft px-3 py-2.5 text-km-body text-km-muted">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-km-faint border-t-transparent" />
          Recherche de ce qui est rattaché…
        </p>
      )}

      {/* ── Un comptage impossible : on ne supprime pas à l'aveugle ── */}
      {error && (
        <div className="rounded-km border border-km-red-line bg-km-red-soft px-3 py-2.5">
          <p className="text-km-body font-bold text-km-red">Impossible de savoir ce qui est rattaché</p>
          <p className="mt-1 text-km-label leading-snug text-km-text">
            {error instanceof Error ? error.message : 'Erreur inconnue'}
          </p>
          <p className="mt-1.5 text-km-label leading-snug text-km-muted">
            La suppression est bloquée tant qu’on ne peut pas dire ce qu’elle emporterait.
          </p>
        </div>
      )}

      {/* ── Postgres refusera : autant le dire avant ── */}
      {bloque && (
        <div className="rounded-km border border-km-amber-line bg-km-amber-soft px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-km-body font-bold text-km-amber">
            <Ban className="h-3.5 w-3.5" /> Cette suppression est impossible
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {bloquants.map((l) => (
              <li key={l.libelle} className="text-km-label leading-snug text-km-text">
                <span className="font-bold">{pluriel(l.nombre, l.libelle)}</span>
                {l.detail && <span className="block text-km-muted">{l.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {inventaire && !error && !bloque && (
        <>
          {/* ── Ce qui disparaît ── */}
          {detruits.length > 0 ? (
            <div className="rounded-km border border-km-red-line bg-km-red-soft/50 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-km-label font-bold uppercase tracking-[0.06em] text-km-red">
                <Trash2 className="h-3.5 w-3.5" />
                Sera supprimé définitivement
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {detruits.map((l) => (
                  <li key={l.libelle} className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 text-km-body leading-snug text-km-text">
                      {pluriel(l.nombre, l.libelle)}
                      {l.detail && (
                        <span className="block text-km-label text-km-muted">{l.detail}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 border-t border-km-red-line pt-2 text-km-label font-semibold text-km-red">
                {inventaire.detruits.toLocaleString('fr-FR')} enregistrement
                {inventaire.detruits > 1 ? 's' : ''} au total.
              </p>
            </div>
          ) : (
            <p className="rounded-km border border-km-line bg-km-soft px-3 py-2.5 text-km-body text-km-muted">
              Rien n’est rattaché à {LIBELLE[type]} : seul {LIBELLE[type]} sera supprimé.
            </p>
          )}

          {/* ── Ce qui survit mais se détache ── */}
          {detaches.length > 0 && (
            <div className="mt-2 rounded-km border border-km-line bg-km-soft px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-km-label font-bold uppercase tracking-[0.06em] text-km-muted">
                <Link2Off className="h-3.5 w-3.5" />
                Sera conservé, mais perdra son lien
              </p>
              <p className="mt-1 text-km-label leading-snug text-km-faint">
                Ces enregistrements ne sont pas supprimés. Ils n’apparaîtront simplement plus sur
                aucune fiche, et seront donc difficiles à retrouver.
              </p>
              <ul className="mt-1.5 flex flex-col gap-0.5">
                {detaches.map((l) => (
                  <li key={l.libelle} className="text-km-body text-km-text">
                    {pluriel(l.nombre, l.libelle)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {erreur && (
        <p className="mt-2 rounded-km border border-km-red-line bg-km-red-soft px-3 py-2 text-km-label text-km-red">
          {erreur}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-3">
        <Button type="button" variant="ghost" onClick={onFermer}>
          Annuler
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!pretAConfirmer}
          onClick={onConfirmer}
          className={cn(
            'border-km-red-line text-km-red hover:bg-km-red-soft',
            !pretAConfirmer && 'cursor-not-allowed opacity-50',
          )}
        >
          {enCours
            ? 'Suppression…'
            : isLoading
              ? 'Vérification…'
              : bloque
                ? 'Suppression impossible'
                : inventaire && inventaire.detruits > 0
                  /* LE CHIFFRE EST DANS LE BOUTON. C'est le dernier endroit que l'œil traverse
                     avant le clic : y remettre le total évite le clic réflexe sur « Supprimer ». */
                  ? `Supprimer et détruire ${inventaire.detruits.toLocaleString('fr-FR')} enregistrement${inventaire.detruits > 1 ? 's' : ''}`
                  : 'Supprimer définitivement'}
        </Button>
      </div>

      {/* ══ CETTE MENTION DISAIT LE CONTRAIRE, ET ELLE ÉTAIT VRAIE LE MATIN MÊME ══
          Elle annonçait « Kimatch ne journalise pas les suppressions ». C'était exact quand la
          fenêtre a été écrite, et faux deux heures plus tard : la corbeille a été posée le
          07/09/2026. Une mise en garde périmée est pire qu'aucune — elle fait renoncer à une
          suppression légitime, et fait douter du reste de la fenêtre. */}
      {!bloque && !error && (
        <p className="flex items-start gap-1.5 pt-2 text-km-label leading-snug text-km-faint">
          <RotateCcw className="mt-0.5 h-3 w-3 shrink-0" />
          Cette suppression sera enregistrée dans la corbeille : un administrateur pourra la
          remettre en place depuis <span className="font-semibold">Administration → Corbeille</span>.
        </p>
      )}
    </Dialog>
  )
}

/** Le mot défini, pour écrire « Supprimer le compte » et non « Supprimer compte ». */
const LIBELLE: Record<TypeObjet, string> = {
  compte: 'le compte',
  site: 'le site',
  compteur: 'le compteur',
  contact: 'le contact',
  contrat: 'le contrat',
  mandat: 'le mandat',
  recommandation: 'la recommandation',
  opportunite: 'l’opportunité',
}
