/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES APPELS QUI NE SE RATTACHENT À RIEN
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 23/09/2026 : « si ce n'est pas possible parce qu'ils sont avec leur téléphone, s'ils ne
 * l'ont pas fait, il faut ajouter une liste, par exemple dans la vue d'ensemble, où on leur dit
 * voici les appels non liés. »
 *
 * ══ POURQUOI CETTE LISTE EXISTE ══
 *
 * Parce que la fenêtre de fin d'appel ne peut pas toujours s'ouvrir : un appel passé depuis le
 * mobile n'a pas d'écran Kimatch devant lui. Et parce qu'elle se ferme sans rien choisir — c'était
 * la consigne, et c'est ce qui la rend supportable quarante fois par jour.
 *
 * Mesuré avant de l'écrire : 435 appels sur 699 des trente derniers jours ne sont rattachés ni à
 * une opportunité, ni à une recommandation, ni à une requête, ni à une piste.
 *
 * ══ TRENTE JOURS, PAS PLUS ══
 *
 * Au-delà, on ne se souvient plus de quoi on a parlé, et une liste qu'on ne peut pas traiter
 * devient du décor — qu'on apprend à ignorer. La même leçon que la carte d'appel du 22/09.
 *
 * ══ ELLE DISPARAÎT QUAND ELLE EST VIDE ══
 *
 * Un bloc « aucun appel non lié » sur la vue d'ensemble occuperait la place d'une information
 * utile pour ne rien dire. Quand il n'y a rien à rattraper, il n'y a rien à afficher.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useState } from 'react'
import { PhoneCall, Link2 } from 'lucide-react'
import { useAppelsNonLies, type AppelALier } from '@/lib/data/liensAppel'
import { useMonProfil } from '@/lib/data/roles'
import { LierAppel } from '@/components/allo/LierAppel'
import { numeroLisible } from '@/lib/telephonie'

/** Le nombre de lignes montrées d'emblée : au-delà, on déplie. */
const APERCU = 5

function quand(iso: string): string {
  const d = new Date(iso)
  const jours = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (jours === 0) return `aujourd’hui ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  if (jours === 1) return 'hier'
  return `il y a ${jours} jours`
}

export function AppelsNonLies() {
  const { data: profil } = useMonProfil()
  const { data: appels, isLoading, isError } = useAppelsNonLies(profil?.id ?? null)
  const [aLier, setALier] = useState<AppelALier | null>(null)
  const [tout, setTout] = useState(false)

  /* ON NE MONTRE RIEN TANT QU'ON NE SAIT PAS, et rien non plus quand la liste est vide : voir
     l'en-tête. Un échec de lecture, en revanche, SE DIT — sinon on croirait avoir tout rattaché. */
  if (isLoading || !profil) return null
  if (isError) {
    return (
      <div className="rounded-km border border-km-line bg-white p-4">
        <p className="text-km-xs text-km-red">
          Impossible de lire les appels non liés.
        </p>
      </div>
    )
  }
  if (!appels || appels.length === 0) return null

  const visibles = tout ? appels : appels.slice(0, APERCU)

  return (
    <>
      <div className="rounded-km border border-km-line bg-white p-4">
        <div className="flex items-center gap-2">
          <PhoneCall className="h-4 w-4 text-km-amber" />
          <h3 className="flex-1 text-km-sm font-semibold text-km-text">Appels à rattacher</h3>
          <span className="rounded-md bg-km-amber-soft px-1.5 py-0.5 text-km-tiny font-bold text-km-amber">
            {appels.length}
          </span>
        </div>
        <p className="mt-1 text-km-xs text-km-muted">
          Ces appels ne sont rattachés à aucune opportunité, recommandation, requête ni piste.
        </p>

        <ul className="mt-3 space-y-1">
          {visibles.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setALier(a)}
                className="flex w-full items-center gap-2.5 rounded-km px-2 py-2 text-left transition-colors hover:bg-km-soft"
              >
                <span className="min-w-0 flex-1">
                  {/* LE NOM D'ABORD QUAND ON L'A. Un numéro nu ne dit à personne de quoi il
                      s'agissait — c'est la remarque de Thomas du 21/09, et elle vaut ici autant
                      que sur la carte d'appel. */}
                  <span className="block truncate text-km-xs font-semibold text-km-text">
                    {a.contact_nom ?? a.compte_nom ?? numeroLisible(a.numero) ?? 'Correspondant inconnu'}
                  </span>
                  <span className="block truncate text-km-tiny text-km-muted">
                    {a.compte_nom && a.contact_nom ? `${a.compte_nom} · ` : ''}
                    {quand(a.date_interaction)}
                  </span>
                </span>
                <Link2 className="h-3.5 w-3.5 shrink-0 text-km-faint" />
              </button>
            </li>
          ))}
        </ul>

        {appels.length > APERCU && (
          <button
            type="button"
            onClick={() => setTout((t) => !t)}
            className="mt-2 text-km-xs font-semibold text-km-green hover:underline"
          >
            {tout ? 'Voir moins' : `Voir les ${appels.length - APERCU} autres`}
          </button>
        )}
      </div>

      {aLier && (
        <LierAppel
          interactionId={aLier.id}
          compteId={aLier.compte_id}
          contactId={aLier.contact_id}
          nomCorrespondant={aLier.contact_nom ?? aLier.compte_nom}
          onFerme={() => setALier(null)}
        />
      )}
    </>
  )
}
