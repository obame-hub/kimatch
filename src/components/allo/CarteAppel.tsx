/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA CARTE D'APPEL — L'APPEL EN COURS, SANS DÉPLIER LE VOLET
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, réunion du 08/09/2026 : « quand tu cliquais, ça ouvrait l'application en arrière-plan et
 * ça lançait l'appel. Mais tu n'avais aucun moyen de raccrocher en dehors de l'application Allo. Il
 * faut qu'on trouve une solution pour pouvoir raccrocher depuis Kimatch, c'est important. »
 *
 * ON RACCROCHE DEPUIS KIMATCH — mais pas avec un bouton à nous. Naoëlle, 08/09/2026 : « on peut
 * raccrocher et couper le micro depuis le volet ». C'est le volet Allo (`VoletAllo`) qui le permet :
 * il embarque le softphone d'Allo dans Kimatch, avec ses propres commandes — raccrocher, couper le
 * micro, transférer. Le commercial ne quitte jamais Kimatch.
 *
 * CE QUI RESTE IMPOSSIBLE, c'est que le CODE de Kimatch raccroche de lui-même : l'API d'Allo n'expose
 * aucun contrôle d'appel — vérifié sur leur table complète portée-par-endpoint, une soixantaine
 * d'endpoints et pas un qui décroche ou raccroche. Cockpit ne le faisait pas non plus. La nuance
 * compte : ce n'est pas le geste qui manque, c'est la commande automatisable.
 *
 * CETTE CARTE NE REMPLACE DONC PAS LE RACCROCHAGE, elle raconte l'appel : elle s'ouvre quand l'appel
 * part, dit quand le correspondant décroche, et affiche le résultat quand c'est fini — sans qu'on
 * ait à déplier le volet pour savoir où on en est.
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
  useIdentiteAppel,
  ID_APPEL_PRESUME,
  secondesDepuisDecroche,
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
  const { data: identite } = useIdentiteAppel(appel)

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
  /* LA DURÉE D'ALLO FAIT FOI QUAND ELLE EXISTE — elle arrive à la fin de l'appel. Avant, notre
     chronomètre, qui ne part qu'au décroché. Pendant la sonnerie : rien, et l'état le dit. */
  const secondes = appel.duree_secondes ?? secondesDepuisDecroche(appel, maintenant)
  const entrant = appel.sens === 'ENTRANT'

  const versLaFiche = () => {
    if (appel.contact_id) navigate(`/contacts/${appel.contact_id}`)
    else if (appel.piste_id) navigate(`/pistes/${appel.piste_id}`)
    else if (appel.compte_id) navigate(`/comptes/${appel.compte_id}`)
  }
  const fichePossible = Boolean(appel.contact_id || appel.piste_id || appel.compte_id)

  return (
    /* ══ EN BAS À DROITE, MAIS JAMAIS SUR ALLO ══
     *
     * `right` suivait `--volet-allo`, la largeur que le volet annonçait quand il était ouvert, pour
     * ne pas recouvrir son bouton raccrocher. LE VOLET EST RETIRÉ DEPUIS LE 22/09/2026 (voir
     * `telephonie.tsx`) : plus personne ne pose cette variable, et le repli `0px` s'applique. On la
     * garde parce qu'elle ne coûte rien et que le volet peut revenir — le fichier est toujours là.
     *
     * Elle est redescendue à `bottom-4` : la pastille du téléphone est passée à gauche le 08/09/2026,
     * elle ne dispute plus ce coin. Sur mobile elle reste au-dessus de la barre du bas. */
    <div
      className="fixed bottom-[4.5rem] z-[70] w-[320px] overflow-hidden rounded-km border border-km-line bg-white shadow-km-pop md:bottom-4"
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
        {/* PAS DE COMPTEUR TANT QUE ÇA SONNE. Un nombre qui défile pendant la sonnerie se lit comme
            une durée de conversation, puis repart de zéro au décroché — on ne le croit plus. */}
        <span className="shrink-0 font-mono text-km-label tabular-nums">
          {secondes == null ? '—' : dureeLisible(secondes)}
        </span>
        {/* PAS DE BOUTON « RACCROCHER » ICI. On l'a écrit, puis retiré le jour même : Allo reçoit
            `END_CALL` par `postMessage` mais n'y a branché aucun traitement — « endCall » n'apparaît
            chez eux qu'une fois comme émetteur, et six fois dans leurs traductions. Un bouton qui
            ne raccroche pas est pire que pas de bouton. On raccroche dans le composeur d'Allo, qui
            est juste à côté. */}
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
        {/* LE NOM D'ABORD QUAND ON L'A, le numéro sinon — demande de William, 15/09/2026. Le numéro
            reste affiché en dessous : c'est lui qu'on dicte à un collègue, et lui que l'extension
            Allo décore. En TEXTE NU pour cette raison : l'emballer dans un bouton la rendrait
            aveugle. */}
        {identite?.nom ? (
          <>
            <p className="text-km-name font-semibold text-km-text">{identite.nom}</p>
            {identite.societe && (
              <p className="truncate text-km-label text-km-muted">{identite.societe}</p>
            )}
            <p className="mt-0.5 font-mono text-km-label text-km-faint">{numeroLisible(appel.numero)}</p>
          </>
        ) : identite?.societe ? (
          <>
            <p className="text-km-name font-semibold text-km-text">{identite.societe}</p>
            <p className="mt-0.5 font-mono text-km-label text-km-faint">{numeroLisible(appel.numero)}</p>
          </>
        ) : (
          <p className="font-mono text-km-name font-semibold text-km-text">{numeroLisible(appel.numero)}</p>
        )}
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

        {/* ══ ON NE DEMANDE PAS « QUI AS-TU EU ? » PENDANT QUE ÇA SONNE ══
            Capture de Naoëlle, 15/09/2026 : la carte posait la question alors que l'appel sonnait
            encore. Personne ne peut y répondre à ce moment-là, et une question posée trop tôt
            s'apprend à ignorer — puis on l'ignore aussi quand elle devient pertinente.

            ══ MAIS ON NE L'ATTEND PLUS NON PLUS — 22/09/2026 ══

            Naoëlle : « je l'ai pas vu tout de suite après avoir raccroché, ça vient quelque temps
            après, et c'est très problématique parce que si on doit appeler à la chaîne en
            prospection, il faut que ça apparaisse tout de suite. C'est le problème qu'a rencontré
            Thomas hier. »

            LA CONDITION ÉTAIT `etat === 'termine'`, c'est-à-dire `termine_le` renseigné — donc
            l'arrivée de `call.completed` chez Allo. Kimatch ne PEUT PAS savoir que le commercial a
            raccroché avant qu'Allo le lui dise : mesuré sur 390 appels de la semaine, la médiane
            est de 3 min 33 de conversation, pendant lesquelles la carte n'offrait rien du tout.

            Le commercial qui raccroche et enchaîne n'avait donc aucune fenêtre pour répondre, et
            quand les boutons paraissaient enfin il était déjà sur l'appel suivant — il ne savait
            plus de qui on parlait. C'est exactement ce que raconte Thomas, et c'est la cause des
            262 appels non qualifiés en trente jours.

            ON OFFRE DONC LA QUALIFICATION DÈS LE DÉCROCHÉ. Elle est juste, à ce moment : dès qu'on
            entend une voix on sait si c'est quelqu'un, un répondeur ou un serveur vocal. Et
            qualifier n'interrompt pas l'appel — c'est une note, pas un raccrochage.

            PENDANT LA SONNERIE, TOUJOURS RIEN : on ne sait pas encore, et une question sans réponse
            possible est une question qu'on apprend à ignorer. */}
        {/* L'APPEL PRÉSUMÉ N'OFFRE PAS ENCORE LES BOUTONS : il n'existe qu'en mémoire, une
            qualification ne s'écrirait nulle part. Il dure quelques secondes, le temps qu'Allo
            confirme — et la ligne ci-dessous dit pourquoi, plutôt que de laisser un vide. */}
        {appel.id === ID_APPEL_PRESUME && (
          <p className="mt-3 text-km-label leading-snug text-km-faint">
            Dès qu’Allo confirme l’appel, tu pourras dire qui tu as eu.
          </p>
        )}

        {appel.id !== ID_APPEL_PRESUME && (etat === 'termine' || etat === 'en_ligne') && (
          <>
        {/* LE LIBELLÉ SUIT LE MOMENT. « Qui as-tu eu ? » au passé, posé pendant qu'on est encore en
            ligne, se lit comme une erreur d'affichage — et fait douter que le clic soit pris en
            compte. Au présent, la question est celle qu'on se pose vraiment en entendant décrocher. */}
        <p className="mt-3 text-km-xs font-bold uppercase tracking-[0.06em] text-km-faint">
          {etat === 'en_ligne' ? 'Qui as-tu au bout du fil ?' : 'Qui as-tu eu ?'}
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {CHOIX.map(({ valeur, libelle, Icone }) => {
            /* LE CHOIX RETENU SE VOIT, et c'est nouveau depuis que l'on peut répondre en cours
               d'appel : la carte ne disparaît plus au clic, donc rien ne disait que la réponse
               était prise. Sans ce retour, on reclique — ou on doute, ce qui est pire. */
            const retenu = appel.qualification === valeur
            return (
              <button
                key={valeur}
                type="button"
                disabled={qualifier.isPending}
                aria-pressed={retenu}
                onClick={() => qualifier.mutate({ id: appel.id, qualification: valeur })}
                className={cn(
                  'flex items-center gap-1.5 rounded-km border px-2 py-2 text-left text-km-label font-semibold transition-colors disabled:opacity-50',
                  retenu
                    ? 'border-km-green bg-km-green-soft text-km-green'
                    : 'border-km-line bg-white text-km-text hover:border-km-green hover:bg-km-green-soft',
                )}
              >
                <Icone className={cn('h-3.5 w-3.5 shrink-0', retenu ? 'text-km-green' : 'text-km-faint')} />
                <span className="truncate">{libelle}</span>
              </button>
            )
          })}
        </div>

        {/* CE QUE LE CLIC DÉCLENCHE, dit une fois. « Quelqu'un » est la seule réponse qui fasse
            remonter le résumé d'Allo — règle de William, appliquée en base par
            `fn_resume_a_afficher` et non dans chaque écran. */}
        <p className="mt-2 text-km-label leading-snug text-km-faint">
          Le résumé et la transcription ne sont conservés que si tu as eu quelqu’un.
        </p>
          </>
        )}

        {qualifier.isError && (
          <p className="mt-2 text-km-label text-km-red">
            {qualifier.error instanceof Error ? qualifier.error.message : 'Enregistrement impossible.'}
          </p>
        )}
      </div>
    </div>
  )
}
