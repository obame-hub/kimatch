import { useEffect, useState } from 'react'
import { PenLine, Loader2, Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { useSignatureEmail, useEnregistrerSignatureEmail } from '@/lib/data/signatureEmail'

/**
 * ══ SA SIGNATURE EMAIL : TROIS CHAMPS, ET UN APERÇU ══
 *
 * Naoëlle, 07/09/2026, captures d'écran à l'appui : « les signatures, on les a chacun comme ça, il
 * faudrait les ajouter en HTML. Y a même le numéro chez certains commerciaux. »
 *
 * ══ UN FORMULAIRE, ET NON UN ÉDITEUR HTML ══
 *
 * La première version de cette carte offrait un éditeur libre. Dix personnes, dix blocs modifiés
 * séparément : au troisième mois les signatures ne se ressemblent plus — l'une a perdu le filet vert,
 * l'autre écrit « Kiwee » au lieu de « KIWEE ». C'est le sort de toutes les signatures d'entreprise
 * laissées en édition libre.
 *
 * On ne saisit donc que ce qui est PROPRE À LA PERSONNE : sa fonction, son fixe, son mobile. Le nom,
 * l'adresse et la photo viennent du profil, et la mise en page vient d'un gabarit unique en base
 * (`fn_signature_html`). Changer la présentation pour toute l'équipe, c'est changer une fonction,
 * une fois.
 *
 * ══ L'APERÇU EST LE VRAI HTML ══
 *
 * Ce n'est pas une reconstitution : c'est `corps_html`, regénéré en base par un déclencheur et relu
 * ici. Ce qu'on voit est exactement ce que le client recevra — un aperçu approximatif ferait
 * découvrir les écarts par les clients.
 */
export function CarteSignature() {
  const { data: signature, isLoading } = useSignatureEmail()
  const enregistrer = useEnregistrerSignatureEmail()

  const [fonction, setFonction] = useState('')
  const [fixe, setFixe] = useState('')
  const [mobile, setMobile] = useState('')
  const [enregistre, setEnregistre] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [charge, setCharge] = useState(false)

  useEffect(() => {
    if (charge || isLoading) return
    setCharge(true)
    setFonction(signature?.fonction ?? '')
    setFixe(signature?.telephone_fixe ?? '')
    setMobile(signature?.telephone_mobile ?? '')
  }, [charge, isLoading, signature])

  const modifiee =
    fonction !== (signature?.fonction ?? '')
    || fixe !== (signature?.telephone_fixe ?? '')
    || mobile !== (signature?.telephone_mobile ?? '')

  async function sauver() {
    setErreur(null)
    try {
      await enregistrer.mutateAsync({
        // Une chaîne vide vaut « pas renseigné » : la stocker ferait afficher une pastille de
        // téléphone vide dans la signature.
        fonction: fonction.trim() || null,
        telephone_fixe: fixe.trim() || null,
        telephone_mobile: mobile.trim() || null,
      })
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
          Ajoutée au bas des mails envoyés depuis Kimatch. Votre nom, votre adresse et votre photo
          viennent de votre profil ; la mise en page est la même pour toute l’équipe.
        </p>

        {isLoading ? (
          <p className="text-xs text-km-muted">Chargement…</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2.5">
              <label className="block">
                <span className="mb-1 block text-km-xs font-bold uppercase tracking-wide text-km-faint">
                  Fonction
                </span>
                <Input
                  value={fonction}
                  onChange={(e) => setFonction(e.target.value)}
                  placeholder="Responsable Pôle Syndics"
                />
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <label className="block">
                  <span className="mb-1 block text-km-xs font-bold uppercase tracking-wide text-km-faint">
                    Téléphone fixe
                  </span>
                  <Input value={fixe} onChange={(e) => setFixe(e.target.value)} placeholder="01 76 38 15 23" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-km-xs font-bold uppercase tracking-wide text-km-faint">
                    Mobile
                  </span>
                  <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="06 44 60 18 54" />
                </label>
              </div>
              <p className="text-km-xs leading-snug text-km-faint">
                Les téléphones s’affichent en pastilles. Laissez vide ceux que vous ne voulez pas
                communiquer.
              </p>
            </div>

            {erreur && (
              <p className="rounded-km border border-km-red-line bg-km-red-soft px-2.5 py-2 text-xs text-km-red">
                {erreur}
              </p>
            )}

            <div className="flex items-center gap-2">
              <Button type="button" size="sm" disabled={!modifiee || enregistrer.isPending} onClick={() => void sauver()}>
                {enregistrer.isPending
                  ? <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> Enregistrement…</>
                  : 'Enregistrer'}
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

            {/* ── L'aperçu : le vrai HTML, tel qu'il partira ── */}
            <div>
              <p className="mb-1.5 text-km-xs font-bold uppercase tracking-wide text-km-faint">
                Aperçu {modifiee && <span className="font-medium normal-case text-km-amber">— enregistrez pour le mettre à jour</span>}
              </p>
              <div className="overflow-x-auto rounded-km border border-km-line bg-white p-3">
                {signature?.corps_html
                  ? (
                    <div
                      // Sa PROPRE signature, construite par le gabarit en base et non saisie
                      // librement : le contenu ne vient d'aucun tiers.
                      dangerouslySetInnerHTML={{ __html: signature.corps_html }}
                    />
                  )
                  : <p className="text-xs text-km-muted">Aucune signature enregistrée.</p>}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
