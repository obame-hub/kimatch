import { useState } from 'react'
import { Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGmailConnection, connectGmail } from '@/lib/data/gmail'
import { useMonProfil } from '@/lib/data/roles'

/**
 * ══ LA RECONNEXION GMAIL SE DEMANDE SUR LA PAGE QU'ON OUVRE LE MATIN ══
 *
 * Naoëlle, 15/09/2026 : « mets-le dans l'accueil de tout le monde afin que ce soit visible et
 * qu'ils le fassent ».
 *
 * Depuis le 14/09, Kimatch va chercher dans Gmail les réponses des clients. Ce droit de LECTURE
 * n'existait pas dans les connexions antérieures — elles ne portaient que l'envoi — et un jeton ne
 * gagne pas un droit après coup : il faut refaire la connexion une fois.
 *
 * ── POURQUOI PAS SEULEMENT DANS « MON PROFIL » ──
 *
 * Le rappel y était déjà, et personne ne l'a vu : on n'ouvre pas son profil un jour ordinaire. Un
 * rappel rangé derrière un écran qu'on ne visite pas ne rappelle rien. Celui-ci est sur le tableau
 * de bord, la première page de la journée.
 *
 * ── IL NE SE FERME PAS ──
 *
 * Volontairement. Tant que la connexion n'accorde pas la lecture, les réponses des clients
 * n'arrivent pas dans Kimatch, et personne ne s'en aperçoit : la fiche a simplement l'air calme.
 * Une croix pour le faire taire ne ferait disparaître que le message, pas le problème.
 */

/* MICHEL EST DISPENSÉ, à la demande de Naoëlle (15/09/2026). C'est la seule exception, écrite ici
   plutôt que déduite d'un rôle : rien dans les rôles de Kimatch ne dit « n'écrit pas aux clients »,
   et inventer une règle générale pour un cas unique la rendrait fausse au premier nouvel arrivant. */
const DISPENSES = ['obame@kiwee-energie.fr']

export function BandeauGmail() {
  const { data: profil } = useMonProfil()
  const { data: connexion, isLoading } = useGmailConnection()
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  /* ON NE MONTRE RIEN PENDANT LE CHARGEMENT. Un bandeau d'alerte qui apparaît puis disparaît une
     demi-seconde plus tard se lit comme un défaut d'affichage, et on apprend à l'ignorer. */
  if (isLoading || !profil) return null
  if (DISPENSES.includes((profil.email ?? '').toLowerCase())) return null

  /* `true` est la SEULE valeur qui dispense. `null` veut dire « jamais vérifié » — la tâche horaire
     ne passe que sur les comptes qui ont des mails à relire — et prendre l'absence de preuve pour
     une preuve laisserait justement sans rappel ceux qui n'ont jamais rien rapatrié. */
  if (connexion?.lecture_autorisee === true) return null

  const jamaisConnecte = !connexion

  async function lancerLaConnexion() {
    setEnCours(true)
    setErreur(null)
    try {
      await connectGmail()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Connexion impossible')
      setEnCours(false)
    }
  }

  return (
    <div className="mb-4 rounded-km-md border border-km-amber-line bg-km-amber-soft p-4">
      <div className="flex flex-wrap items-start gap-3">
        <Mail className="mt-0.5 h-5 w-5 shrink-0 text-km-text" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-km-text">
            {jamaisConnecte
              ? 'Connectez votre compte Gmail pour écrire à vos clients depuis Kimatch'
              : 'Action requise : reconnectez votre compte Gmail'}
          </p>
          <p className="mt-1 text-km-body text-km-muted">
            {jamaisConnecte
              ? 'Vos mails partiront de votre propre adresse, et les réponses de vos clients reviendront dans leur fiche.'
              : 'Votre connexion date d’avant le suivi des réponses : elle autorise l’envoi, pas la lecture. Tant qu’elle n’est pas refaite, les réponses de vos clients n’apparaissent pas dans leur fiche. Une seule fois suffit — Google vous redemandera votre accord.'}
          </p>
          {erreur && <p className="mt-1 text-km-body text-km-red">{erreur}</p>}
        </div>
        <Button size="sm" onClick={lancerLaConnexion} disabled={enCours}>
          {enCours ? 'Ouverture…' : jamaisConnecte ? 'Connecter mon compte Gmail' : 'Reconnecter mon compte Gmail'}
        </Button>
      </div>
    </div>
  )
}
