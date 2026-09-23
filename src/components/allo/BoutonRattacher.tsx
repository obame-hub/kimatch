/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * RATTACHER LE DERNIER APPEL — DISPONIBLE PARTOUT, EN BAS À DROITE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 23/09/2026 : « mets-le en bas à droite, et installe-le aussi dans Cockpit — il faut que
 * ce soit dispo dans toute l'app. »
 *
 * ══ POURQUOI UN SEUL BOUTON PLUTÔT QU'UN PAR ÉCRAN ══
 *
 * Il vit dans `TelephonieProvider`, monté une fois dans `AppLayout`. Toutes les pages en héritent —
 * y compris le Cockpit, qui est un `fixed inset-0` PAR-DESSUS l'application et non à côté. Un
 * composant par écran aurait divergé au premier changement, et il aurait fallu penser à l'ajouter
 * sur chaque nouvelle page.
 *
 * `z-[75]` LE PLACE AU-DESSUS DU COCKPIT (`z-50`) mais SOUS ses propres fenêtres modales (`z-[60]`
 * pour son choix de numéro, `z-[80]` pour la fenêtre de rattachement elle-même). Il ne recouvre
 * donc jamais une question posée.
 *
 * ══ IL NE PARAÎT QUE QUAND IL SERT ══
 *
 * Trois conditions, et chacune évite un bouton qui ment :
 *
 *   · un appel TERMINÉ existe dans les deux dernières heures ;
 *   · il n'est rattaché à rien ;
 *   · aucun appel n'est en cours — pendant qu'on parle, on ne rattache pas.
 *
 * DEUX HEURES, et pas davantage : au-delà on ne se souvient plus de quoi on a parlé. C'est la même
 * borne que la carte d'appel, pour la même raison. Le rattrapage plus ancien se fait dans la liste
 * de la vue d'ensemble, qui remonte à trente jours.
 *
 * ON NE L'AFFICHE PAS PENDANT UN APPEL : la question « à quoi se rapportait-il » n'a pas de sens
 * tant qu'il dure, et le bouton volerait la place au moment où l'on prend des notes.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useMonProfil } from '@/lib/data/roles'
import { useAppelEnCours } from '@/lib/data/appelEnCours'
import { LierAppel } from '@/components/allo/LierAppel'
import { relancer } from '@/lib/data/erreurLecture'

interface DernierAppel {
  id: string
  contact_id: string | null
  compte_id: string | null
  nom: string | null
}

/**
 * Le dernier appel terminé qui n'est rattaché à rien.
 *
 * ON LIT `interactions` ET NON `appels_en_cours` : ce sont les interactions qui portent les quatre
 * liens, et c'est là que le rattachement s'écrit. La table des appels ne sert qu'à suivre l'appel
 * pendant qu'il se passe.
 */
async function fetchDernierNonLie(profilId: string | null): Promise<DernierAppel | null> {
  if (!profilId) return null
  try {
    const { data, error } = await supabase
      .from('interactions')
      .select(`
        id, contact_id, compte_id,
        type:types_interactions!inner(code),
        contact:contacts(prenom, nom),
        compte:comptes(nom)
      `)
      .eq('type.code', 'APPEL')
      .eq('auteur_profil_id', profilId)
      .is('opportunite_id', null)
      .is('recommandation_id', null)
      .is('requete_id', null)
      .is('piste_id', null)
      .gte('date_interaction', new Date(Date.now() - 2 * 3600 * 1000).toISOString())
      /* ON BORNE AUSSI PAR LE HAUT. Une interaction datee de 2028 existe en base — reprise
         Salesforce, ou saisie fautive : sans ce garde, elle serait toujours « le dernier appel »
         et le bouton proposerait eternellement de rattacher le mauvais. Constate le 23/09/2026. */
      .lte('date_interaction', new Date().toISOString())
      .order('date_interaction', { ascending: false })
      .limit(1)
    if (error) throw error

    const i = (data ?? [])[0] as unknown as {
      id: string; contact_id: string | null; compte_id: string | null
      contact: { prenom: string | null; nom: string | null } | null
      compte: { nom: string | null } | null
    } | undefined
    if (!i) return null

    return {
      id: i.id,
      contact_id: i.contact_id,
      compte_id: i.compte_id,
      nom: i.contact
        ? `${i.contact.prenom ?? ''} ${i.contact.nom ?? ''}`.trim() || i.compte?.nom || null
        : i.compte?.nom ?? null,
    }
  } catch (error) {
    relancer('fetchDernierNonLie', error)
  }
}

export function BoutonRattacher() {
  const { data: profil } = useMonProfil()
  const { data: appelEnCours } = useAppelEnCours()
  const [ouvert, setOuvert] = useState(false)

  /* ON SONDE TOUTES LES QUINZE SECONDES. Le webhook d'Allo écrit l'interaction à la fin de l'appel,
     avec un délai qui va de deux secondes à plusieurs minutes (mesuré le 22/09) : un sondage plus
     lent ferait paraître le bouton longtemps après qu'on a raccroché, quand on est déjà ailleurs. */
  const { data: dernier } = useQuery({
    queryKey: ['dernier-appel-non-lie', profil?.id],
    enabled: Boolean(profil?.id),
    refetchInterval: 15000,
    staleTime: 10000,
    queryFn: () => fetchDernierNonLie(profil?.id ?? null),
  })

  /* PENDANT UN APPEL, RIEN : voir l'en-tête. `termine_le` nul signifie qu'on est encore en ligne. */
  const enLigne = Boolean(appelEnCours && !appelEnCours.termine_le)
  if (!dernier || enLigne) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        title={dernier.nom ? `Rattacher l’appel avec ${dernier.nom}` : 'Rattacher le dernier appel'}
        className="fixed bottom-[4.5rem] right-4 z-[75] flex items-center gap-2 rounded-km border border-km-amber-line bg-km-amber-soft px-3 py-2 text-km-xs font-semibold text-km-amber shadow-km-pop transition-opacity hover:opacity-90 md:bottom-4"
      >
        <Link2 className="h-3.5 w-3.5 shrink-0" />
        {/* LE NOM PLUTÔT QUE « UN APPEL » : on se souvient de la personne, pas de l'événement. Sur
            mobile la place manque, et le libellé court suffit puisqu'on vient de raccrocher. */}
        <span className="hidden sm:inline">
          Rattacher l’appel{dernier.nom ? ` avec ${dernier.nom}` : ''}
        </span>
        <span className="sm:hidden">Rattacher</span>
      </button>

      {ouvert && (
        <LierAppel
          interactionId={dernier.id}
          compteId={dernier.compte_id}
          contactId={dernier.contact_id}
          nomCorrespondant={dernier.nom}
          onFerme={() => setOuvert(false)}
        />
      )}
    </>
  )
}
