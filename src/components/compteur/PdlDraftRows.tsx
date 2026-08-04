import { AlertTriangle, Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormField, Input, Select } from '@/components/ui/form'
import type { Compte, Contact } from '@/types/domain'
import type { ReferenceRow } from '@/lib/data/referenceTables'
import { PDL_FORMAT_RE, findCompteurByNumero } from '@/lib/data/compteurs'
import type { Compteur } from '@/types/domain'

let draftKeySeq = 0
function nextDraftKey() {
  draftKeySeq += 1
  return `draft-${draftKeySeq}`
}

export interface PdlDraft {
  key: string
  typeEnergieId: string
  numeroPdl: string
  utilisation: string
  typeUtilisationId: string
  dateEcheance: string
  fournisseurActuelId: string
  responsableContactId: string
  status: 'draft' | 'saving' | 'saved' | 'error'
  errorMessage: string | null
}

export function emptyPdlDraft(): PdlDraft {
  return {
    key: nextDraftKey(),
    typeEnergieId: '',
    numeroPdl: '',
    utilisation: '',
    typeUtilisationId: '',
    dateEcheance: '',
    fournisseurActuelId: '',
    responsableContactId: '',
    status: 'draft',
    errorMessage: null,
  }
}

export function PdlDraftRows({
  drafts,
  onChange,
  onRemove,
  onAdd,
  energies,
  utilisationsRef,
  fournisseurs,
  contacts,
  existingCompteurs,
}: {
  drafts: PdlDraft[]
  onChange: (key: string, patch: Partial<PdlDraft>) => void
  onRemove: (key: string) => void
  onAdd: () => void
  energies: ReferenceRow[]
  utilisationsRef?: ReferenceRow[]
  fournisseurs: Compte[]
  contacts: Contact[]
  existingCompteurs: Compteur[]
}) {
  return (
    <div className="space-y-4">
      {drafts.map((d, i) => {
        const energieChoisie = energies.find((e) => e.id === d.typeEnergieId)
        const estElectricite = (energieChoisie?.code ?? '').toLowerCase() === 'electricite'
        const numero = d.numeroPdl.trim()
        const doublon = numero ? findCompteurByNumero(existingCompteurs, numero) : null
        const formatSuspect = numero.length > 0 && !PDL_FORMAT_RE.test(numero.toUpperCase())
        const locked = d.status === 'saved' || d.status === 'saving'

        return (
          <div key={d.key} className={`rounded-xl border p-4 ${d.status === 'saved' ? 'border-kiwi-200 bg-kiwi-50/40' : 'border-navy-100'}`}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">PDL {i + 1}{d.status === 'saved' && ' — créé'}</p>
              {!locked && drafts.length > 1 && (
                <button type="button" onClick={() => onRemove(d.key)} className="text-navy-400 hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <fieldset disabled={locked} className="space-y-3 disabled:opacity-60">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Type d'énergie">
                  <Select value={d.typeEnergieId} onChange={(e) => onChange(d.key, { typeEnergieId: e.target.value, typeUtilisationId: '' })} required>
                    <option value="">Sélectionner…</option>
                    {energies.map((en) => <option key={en.id} value={en.id}>{en.libelle}</option>)}
                  </Select>
                </FormField>
                <FormField label={estElectricite ? 'Numéro de PDL' : 'Numéro de PCE'}>
                  <Input value={d.numeroPdl} onChange={(e) => onChange(d.key, { numeroPdl: e.target.value })} required placeholder="Ex. 30001234567890" />
                </FormField>
              </div>
              {(doublon || formatSuspect) && (
                <p className="flex items-center gap-1.5 text-xs text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {doublon ? `Un compteur avec ce numéro existe déjà (${doublon.site_nom}).` : "Format inhabituel pour un numéro de PDL/PCE — vérifie avant de continuer."}
                </p>
              )}
              <FormField label="Utilisation">
                <Input value={d.utilisation} onChange={(e) => onChange(d.key, { utilisation: e.target.value })} placeholder="Ex. Parties communes, Chaufferie…" />
              </FormField>
              {estElectricite && utilisationsRef && utilisationsRef.length > 0 && (
                <FormField label="Type d'utilisation (CU/MU/LU)">
                  <Select value={d.typeUtilisationId} onChange={(e) => onChange(d.key, { typeUtilisationId: e.target.value })}>
                    <option value="">Non renseigné</option>
                    {utilisationsRef.map((u) => <option key={u.id} value={u.id}>{u.libelle}</option>)}
                  </Select>
                </FormField>
              )}
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Fournisseur actuel">
                  <Select value={d.fournisseurActuelId} onChange={(e) => onChange(d.key, { fournisseurActuelId: e.target.value })}>
                    <option value="">Non renseigné</option>
                    {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
                  </Select>
                </FormField>
                <FormField label="Échéance">
                  <Input type="date" value={d.dateEcheance} onChange={(e) => onChange(d.key, { dateEcheance: e.target.value })} />
                </FormField>
              </div>
              <FormField label="Responsable">
                <Select value={d.responsableContactId} onChange={(e) => onChange(d.key, { responsableContactId: e.target.value })}>
                  <option value="">Non renseigné</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
                </Select>
              </FormField>
            </fieldset>
            {d.errorMessage && <p className="mt-2 text-xs text-red-600">{d.errorMessage}</p>}
          </div>
        )
      })}
      <Button type="button" variant="outline" size="sm" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5" /> Ajouter un autre PDL
      </Button>
    </div>
  )
}
