import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Input, Label, Select, Textarea } from '@/components/ui/form'
import { useUpdateActionPartiel } from '@/lib/data/actions'
import { useProfilsActifs } from '@/lib/data/roles'
import { supabase } from '@/lib/supabase'
import { heureDe, instantTache, jourLocalISO } from '@/lib/heureTache'
import { cn } from '@/lib/utils'

/**
 * ══ MODIFIER UNE TÂCHE SANS QUITTER L'ÉCRAN OÙ ON LA VOIT ══
 *
 * William, 08/09/2026 : « possibilité aussi de modifier une tâche créée. Ajouter un bouton Crayon à
 * côté de supprimer et reporter afin de modifier les éléments modifiables. »
 *
 * La fiche de la tâche (`ActionDetail`) sait déjà tout modifier, champ par champ. Mais y aller
 * signifie quitter la recommandation qu'on est en train de lire, corriger un mot, puis revenir — et
 * l'on ne revient pas toujours. Les trois champs qu'on retouche vraiment depuis une carte sont
 * l'intitulé, l'échéance et le commentaire ; le reste (priorité, rattachements, responsable) relève
 * de la fiche, où l'on voit ce qu'on déplace.
 *
 * ── L'HEURE EST FACULTATIVE, ET LE RESTE ──
 *
 * Le champ heure part vide quand la tâche n'en a pas, et le bouton « retirer l'heure » la rend
 * facultative à nouveau. C'est la règle posée par William le même jour : une heure que personne n'a
 * choisie ne doit pas exister. `instantTache` traduit ça en base — sans heure, l'échéance vaut
 * minuit LOCAL, la seule écriture que `heureDe` relit comme « pas d'heure ».
 *
 * ── LES CHAMPS SONT CEUX DE L'APPLICATION, PAS DES PETITS ──
 *
 * Première version : des `<input>` fabriqués à la main, 9 px de texte, 4 px de marge intérieure.
 * William, 08/09/2026 : « augmente la taille des champs car c'est un peu trop petit ». Il avait
 * raison deux fois — c'était illisible, et c'était surtout un doublon : `Input`, `Textarea` et
 * `Label` existent dans `components/ui/form`, réglés à 34 px de haut et 13 px de texte, avec le
 * même anneau de focus vert que partout ailleurs. Un formulaire qui ne ressemble à aucun autre
 * formulaire de l'app est un formulaire qu'on relit avant de s'en servir.
 *
 * ── POURQUOI UN PANNEAU QUI POUSSE, ET PAS UNE MODALE ──
 *
 * Même raison que le report : ces cartes vivent dans le volet de droite, un conteneur en
 * `overflow-hidden` de 324 px. Une modale couperait le contexte qu'on est venu vérifier, et une
 * infobulle flottante y serait rognée.
 */
