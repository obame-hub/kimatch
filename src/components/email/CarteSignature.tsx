import { useEffect, useRef, useState } from 'react'
import { PenLine, Bold, Italic, Link2, Loader2, Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useSignatureEmail, useEnregistrerSignatureEmail } from '@/lib/data/signatureEmail'

/**
 * ══ SA SIGNATURE EMAIL, ÉCRITE PAR SOI ══
 *
 * Naoëlle, 07/09/2026 : « il faut bien la signature de chacun de nos commerciaux. »
 *
 * ══ POURQUOI ELLE S'ÉCRIT ICI ET NON DANS UN ÉCRAN D'ADMINISTRATION ══
 *
 * Une signature porte un nom, une fonction, un téléphone direct : c'est une identité, et personne
 * ne la connaît mieux que son propriétaire. La faire saisir par un administrateur pour dix personnes
 * garantit dix approximations et dix allers-retours. Elle vit donc dans Mon profil, à côté de la
 * connexion Gmail dont elle dépend.
 *
 * ══ ELLE EST DÉJÀ AMORCÉE ══
 *
 * La migration 20260907200000 a écrit une première version pour chacun à partir de son nom et de son
 * adresse, avec un « [votre fonction — à compléter] » en évidence. Une page blanche aurait produit
 * dix mails sans signature, parce que personne ne va spontanément dans un écran de réglages ; un
 * texte à trous, on le corrige dès qu'on le voit.
 *
 * ══ CE QU'ELLE NE PROPOSE PAS, VOLONTAIREMENT ══
 *
 * Ni image, ni tableau, ni couleur libre. Une signature part chez des clients qui la liront dans
 * Outlook, un webmail de FAI ou un téléphone : le gras, l'italique et les liens passent partout, une
 * mise en page non. Et une image insérée depuis Kimatch serait affichée comme pièce jointe par la
 * moitié des clients de messagerie.
 */
export function CarteSignature() {
  const { data: signature, isLoading } = useSignatureEmail()
  const enregistrer = useEnregistrerSignatureEmail()

  const corpsRef = useRef<HTMLDivElement>(null)
  const [brouillon, setBrouillon] = useState<string | null>(null)
  const [enregistre, setEnregistre] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const charge = useRef(false)

  /* Le contenu n'est injecté qu'une fois : le réécrire à chaque rendu replacerait le curseur au
     début à chaque lettre tapée. */
  useEffect(() => {
    if (charge.current || isLoading) return
    charge.current = true
    const html = signature?.corps_html ?? ''
    setBrouillon(html)
    if (corpsRef.current) corpsRef.current.innerHTML = html
  }, [isLoading, signature])

  const modifiee = brouillon !== null && brouillon !== (signature?.corps_html ?? '')

  const commande = (nom: string, valeur?: string) => {
    corpsRef.current?.focus()
    document.execCommand(nom, false, valeur)
    if (corpsRef.current) setBrouillon(corpsRef.current.innerHTML)
  }

  async function sauver() {
    if (brouillon === null) return
    setErreur(null)
    try {
      await enregistrer.mutateAsync({ corps_html: brouillon })
      setEnregistre(true)
      window.setTimeout(() => setEnregistre(false), 4000)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PenLine className="h-4 w-4 text-km-green" />
          Ma signature email
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs leading-relaxed text-km-muted">
          Ajoutée au bas des mails envoyés depuis Kimatch. Complétez votre fonction et votre
          téléphone : la version de départ ne connaît que votre nom et votre adresse.
        </p>

        {isLoading ? (
          <p className="text-xs text-km-muted">Chargement…</p>
        ) : (
          <>
            <div className="flex items-center gap-1 rounded-km border border-km-line bg-km-soft px-2 py-1.5">
              <Outil onClick={() => commande('bold')} titre="Gras"><Bold className="h-3.5 w-3.5" /></Outil>
              <Outil onClick={() => commande('italic')} titre="Italique"><Italic className="h-3.5 w-3.5" /></Outil>
              <Outil
                onClick={() => {
                  const url = window.prompt('Adresse du lien')
                  if (url) commande('createLink', /^https?:\/\//i.test(url) ? url : `https://${url}`)
                }}
                titre="Insérer un lien"
              >
                <Link2 className="h-3.5 w-3.5" />
              </Outil>
            </div>

            <div
              ref={corpsRef}
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => setBrouillon(e.currentTarget.innerHTML)}
              className="min-h-[110px] rounded-km border border-km-line bg-white px-3 py-2.5 text-xs leading-relaxed text-km-text focus:outline-none focus:ring-2 focus:ring-km-green/20 [&_a]:text-km-green [&_a]:underline"
            />

            {erreur && (
              <p className="rounded-km border border-km-red-line bg-km-red-soft px-2.5 py-2 text-xs text-km-red">
                {erreur}
              </p>
            )}

            <div className="flex items-center gap-2">
              <Button type="button" size="sm" disabled={!modifiee || enregistrer.isPending} onClick={() => void sauver()}>
                {enregistrer.isPending ? <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> Enregistrement…</> : 'Enregistrer'}
              </Button>
              {enregistre && (
                <span className="flex items-center gap-1 text-xs font-semibold text-km-green">
                  <Check className="h-3 w-3" /> Signature enregistrée
                </span>
              )}
              {modifiee && !enregistrer.isPending && !enregistre && (
                <span className="text-xs text-km-faint">Modifications non enregistrées</span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Outil({ onClick, titre, children }: { onClick: () => void; titre: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      // Sans `preventDefault`, le clic fait perdre la sélection avant que la commande s'applique.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={titre}
      className="flex h-7 w-7 items-center justify-center rounded-km text-km-muted transition-colors hover:bg-white hover:text-km-text"
    >
      {children}
    </button>
  )
}
