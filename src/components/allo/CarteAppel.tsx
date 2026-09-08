/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA CARTE D'APPEL — CE QUI REMPLACE LE BOUTON « RACCROCHER »
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, réunion du 08/09/2026 : « quand tu cliquais, ça ouvrait l'application en arrière-plan et
 * ça lançait l'appel. Mais tu n'avais aucun moyen de raccrocher en dehors de l'application Allo. Il
 * faut qu'on trouve une solution pour pouvoir raccrocher depuis Kimatch, c'est important. »
 *
 * ON NE PEUT PAS. L'API d'Allo n'expose aucun contrôle d'appel — vérifié sur leur table complète
 * portée-par-endpoint, une soixantaine d'endpoints et pas un qui décroche ou raccroche. Cockpit ne
 * le faisait pas non plus.
 *
 * Mais le besoin derrière la demande, c'est de ne pas avoir à aller dans Allo. Cette carte y répond :
 * elle s'ouvre quand l'appel part, dit quand le correspondant décroche, et affiche le résultat quand
 * c'est fini. Le commercial ne quitte jamais Kimatch — il raccroche avec son casque, comme il l'a
 * toujours fait, et Kimatch le sait.
 *
 * ══ UN SEUL GESTE DEMANDÉ ══
 *
 * Michel : « il faut mettre en place ce que les commerciaux vont vraiment faire dans la réalité. Si
 * c'est mettre "je l'ai eu, je l'ai pas eu" et que c'est obligatoire, ils le feront. Mais qu'à chaque
 * fois ils mettent une note, ils ne le feront quasiment jamais. »
 *
 * Quatre boutons, aucun champ de saisie. C'est tout ce que cette carte demande.
 *
 * ══ LA DEMI-MINUTE D'INCERTITUDE, DITE ET NON CACHÉE ══
 *
 * `call.completed` arrive environ trente secondes après le raccrochage. Pendant ce temps, Kimatch ne
 * PEUT PAS savoir que l'appel est fini. La carte affiche donc « en ligne » avec son chronomètre, et
 * la qualification reste offerte : le commercial qui a déjà raccroché clique, et la carte se ferme
 * sans attendre Allo. Prétendre détecter le raccrochage aurait été le seul vrai mensonge possible
 * ici.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PhoneCall, PhoneIncoming, Voicemail, Bot, PhoneOff, User, X, Play } from 'lucide-react'
import {
  useAppelEnCours,
  useQualifierAppel,
  useEcarterAppel,
  etatDeLAppel,
  aRencontreUnServeurVocal,
  secondesEcoulees,
  dureeLisible,
  type Qualification,
} from '@/lib/data/appelEnCours'
import { numeroLisible } from '@/lib/telephonie'
import { cn } from '@/lib/utils'

/** Les quatre choix, dans l'ordre où on les rencontre au téléphone. */
const CHOIX: { valeur: Qualification; libelle: string; Icone: typeof User }[] = [
  { valeur: 'HUMAIN', libelle: 'Quelqu’un', Icone: User },
  { valeur: 'REPONDEUR', libelle: 'Répondeur', Icone: Voicemail },
  { valeur: 'SERVEUR_VOCAL', libelle: 'Serveur vocal', Icone: Bot },
  { valeur: 'PAS_DE_REPONSE', libelle: 'Pas de réponse', Icone: PhoneOff },
]

