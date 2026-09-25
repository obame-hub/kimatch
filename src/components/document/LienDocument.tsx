import { useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { urlOuvrableDocument } from '@/lib/data/documents'
import { cn } from '@/lib/utils'

/**
 * Un lien vers un document du bucket privé.
 *
 * Il ne peut pas être un `<a href>` : l'adresse à ouvrir n'existe qu'une fois signée, et signer
 * exige un aller-retour. Le clic signe puis ouvre — voir `urlOuvrableDocument` pour la raison
 * pour laquelle l'adresse n'est pas signée une fois pour toutes en base.
 *
 * L'ÉCHEC SE VOIT. Un lien qui ne fait rien au clic est la pire des pannes : on reclique, on
 * recharge, on finit par croire le fichier perdu. Le message prend la place du lien.
 */
export function LienDocument({ url, className, titre, children }: {
  url: string
  className?: string
  titre?: string
  children: ReactNode
}) {
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function ouvrir() {
    if (enCours) return
    setEnCours(true)
    setErreur(null)
    try {
      const adresse = await urlOuvrableDocument(url)
      window.open(adresse, '_blank', 'noopener')
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Ce fichier n’a pas pu être ouvert.')
    } finally {
      setEnCours(false)
    }
  }

  if (erreur) {
    return <span className="text-[11.5px] text-km-red" title={erreur}>{erreur}</span>
  }

  return (
    <button type="button" title={titre} onClick={() => void ouvrir()} className={cn(className, enCours && 'opacity-60')}>
      {enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : children}
    </button>
  )
}
