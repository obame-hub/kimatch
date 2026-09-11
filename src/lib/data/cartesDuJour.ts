import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * ══ LES SEPT NOMBRES DE LA PREMIÈRE LIGNE DU TABLEAU DE BORD ══
 *
 * William, 10/09/2026 : cinq cartes en tête de page. Trois comptent MES tâches ouvertes par type
 * — Appel, Mail, Livrable — une quatrième mes pistes à prospecter, la dernière mes opportunités
 * qui attendent quelque chose. Toutes ne comptent que ce qui est DÛ AUJOURD'HUI ou en retard.
 *
 * ── « OUVERTE » SE DÉFINIT PAR CE QUI N'EST PAS FERMÉ ──
 *
 * `statuts_actions` porte cinq codes : À faire, En cours, En attente, Terminée, Annulée. On exclut
 * les deux derniers plutôt que d'énumérer les trois premiers. UN STATUT AJOUTÉ DEMAIN — « Reportée »,
 * « Déléguée » — compterait alors comme ouvert, ce qui est le bon défaut : une tâche qui n'est ni
 * terminée ni annulée attend toujours quelqu'un. La liste inverse l'aurait fait disparaître du
 * compteur en silence.
 *
 * ── LES TROIS TYPES SONT DÉSIGNÉS PAR LEUR CODE, PAS PAR LEUR LIBELLÉ ──
 *
 * « Appel » est le libellé du code `APPELER`, « Mail » celui de `ENVOYER_EMAIL`. Les libellés se
 * renomment depuis l'administration ; les codes, non. Compter sur le libellé donnerait un compteur
 * qui tombe à zéro le jour où quelqu'un écrit « Appel téléphonique ».
 *
 * ── « AUJOURD'HUI » VEUT DIRE L'ÉCHÉANCE DU JOUR, PAS L'ÉTAT DU JOUR ──
 *
 * William, 10/09/2026 : « uniquement mes tâches qui ont une échéance soit en retard, soit égale à
 * aujourd'hui. Cette page représente ce qu'un commercial doit faire dans la journée […] il est donc
 * inutile de lui montrer les actions de demain. »
 *
 * J'avais d'abord retenu l'autre lecture — tout ce qui est ouvert, quelle que soit l'échéance.
 * C'était le mauvais choix : la question de cette page n'est pas « combien de travail m'attend »
 * mais « que dois-je faire maintenant ». Une carte annonçant 85 appels quand 12 sont réellement à
 * passer aujourd'hui ne hiérarchise plus rien.
 *
 * LA FRONTIÈRE EST MINUIT À PARIS, ET C'EST TOUT SAUF UN DÉTAIL : la base tourne en UTC, où minuit
 * tombe deux heures trop tôt. Le calcul est dans la fonction, pas ici.
 *
 * UNE TÂCHE SANS ÉCHÉANCE NE COMPTE PAS : elle n'est ni en retard ni due aujourd'hui. La faire
 * apparaître inventerait une urgence que personne n'a fixée.
 *
 * ── CHACUN NE VOIT QUE SON PROPRE TRAVAIL ──
 *
 * William, 10/09/2026 : « seuls les enregistrements propres à l'utilisateur qui ouvre la page
 * doivent s'afficher ». Le filtre est posé DANS la fonction, pas ici : elle lit `auth.uid()`.
 *
 * C'est délibéré. Un filtre passé en paramètre depuis le navigateur se change dans la console ;
 * lu côté base, il ne se contourne pas. Et le crochet n'a plus besoin d'attendre que le profil
 * soit chargé pour lancer sa requête — un aller-retour de moins au chargement de la page.
 *
 * ── POURQUOI UN SEUL APPEL, ET PAS SIX ──
 *
 * Sept `count` séparés, c'est sept allers-retours au chargement et sept de plus à chaque tâche
 * cochée.
 * La fonction `compter_cartes_du_jour` rend les sept nombres d'un coup, calculés là où sont les
 * données. Le temps réel les rafraîchit souvent : le coût d'un rafraîchissement compte.
 */

export interface CartesDuJour {
  appels: number
  mails: number
  livrables: number
  pistesAProspecter: number
  perimetreADetecter: number
  mandatARecuperer: number
  recommandationACreer: number
}

const VIDE: CartesDuJour = {
  appels: 0,
  mails: 0,
  livrables: 0,
  pistesAProspecter: 0,
  perimetreADetecter: 0,
  mandatARecuperer: 0,
  recommandationACreer: 0,
}

export function useCartesDuJour() {
  const queryClient = useQueryClient()

  const requete = useQuery({
    queryKey: ['cartes-du-jour'],
    // Les nombres arrivent par le temps réel : inutile de les redemander au retour d'onglet.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async (): Promise<CartesDuJour> => {
      const { data, error } = await supabase.rpc('compter_cartes_du_jour')
      if (error) {
        /* LA PAGE NE DOIT PAS BLANCHIR POUR UNE LIGNE DE COMPTEURS. Le déploiement part au push,
           la migration s'applique à la main : entre les deux, la fonction n'existe pas et PostgREST
           répond 404. On rend des zéros, la ligne s'affiche éteinte, et elle revient d'elle-même. */
        if (/does not exist|schema cache|404/i.test(error.message)) return VIDE
        throw new Error(error.message)
      }
      const l = (Array.isArray(data) ? data[0] : data) as Record<string, number> | null
      if (!l) return VIDE
      return {
        appels: Number(l.appels ?? 0),
        mails: Number(l.mails ?? 0),
        livrables: Number(l.livrables ?? 0),
        pistesAProspecter: Number(l.pistes_a_prospecter ?? 0),
        perimetreADetecter: Number(l.perimetre_a_detecter ?? 0),
        mandatARecuperer: Number(l.mandat_a_recuperer ?? 0),
        recommandationACreer: Number(l.recommandation_a_creer ?? 0),
      }
    },
  })

  /**
   * ══ LE TEMPS RÉEL ══
   *
   * « Sans besoin de rafraîchir la page. » Trois tables sont écoutées, parce que trois événements
   * distincts font bouger ces nombres : la tâche qu'on termine, l'opportunité qui change de statut
   * et sort du périmètre, et la piste qui change de propriétaire ou part aux archives.
   *
   * ON NE LIT PAS LA CHARGE UTILE DE L'ÉVÉNEMENT, ON RECOMPTE. Elle ne porte que les colonnes
   * brutes de la ligne touchée — pas le type de la tâche ni le statut de l'opportunité, qui vivent
   * dans des tables de référence. Décrémenter à la main depuis ce qu'on reçoit demanderait de
   * refaire les jointures côté navigateur, et de deviner l'état d'AVANT sur un UPDATE. Un recompte
   * est un aller-retour ; il est juste par construction.
   *
   * UN SEUL CANAL POUR LES TROIS TABLES : ouvrir trois websockets pour rafraîchir la même donnée
   * triplerait les connexions sans rien changer à l'affichage.
   */
  useEffect(() => {
    const rafraichir = () => { void queryClient.invalidateQueries({ queryKey: ['cartes-du-jour'] }) }

    const canal = supabase
      .channel('cartes-du-jour')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'actions' }, rafraichir)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'opportunites' }, rafraichir)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pistes' }, rafraichir)
      .subscribe()

    return () => { void supabase.removeChannel(canal) }
  }, [queryClient])

  return requete
}
