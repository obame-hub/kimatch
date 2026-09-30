import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input } from '@/components/ui/form'
import { useCreerPiste } from '@/lib/data/prospection'

/**
 * ══ CRÉER UNE PISTE ══
 *
 * Sorti de la page Prospection le 30/09/2026 : le Cockpit l'ouvre aussi, depuis « Mes pistes »
 * (William : « dans Cockpit, dans "Mes pistes", rajouter un bouton de création de piste »). Un seul
 * formulaire pour les deux portes. La piste créée appartient à qui la crée (`fn_audit_trace` pose
 * `proprietaire_id`) : c'est ce qui la fait apparaître aussitôt dans « Mes pistes ».
 */
export function DialogPiste({ onFermer, signaler }: { onFermer: () => void; signaler: (m: string) => void }) {
  const creer = useCreerPiste()
  const [societe, setSociete] = useState('')
  const [contact, setContact] = useState('')
  const [email, setEmail] = useState('')
  const [telephone, setTelephone] = useState('')

  return (
    <Dialog open onClose={onFermer} title="Nouvelle piste" description="Les cinq vérifications se cochent ensuite, sur la carte.">
      <div className="space-y-3">
        <FormField label="Société"><Input value={societe} onChange={(e) => setSociete(e.target.value)} /></FormField>
        <FormField label="Contact"><Input value={contact} onChange={(e) => setContact(e.target.value)} /></FormField>
        <FormField label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></FormField>
        <FormField label="Téléphone"><Input value={telephone} onChange={(e) => setTelephone(e.target.value)} /></FormField>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onFermer}>Annuler</Button>
          <Button
            type="button"
            disabled={creer.isPending}
            onClick={async () => {
              try {
                await creer.mutateAsync({
                  societe: societe.trim() || null,
                  contact_nom: contact.trim() || null,
                  email: email.trim() || null,
                  telephone: telephone.trim() || null,
                })
                onFermer()
                signaler('✓ Piste créée')
              } catch (e) {
                signaler(e instanceof Error ? e.message : 'Création impossible')
              }
            }}
          >
            Créer
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
