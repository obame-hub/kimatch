import { useState, type ReactNode } from 'react'
import { FenetreApercu } from '@/components/document/FenetreApercu'

/**
 * Un lien vers un document du seau privé : il l'OUVRE, il ne le télécharge pas.
 *
 * Il ne peut pas être un `<a href>` : le seau est privé, l'adresse enregistrée ne s'ouvre pas telle
 * quelle, et surtout le navigateur ENREGISTRE au lieu d'afficher devant un `application/octet-stream`
 * — le type des 6 454 documents repris de Salesforce. Cliquer sur le nom d'une proposition
 * commerciale pour la lire déclenchait donc un téléchargement.
 *
 * William, 25/09/2026 : « quand je veux visualiser un fichier, ouvre une popup avec la
 * visualisatrice ». Le clic ouvre `FenetreApercu`, qui rend le document dans Kimatch et garde le
 * téléchargement à un bouton de là.
 */
export function LienDocument({ url, className, titre, nom, nomFichier, children }: {
  url: string
  className?: string
  titre?: string
  /** Le nom affiché en tête de l'aperçu ; à défaut, le texte du lien. */
  nom?: string
  nomFichier?: string | null
  children: ReactNode
}) {
  const [ouvert, setOuvert] = useState(false)

  return (
    <>
      <button type="button" title={titre} onClick={() => setOuvert(true)} className={className}>
        {children}
      </button>
      {ouvert && (
        <FenetreApercu
          document={{
            id: url,
            nom: nom ?? titre ?? 'Document',
            nom_fichier: nomFichier ?? null,
            url,
          }}
          onFermer={() => setOuvert(false)}
        />
      )}
    </>
  )
}
