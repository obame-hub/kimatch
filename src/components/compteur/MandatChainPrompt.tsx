import { useNavigate } from 'react-router-dom'
import { ArrowRight, AlertTriangle, FileCheck2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Contact } from '@/types/domain'

export interface ChainedCompteur {
  id: string
  numero_pdl: string
  responsable_contact_id: string | null
}

/** Écran "Enchaîner avec la création des mandats" affiché juste après la création d'un ou
 * plusieurs PDL -- même logique que MandatChainPrompt.tsx dans Tools : regroupe les PDL créés par
 * responsable et propose un mandat par groupe (un mandat = un signataire), en bloquant seulement
 * si le responsable n'a pas d'email (requis pour l'envoi en signature DocuSign). */
export function MandatChainPrompt({
  compteId,
  compteNom,
  compteurs,
  contacts,
  onDone,
}: {
  compteId: string
  compteNom: string
  compteurs: ChainedCompteur[]
  contacts: Contact[]
  onDone: () => void
}) {
  const navigate = useNavigate()

  const groupes = new Map<string, { contact: Contact | null; compteurs: ChainedCompteur[] }>()
  for (const c of compteurs) {
    const key = c.responsable_contact_id ?? '__sans_responsable__'
    if (!groupes.has(key)) {
      const contact = c.responsable_contact_id ? contacts.find((ct) => ct.id === c.responsable_contact_id) ?? null : null
      groupes.set(key, { contact, compteurs: [] })
    }
    groupes.get(key)!.compteurs.push(c)
  }
  const entries = [...groupes.values()]
  const sansEmail = entries.filter((g) => g.contact && !g.contact.email)

  function creerMandat(groupe: { contact: Contact | null; compteurs: ChainedCompteur[] }) {
    const pdls = groupe.compteurs.map((c) => c.id).join(',')
    const params = new URLSearchParams({ compte: compteId, pdls })
    if (groupe.contact) params.set('contact', groupe.contact.id)
    navigate(`/mandats?${params.toString()}`)
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-km-line bg-km-bg p-3 text-sm text-km-text">
        <p className="font-medium">Enchaîner avec la création des mandats</p>
        <p className="mt-0.5 text-xs text-km-muted">
          {compteurs.length} point{compteurs.length > 1 ? 's' : ''} de livraison créé{compteurs.length > 1 ? 's' : ''} sur {compteNom} ·{' '}
          <span className="font-medium">{entries.length} mandat{entries.length > 1 ? 's' : ''}</span> à générer (un par responsable).
        </p>
      </div>

      {sansEmail.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {sansEmail.length} responsable{sansEmail.length > 1 ? 's' : ''} sans email — un email est requis pour l'envoi en signature DocuSign.
        </p>
      )}

      <div className="space-y-2">
        {entries.map((g, i) => {
          const emailManquant = !!g.contact && !g.contact.email
          return (
            <div key={g.contact?.id ?? `sans-responsable-${i}`} className="flex items-center justify-between gap-3 rounded-lg border border-km-line p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-km-text">
                  {g.contact ? `${g.contact.prenom} ${g.contact.nom}` : 'Sans responsable'}
                  <Badge tone="neutral" className="ml-2">{g.compteurs.length} PDL</Badge>
                </p>
                {g.contact ? (
                  emailManquant ? (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-amber-700">
                      <AlertTriangle className="h-3 w-3 shrink-0" /> Email manquant — complète l'adresse email de ce contact, puis reviens ici.
                    </p>
                  ) : (
                    <p className="mt-0.5 truncate text-xs text-km-faint">{g.contact.email}</p>
                  )
                ) : (
                  <p className="mt-0.5 text-xs text-km-faint">Renseigne un responsable pour pouvoir générer un mandat.</p>
                )}
              </div>
              <Button type="button" size="sm" disabled={!g.contact || emailManquant} onClick={() => creerMandat(g)}>
                <FileCheck2 className="h-3.5 w-3.5" /> Créer le mandat
              </Button>
            </div>
          )
        })}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>Terminer sans créer de mandat</Button>
        {entries.length === 1 && entries[0].contact && entries[0].contact.email && (
          <Button type="button" onClick={() => creerMandat(entries[0])}>
            Créer le mandat <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