export function CarteAppel() {
  const { data: appel } = useAppelEnCours()
  const qualifier = useQualifierAppel()
  const ecarter = useEcarterAppel()
  const navigate = useNavigate()

  /* LE CHRONOMÈTRE EST UN ÉTAT LOCAL, pas une relecture. La carte se rafraîchit toutes les quatre
     secondes ; un chronomètre qui n'avancerait qu'à ce rythme sauterait de quatre en quatre et se
     lirait comme une horloge cassée. Une seconde ici ne coûte rien : aucune requête. */
  const [maintenant, setMaintenant] = useState(() => Date.now())
  useEffect(() => {
    if (!appel) return
    const t = setInterval(() => setMaintenant(Date.now()), 1000)
    return () => clearInterval(t)
  }, [appel])

  if (!appel) return null

  const etat = etatDeLAppel(appel)
  const serveurVocal = aRencontreUnServeurVocal(appel)
  const secondes = appel.duree_secondes ?? secondesEcoulees(appel, maintenant)
  const entrant = appel.sens === 'ENTRANT'

  const versLaFiche = () => {
    if (appel.contact_id) navigate(`/contacts/${appel.contact_id}`)
    else if (appel.piste_id) navigate(`/pistes/${appel.piste_id}`)
    else if (appel.compte_id) navigate(`/comptes/${appel.compte_id}`)
  }
  const fichePossible = Boolean(appel.contact_id || appel.piste_id || appel.compte_id)

  return (
    /* ══ EN BAS À DROITE, MAIS JAMAIS SUR LA PASTILLE NI SUR ALLO ══
     *
     * `bottom-20` et non `bottom-4` : la pastille « Téléphone » occupe le coin, et la carte se posait
     * dessus. Et `right` suit `--volet-allo`, la largeur que le volet Allo annonce quand il est
     * ouvert — sinon la carte recouvrirait l'interface d'Allo, donc peut-être son bouton raccrocher.
     * C'est le seul bouton de tout ce dispositif qu'il ne faut jamais masquer. */
    <div
      className="fixed bottom-20 z-[70] w-[320px] overflow-hidden rounded-km border border-km-line bg-white shadow-km-pop"
      style={{ right: 'calc(1rem + var(--volet-allo, 0px))' }}
    >
      {/* ── L'ÉTAT, en une ligne de couleur ── */}
      <div
        className={cn(
          'flex items-center gap-2 px-3.5 py-2.5',
          etat === 'sonne' && 'bg-km-amber-soft text-km-amber',
          etat === 'en_ligne' && 'bg-km-green-soft text-km-green',
          etat === 'termine' && 'bg-km-soft text-km-muted',
        )}
      >
        {entrant ? <PhoneIncoming className="h-4 w-4 shrink-0" /> : <PhoneCall className="h-4 w-4 shrink-0" />}
        <span className="flex-1 text-km-label font-bold uppercase tracking-[0.06em]">
          {etat === 'sonne' && (entrant ? 'Appel entrant' : 'Ça sonne')}
          {etat === 'en_ligne' && 'En ligne'}
          {etat === 'termine' && 'Appel terminé'}
        </span>
        <span className="shrink-0 font-mono text-km-label tabular-nums">{dureeLisible(secondes)}</span>
        <button
          type="button"
          onClick={() => ecarter.mutate(appel.id)}
          title="Fermer sans qualifier"
          className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="px-3.5 py-3">
        {/* ── QUI EST AU BOUT DU FIL ──
            Le numéro EN TEXTE NU : l'extension Allo décore les numéros qu'elle voit, et elle ne voit
            que du texte. L'emballer dans un bouton lui retirerait ce qu'elle sait faire. */}
        <p className="font-mono text-km-name font-semibold text-km-text">{numeroLisible(appel.numero)}</p>
        {fichePossible ? (
          <button
            type="button"
            onClick={versLaFiche}
            className="mt-0.5 text-km-label font-semibold text-km-green hover:underline"
          >
            Ouvrir la fiche →
          </button>
        ) : (
          <p className="mt-0.5 text-km-label text-km-faint">
            Numéro inconnu — il rejoindra la file des appels non rattachés.
          </p>
        )}

        {/* ── CE QU'ALLO A DÉTECTÉ, quand ça contredit son propre résultat ── */}
        {serveurVocal && (
          <p className="mt-2 flex items-start gap-1.5 rounded-km border border-km-amber-line bg-km-amber-soft px-2 py-1.5 text-km-label leading-snug text-km-text">
            <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-km-amber" />
            <span>
              Menu vocal traversé. Allo compte cet appel comme décroché — c’est pour ça qu’on te
              demande.
            </span>
          </p>
        )}

        {/* ── L'ENREGISTREMENT, dès qu'il existe ── */}
        {appel.enregistrement_url && (
          <a
            href={appel.enregistrement_url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-km-label font-semibold text-km-green hover:underline"
          >
            <Play className="h-3 w-3" />
            Écouter l’appel
          </a>
        )}

        {/* ── LE SEUL GESTE DEMANDÉ ── */}
        <p className="mt-3 text-km-xs font-bold uppercase tracking-[0.06em] text-km-faint">
          Qui as-tu eu ?
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {CHOIX.map(({ valeur, libelle, Icone }) => (
            <button
              key={valeur}
              type="button"
              disabled={qualifier.isPending}
              onClick={() => qualifier.mutate({ id: appel.id, qualification: valeur })}
              className="flex items-center gap-1.5 rounded-km border border-km-line bg-white px-2 py-2 text-left text-km-label font-semibold text-km-text transition-colors hover:border-km-green hover:bg-km-green-soft disabled:opacity-50"
            >
              <Icone className="h-3.5 w-3.5 shrink-0 text-km-faint" />
              <span className="truncate">{libelle}</span>
            </button>
          ))}
        </div>

        {/* CE QUE LE CLIC DÉCLENCHE, dit une fois. « Quelqu'un » est la seule réponse qui fasse
            remonter le résumé d'Allo — règle de William, appliquée en base par
            `fn_resume_a_afficher` et non dans chaque écran. */}
        <p className="mt-2 text-km-label leading-snug text-km-faint">
          Le résumé et la transcription ne sont conservés que si tu as eu quelqu’un.
        </p>

        {qualifier.isError && (
          <p className="mt-2 text-km-label text-km-red">
            {qualifier.error instanceof Error ? qualifier.error.message : 'Enregistrement impossible.'}
          </p>
        )}
      </div>
    </div>
  )
}
