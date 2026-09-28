import { normaliser } from '@/lib/recherche'

/**
 * ══ UNE LISTE D'ADRESSES TAPÉE À LA MAIN ══
 *
 * Les champs À, Cc et Cci des éditeurs de mails sont du texte libre : « a@x.fr, b@y.fr ». Ce module
 * sait y retrouver l'adresse en cours de frappe, proposer un membre de l'équipe qui lui correspond,
 * l'insérer à sa place, et remettre la liste au propre avant l'envoi.
 *
 * Pur, pour être testé seul : c'est la partie qui peut abîmer une liste sans que personne le voie.
 */

const SEPARATEUR = /[,;]/

/** Le morceau de la liste sous le curseur : de la virgule d'avant à la virgule d'après. */
export function jetonAuCurseur(valeur: string, curseur: number) {
  const avant = valeur.slice(0, curseur)
  const debut = Math.max(avant.lastIndexOf(','), avant.lastIndexOf(';')) + 1
  const apres = valeur.slice(curseur).search(SEPARATEUR)
  const fin = apres < 0 ? valeur.length : curseur + apres
  return { debut, fin, texte: valeur.slice(debut, fin).trim() }
}

/** Les adresses déjà présentes, pour ne pas reproposer celles qu'on a mises. */
export function adressesDe(valeur: string): string[] {
  return valeur.split(SEPARATEUR).map((a) => a.trim().toLowerCase()).filter(Boolean)
}

export interface Personne { prenom: string; nom: string; email: string }

/**
 * Les membres dont un mot COMMENCE par ce qu'on tape — prénom, nom, ou adresse.
 *
 * DÈS DEUX LETTRES, PAS AVANT : à une lettre, « m » propose la moitié de l'équipe et la liste
 * s'ouvre sous chaque frappe. « ma » départage déjà Marie et Matthieu de Michel.
 *
 * PAR LE DÉBUT DES MOTS, et non n'importe où : « rie » ne doit pas trouver Marie. Taper le début
 * d'un prénom, d'un nom ou d'une adresse, c'est ce qu'on fait naturellement.
 */
export function suggestions<P extends Personne>(equipe: P[], texte: string, dejaLa: string[], max = 6): P[] {
  const q = normaliser(texte.trim())
  if (q.length < 2) return []
  const mots = q.split(/\s+/).filter(Boolean)
  return equipe
    .filter((p) => !dejaLa.includes(p.email.toLowerCase()))
    .filter((p) => {
      const nom = normaliser(`${p.prenom} ${p.nom}`)
      const email = normaliser(p.email)
      const debuts = [...nom.split(/[\s-]+/), email, email.split('@')[0], ...email.split('@')[0].split(/[._-]/)]
      /* Chaque mot tapé doit ouvrir un mot du nom ou de l'adresse : « marie th » trouve Marie Thonnard. */
      return mots.every((m) => debuts.some((d) => d.startsWith(m))) || nom.startsWith(q)
    })
    /* Celles dont le PRÉNOM commence par la frappe d'abord : c'est ainsi qu'on pense aux collègues. */
    .sort((a, b) => Number(!normaliser(a.prenom).startsWith(mots[0])) - Number(!normaliser(b.prenom).startsWith(mots[0])))
    .slice(0, max)
}

/**
 * Remplace le morceau sous le curseur par l'adresse choisie, et prépare la suivante.
 *
 * La virgule et l'espace qui suivent sont posés d'office : on met souvent plusieurs collègues en
 * copie, et c'est ce qui permet de taper le prénom suivant sans rien d'autre.
 */
export function insererAdresse(valeur: string, curseur: number, email: string) {
  const { debut, fin } = jetonAuCurseur(valeur, curseur)
  const avant = valeur.slice(0, debut).replace(/\s+$/, '')
  const apres = valeur.slice(fin).replace(/^\s*[,;]?\s*/, '')
  const tete = `${avant ? `${avant} ` : ''}${email}, `
  return { valeur: tete + apres, curseur: tete.length }
}

/**
 * La liste remise au propre avant l'envoi : une adresse par entrée, séparées par « , ».
 *
 * Le serveur recopie le champ tel quel dans l'en-tête du mail. Une virgule finale — celle que
 * `insererAdresse` pose pour enchaîner —, un « ;; » tapé par réflexe ou un espace en trop y
 * produiraient une entrée vide. Autant ne jamais en envoyer.
 */
export function nettoyerAdresses(valeur: string | null | undefined): string {
  return (valeur ?? '').split(SEPARATEUR).map((a) => a.trim()).filter(Boolean).join(', ')
}
