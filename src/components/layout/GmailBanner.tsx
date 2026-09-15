import { useState } from 'react'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { useGmailConnection, connectGmail } from '@/lib/data/gmail'
import { useMonProfil } from '@/lib/data/roles'

/**
 * ══ BANDEAU PERMANENT TANT QUE GMAIL N'EST PAS RELIÉ ══
 *
 * Naoëlle, 15/09/2026 : « tout le monde ne va pas sur la vue d'ensemble, il faut que ce soit un
 * bandeau fixe dans l'app comme ce que tu avais fait avec DocuSign ».
 *
 * ELLE A RAISON, ET LA PREMIÈRE VERSION ÉTAIT FAUSSE POUR LA MÊME RAISON QUE CELLE D'AVANT. Le
 * rappel était d'abord dans Mon Profil — un écran qu'on n'ouvre pas ; je l'ai déplacé sur le
 * tableau de bord — une page que tout le monde n'ouvre pas non plus. Un rappel ne vaut que s'il
 * est là où la personne se trouve DÉJÀ, c'est-à-dire partout. C'est exactement ce que fait
 * `DocusignBanner` depuis le 14/08, et il n'y avait aucune raison de faire autrement.
 *
 * ── CE QU'IL DIT, ET POURQUOI IL EST ROUGE ──
 *
 * Même règle que DocuSign : le rouge est réservé à ce qui EMPÊCHE. Sans connexion Gmail on ne peut
 * pas écrire à un client depuis Kimatch — c'est un blocage, pas un avertissement. L'ambre reste
 * pour la connexion qui fonctionne encore à l'envoi mais ne rapporte pas les réponses.
 *
 * ── IL DISPARAÎT TOUT SEUL ──
 *
 * « Tu enlèveras ce bandeau quand la personne se sera connectée. » Il n'y a rien à enlever à la
 * main : la condition EST l'état de la connexion. Au retour de Google, la requête `gmail-connection`
 * est invalidée et le bandeau s'en va — pour cette personne seulement.
 */

/* MICHEL EST DISPENSÉ, à sa demande relayée par Naoëlle (15/09/2026). Écrit en clair plutôt que
   déduit d'un rôle : rien dans les rôles de Kimatch ne dit « n'écrit pas aux clients », et inventer
   une règle générale pour un cas unique la rendrait fausse au premier nouvel arrivant. */
const DISPENSES = ['obame@kiwee-energie.fr']

export function GmailBanner() {
  const { data: profil } = useMonProfil()
  const { data: connexion, isLoading } = useGmailConnection()
  const [enCours, setEnCours] = useState(false)

  /* PAS DE BANDEAU CLIGNOTANT AU DÉMARRAGE. Un bandeau rouge qui apparaît puis disparaît une
     demi-seconde plus tard se lit comme un défaut d'affichage, et on apprend à l'ignorer. */
  if (isLoading || !profil) return null
  if (DISPENSES.includes((profil.email ?? '').toLowerCase())) return null

  /* `true` EST LA SEULE VALEUR QUI DISPENSE. `null` veut dire « jamais vérifié » — la tâche horaire
     ne passe que sur les comptes qui ont des mails à relire — et prendre l'absence de preuve pour
     une preuve laissait justement sans rappel ceux qui n'avaient jamais rien rapatrié. */
  if (connexion?.lecture_autorisee === true) return null

  const absente = !connexion
  const titre = absente
    ? 'Votre compte Gmail n’est pas connecté'
    : 'Votre connexion Gmail ne rapporte pas les réponses'
  const detail = absente
    ? 'Vous ne pouvez pas écrire à un client depuis Kimatch tant que votre compte n’est pas lié.'
    : 'Elle date d’avant le suivi des réponses : elle autorise l’envoi, pas la lecture. Une reconnexion suffit.'

  async function lancerLaConnexion() {
    setEnCours(true)
    try {
      await connectGmail()
    } catch {
      /* L'échec le plus courant est une session expirée. Le bandeau reste, la personne réessaie ;
         un message d'erreur en pleine barre rouge n'apporterait rien de plus. */
      setEnCours(false)
    }
  }

  return (
    <button
      type="button"
      onClick={lancerLaConnexion}
      disabled={enCours}
      className={`flex w-full items-center justify-center gap-2 px-4 py-2 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90 ${
        absente ? 'bg-red-600' : 'bg-amber-500'
      }`}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{titre}</span>
      <span className="hidden font-normal opacity-90 sm:inline">— {detail}</span>
      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-white/20 px-2 py-0.5 text-xs">
        {enCours ? 'Ouverture…' : 'Connecter'} <ChevronRight className="h-3 w-3" />
      </span>
    </button>
  )
}