export function PanneauEditionTache({
  action,
  onFini,
  className,
}: {
  action: { id: string; titre: string; echeance: string | null; commentaire: string | null }
  onFini: () => void
  className?: string
}) {
  const majAction = useUpdateActionPartiel()
  const { data: profils } = useProfilsActifs()
  /* LE RESPONSABLE ACTUEL SE LIT ICI, et non par une nouvelle prop : ce panneau est monté depuis
     cinq écrans qui ne portent pas tous la même forme de tâche. Une requête d'une ligne, mise en
     cache, coûte moins qu'une prop à ajouter cinq fois — et qu'on oublierait une fois. */
  const { data: responsableActuel } = useQuery({
    queryKey: ['action', action.id, 'responsable'],
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase
        .from('actions').select('responsable_profil_id').eq('id', action.id).maybeSingle()
      return (data as { responsable_profil_id: string | null } | null)?.responsable_profil_id ?? null
    },
  })
  const [titre, setTitre] = useState(action.titre)
  /* ══ LE JOUR SE LIT DANS LE FUSEAU OÙ ON TRAVAILLE ══
     William, 15/09/2026, capture à l'appui : « j'ai modifié la date au 18/09 mais quand je demande
     de remodifier c'est la date du 17/09 qui est enregistrée ».

     L'écriture et la lecture n'utilisaient pas la même horloge. `instantTache` compose l'instant
     depuis l'heure LOCALE — une échéance au 18/09 sans heure vaut minuit à Paris, soit 22 h UTC le
     17. `.slice(0, 10)` découpait ensuite la chaîne ISO, donc rendait le jour UTC : le 17.

     Ce n'était pas un cas limite. 519 des 803 tâches qui portent une échéance sont dans ce cas —
     toutes celles saisies sans heure. `jourLocalISO` existe depuis le 08/09 pour cette famille de
     défaut ; il manquait ici. */
  const [date, setDate] = useState(jourLocalISO(action.echeance) ?? '')
  const [heure, setHeure] = useState(() => heureDe(action.echeance) ?? '')
  const [commentaire, setCommentaire] = useState(action.commentaire ?? '')
  const [erreur, setErreur] = useState<string | null>(null)
  /* `undefined` tant que la lecture n'a pas répondu : on ne veut pas écraser un responsable par
     « personne » simplement parce que la requête n'était pas encore revenue. */
  const [responsable, setResponsable] = useState<string | null | undefined>(undefined)
  const responsableChoisi = responsable === undefined ? (responsableActuel ?? null) : responsable

  async function enregistrer() {
    // `titre` est NOT NULL en base, et c'est la seule colonne affichée dans la liste des tâches :
    // une tâche sans intitulé y serait une ligne vide impossible à retrouver.
    if (!titre.trim()) {
      setErreur('L’intitulé est obligatoire.')
      return
    }
    try {
      await majAction.mutateAsync({
        id: action.id,
        patch: {
          titre: titre.trim(),
          date_prevue: date ? instantTache(date, heure || null) : null,
          commentaire: commentaire.trim() || null,
          responsable_profil_id: responsableChoisi,
        },
      })
      onFini()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible.')
    }
  }

  return (
    <div className={cn('animate-km-fade space-y-2.5 border-t border-km-line pt-2.5', className)}>
      <div>
        <Label htmlFor={`titre-${action.id}`}>Intitulé</Label>
        <Input
          id={`titre-${action.id}`}
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          placeholder="Ce qu'il y a à faire"
        />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[8rem] flex-1">
          <Label htmlFor={`date-${action.id}`}>Échéance</Label>
          <Input
            id={`date-${action.id}`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="min-w-[6.5rem] flex-1">
          <Label htmlFor={`heure-${action.id}`}>
            Heure <span className="font-normal text-km-faint">(facultative)</span>
          </Label>
          <Input
            id={`heure-${action.id}`}
            type="time"
            value={heure}
            onChange={(e) => setHeure(e.target.value)}
            disabled={!date}
            className="disabled:opacity-50"
          />
        </div>
        {heure && (
          <button
            type="button"
            onClick={() => setHeure('')}
            title="Retirer l’heure : la tâche redevient une échéance de journée"
            className="mb-2 rounded-km-sm px-1.5 py-0.5 text-km-label font-semibold text-km-faint transition-colors hover:text-km-text"
          >
            sans heure
          </button>
        )}
      </div>

      <div>
        <Label htmlFor={`responsable-${action.id}`}>Responsable</Label>
        <Select
          id={`responsable-${action.id}`}
          value={responsableChoisi ?? ''}
          onChange={(e) => setResponsable(e.target.value || null)}
        >
          <option value="">Personne</option>
          {(profils ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {[p.prenom, p.nom].filter(Boolean).join(' ') || 'Sans nom'}
            </option>
          ))}
        </Select>
        {!responsableChoisi && (
          <p className="mt-1 text-km-label text-km-amber">
            Sans responsable, cette tâche n’apparaît dans la journée de personne.
          </p>
        )}
      </div>

      <div>
        <Label htmlFor={`commentaire-${action.id}`}>Commentaire</Label>
        <Textarea
          id={`commentaire-${action.id}`}
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          rows={5}
          placeholder="Ce qu'il faut savoir avant de s'y mettre"
          className="resize-y leading-relaxed"
        />
      </div>

      {erreur && <p className="text-km-label font-semibold text-km-red">{erreur}</p>}

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={majAction.isPending}
          onClick={enregistrer}
          className="rounded-km bg-km-green px-3 py-1.5 text-km-label font-bold text-white transition-colors hover:brightness-95 disabled:opacity-50"
        >
          {majAction.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button
          type="button"
          onClick={onFini}
          className="rounded-km px-2.5 py-1.5 text-km-label font-semibold text-km-muted transition-colors hover:bg-km-soft hover:text-km-text"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
