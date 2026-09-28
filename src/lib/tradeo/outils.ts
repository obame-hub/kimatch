/**
 * Les petits outils du banc Tradeo qui ne sont pas des composants : le référentiel des statuts de
 * compteur (documentation v1.4, « Statuts possibles d'un compteur ») et la lecture d'un fichier.
 */

export const LIBELLE_STATUT_COMPTEUR: Record<number, { libelle: string; tone: 'neutral' | 'green' | 'red' | 'amber' }> = {
  0: { libelle: 'En attente', tone: 'amber' },
  1: { libelle: 'Accepté', tone: 'green' },
  2: { libelle: 'Refusé', tone: 'red' },
  3: { libelle: 'ACD expiré', tone: 'red' },
  4: { libelle: 'Annulé', tone: 'neutral' },
}

/** Lit un fichier choisi dans le navigateur pour l'envoyer au serveur en base64. */
export function lireFichier(fichier: File): Promise<{ nom: string; type: string; base64: string }> {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader()
    lecteur.onload = () => {
      const url = String(lecteur.result)
      resolve({ nom: fichier.name, type: fichier.type || 'application/pdf', base64: url.slice(url.indexOf(',') + 1) })
    }
    lecteur.onerror = () => reject(lecteur.error)
    lecteur.readAsDataURL(fichier)
  })
}
