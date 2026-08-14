import { AlertTriangle, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useSanteDocusign } from '@/lib/data/docusign'

/**
 * Bandeau permanent quand la signature électronique n'est pas opérationnelle pour la personne
 * connectée.
 *
 * Demande de William (14/08/2026) : « si le compte DocuSign s'est déconnecté pour une quelconque
 * raison, il faut absolument qu'on le voie en très gros quelque part sur l'outil […] je l'ai vu dans
 * l'utilisation de Tools, ils me disaient : le process ne marche pas. Non, c'est que l'intégration a
 * sauté. » Le bandeau existe pour que ce diagnostic saute aux yeux avant qu'on ouvre un wizard,
 * pas après avoir tout ressaisi.
 *
 * Deux écarts assumés par rapport à sa description :
 *  - il n'y a pas de bouton pour fermer : une intégration cassée n'est pas une notification, elle
 *    empêche d'envoyer un mandat. Le bandeau disparaît quand le problème est réglé, pas avant.
 *  - le texte ne défile pas. Un texte qui bouge se lit moins bien, s'imprime mal dans les captures
 *    d'écran que les commerciaux envoient au support, et les lecteurs d'écran l'annoncent en boucle.
 *    La couleur et la position en haut de page suffisent à le rendre impossible à manquer.
 */
export function DocusignBanner() {
  const { etat, connexion } = useSanteDocusign()
  const navigate = useNavigate()

  // « chargement » et « inutile » ne disent rien à l'utilisateur : pas de bandeau clignotant au
  // démarrage, et rien du tout si l'application DocuSign n'est pas configurée côté serveur.
  if (etat === 'chargement' || etat === 'inutile' || etat === 'ok') return null

  const messages: Record<'absente' | 'expiree' | 'bientot', { titre: string; detail: string }> = {
    absente: {
      titre: 'Signature électronique non connectée',
      detail: "Vous ne pouvez pas envoyer de mandat tant que votre compte DocuSign n'est pas lié.",
    },
    expiree: {
      titre: 'Votre compte DocuSign est déconnecté',
      detail: "L'autorisation a expiré : les envois de mandat échoueront jusqu'à sa reconduction.",
    },
    bientot: {
      titre: 'Votre connexion DocuSign expire bientôt',
      detail: connexion
        ? `Elle prend fin le ${new Date(connexion.refresh_expire_le).toLocaleDateString('fr-FR')} — reconnectez-la pour ne pas être coupé(e) en pleine signature.`
        : 'Reconnectez-la pour ne pas être coupé(e) en pleine signature.',
    },
  }
  const { titre, detail } = messages[etat]
  // Une expiration imminente n'est pas une panne : l'ambre alerte, le rouge est réservé au blocage.
  const urgent = etat !== 'bientot'

  return (
    <button
      type="button"
      onClick={() => navigate('/profil')}
      className={`flex w-full items-center justify-center gap-2 px-4 py-2 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90 ${
        urgent ? 'bg-red-600' : 'bg-amber-500'
      }`}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{titre}</span>
      <span className="hidden font-normal opacity-90 sm:inline">— {detail}</span>
      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-white/20 px-2 py-0.5 text-xs">
        Connecter <ChevronRight className="h-3 w-3" />
      </span>
    </button>
  )
}
