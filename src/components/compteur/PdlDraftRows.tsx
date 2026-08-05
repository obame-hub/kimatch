import { AlertTriangle, Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormField, Input, Select } from '@/components/ui/form'
import { ContactPicker } from '@/components/contact/ContactPicker'
import type { Compte, Contact } from '@/types/domain'
import type { ReferenceRow } from '@/lib/data/referenceTables'
import { PDL_FORMAT_RE, findCompteurByNumero } from '@/lib/data/compteurs'
import type { Compteur } from '@/types/domain'

let draftKeySeq = 0
function nextDraftKey() {
  draftKeySeq += 1
  return `draft-${draftKeySeq}`
}

const SEGMENTS_ELEC = ['C1', 'C2', 'C3', 'C4', 'C5']
const TENSIONS_ELEC = ['BT', 'HTA']
const TARIFS_GAZ = ['T1', 'T2', 'T3', 'T4']
const PROFILS_GAZ = ['P011', 'P012', 'P013', 'P014', 'P015', 'P016', 'P017', 'P018', 'P019']
const CLASSES_PUISSANCE_ELEC: { key: string; label: string }[] = [
  { key: 'pointe', label: 'PS POINTE (kVA)' },
  { key: 'hph', label: 'PS HPH (kVA)' },
  { key: 'hch', label: 'PS HCH (kVA)' },
  { key: 'hpe', label: 'PS HPE (kVA)' },
  { key: 'hce', label: 'PS HCE (kVA)' },
]

export interface PdlDraft {
  key: string
  typeEnergieId: string
  numeroPdl: string
  utilisation: string
  typeUtilisationId: string
  dateEcheance: string
  fournisseurActuelId: string
  responsableContactId: string
  // Caractéristiques techniques -- saisissables manuellement dès la création, comme dans Tools
  // (manuelle ou extraction facture), en repli de la synchro GRD réelle qui n'a lieu qu'une fois
  // le mandat actif. Requises (voir champsPdlManquants) : sans elles le moteur d'éligibilité
  // fournisseur de la cotation n'a rien à exploiter.
  segment: string
  tension: string
  puissanceParClasseKva: Record<string, string>
  tarifDistribution: string
  profilConsommation: string
  carMwh: string
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
    segment: '',
    tension: '',
    puissanceParClasseKva: {},
    tarifDistribution: '',
    profilConsommation: '',
    carMwh: '',
    status: 'draft',
    errorMessage: null,
  }
}

/** Champs requis encore vides sur un brouillon de PDL -- même règle que Tools
 * (computeRequiredFields) : numéro + responsable toujours, puis segment/tension/utilisation +
 * puissances pour l'élec (PS Unique si C5, sinon les 5 classes), tarif/profil/CAR pour le gaz.
 * Sert à la fois au surlignage des champs et au blocage de l'enregistrement. */
export function champsPdlManquants(d: PdlDraft, estElectricite: boolean): Set<string> {
  const manquants = new Set<string>()
  if (!d.numeroPdl.trim()) manquants.add('numeroPdl')
  if (!d.responsableContactId) manquants.add('responsableContactId')
  if (!d.typeEnergieId) {
    manquants.add('typeEnergieId')
    return manquants
  }
  if (estElectricite) {
    if (!d.segment) manquants.add('segment')
    if (!d.tension) manquants.add('tension')
    if (!d.typeUtilisationId) manquants.add('typeUtilisationId')
    const classes = d.segment === 'C5' ? ['base'] : CLASSES_PUISSANCE_ELEC.map((c) => c.key)
    for (const k of classes) {
      if (!(d.puissanceParClasseKva[k] ?? '').trim()) manquants.add(`ps:${k}`)
    }
  } else {
    if (!d.tarifDistribution) manquants.add('tarifDistribution')
    if (!d.profilConsommation) manquants.add('profilConsommation')
    if (!d.carMwh.trim()) manquants.add('carMwh')
  }
  return manquants
}

/** Bordure ambre vive sur un champ requis encore vide -- Tools surligne ces champs en orange. */
const CLASSE_MANQUANT = 'border-amber-500 bg-amber-50/40'

/** Construit les objets `grdElec`/`grdGaz` attendus par `useCreateCompteur` à partir des
 * caractéristiques techniques saisies manuellement dans le brouillon (segment/tension/puissances
 * pour l'élec, tarif/profil/CAR pour le gaz) -- même conduit que la synchro GRD réelle, mais
 * alimenté à la main tant que le mandat n'est pas encore actif. */
export function buildDraftCharacteristics(d: PdlDraft, estElectricite: boolean) {
  if (estElectricite) {
    const hasSegment = !!d.segment
    const hasTension = !!d.tension
    const puissances = Object.fromEntries(
      Object.entries(d.puissanceParClasseKva).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, Number(v)]),
    )
    if (!hasSegment && !hasTension && Object.keys(puissances).length === 0) return {}
    return { grdElec: { segment: d.segment || null, tension: d.tension || null, puissanceParClasseKva: puissances } }
  }
  const hasTarif = !!d.tarifDistribution
  const hasProfil = !!d.profilConsommation
  const hasCar = d.carMwh.trim() !== ''
  if (!hasTarif && !hasProfil && !hasCar) return {}
  return {
    grdGaz: {
      tarif_distribution: d.tarifDistribution || null,
      profil_consommation: d.profilConsommation || null,
      car_mwh: hasCar ? Number(d.carMwh) : null,
    },
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
  allContacts,
  compteId,
  compteNom,
  compteSegment,
  existingCompteurs,
}: {
  drafts: PdlDraft[]
  onChange: (key: string, patch: Partial<PdlDraft>) => void
  onRemove: (key: string) => void
  onAdd: () => void
  energies: ReferenceRow[]
  utilisationsRef?: ReferenceRow[]
  fournisseurs: Compte[]
  /** Contacts rattachés au compte -- premier onglet du sélecteur de responsable. */
  contacts: Contact[]
  /** Tous les contacts du CRM -- second onglet (« Autre contact ») du sélecteur. */
  allContacts: Contact[]
  compteId: string
  compteNom: string
  compteSegment?: string | null
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
        // Champs requis encore vides -- surlignés en ambre tant qu'ils ne sont pas remplis (Tools).
        const manquants = locked ? new Set<string>() : champsPdlManquants(d, estElectricite)
        const kManque = (f: string) => (manquants.has(f) ? CLASSE_MANQUANT : undefined)

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
                <FormField label="Type d'énergie" required>
                  <Select value={d.typeEnergieId} onChange={(e) => onChange(d.key, { typeEnergieId: e.target.value, typeUtilisationId: '' })} required className={kManque('typeEnergieId')}>
                    <option value="">Sélectionner…</option>
                    {energies.map((en) => <option key={en.id} value={en.id}>{en.libelle}</option>)}
                  </Select>
                </FormField>
                <FormField label={estElectricite ? 'Numéro de PDL' : 'Numéro de PCE'} required>
                  <Input value={d.numeroPdl} onChange={(e) => onChange(d.key, { numeroPdl: e.target.value })} required placeholder="Ex. 30001234567890" className={kManque('numeroPdl')} />
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
                <FormField label="Type d'utilisation (CU/MU/LU)" required>
                  <Select value={d.typeUtilisationId} onChange={(e) => onChange(d.key, { typeUtilisationId: e.target.value })} className={kManque('typeUtilisationId')}>
                    <option value="">Non renseigné</option>
                    {utilisationsRef.map((u) => <option key={u.id} value={u.id}>{u.libelle}</option>)}
                  </Select>
                </FormField>
              )}
              {d.typeEnergieId && (
                <div className="rounded-lg border border-navy-100 bg-navy-50/60 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-navy-400">
                    {estElectricite ? 'Caractéristiques techniques' : 'Caractéristiques & consommation'}
                  </p>
                  {estElectricite ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <FormField label="Segment" required>
                          <Select value={d.segment} onChange={(e) => onChange(d.key, { segment: e.target.value })} className={kManque('segment')}>
                            <option value="">Non renseigné</option>
                            {SEGMENTS_ELEC.map((s) => <option key={s} value={s}>{s}</option>)}
                          </Select>
                        </FormField>
                        <FormField label="Tension" required>
                          <Select value={d.tension} onChange={(e) => onChange(d.key, { tension: e.target.value })} className={kManque('tension')}>
                            <option value="">Non renseigné</option>
                            {TENSIONS_ELEC.map((t) => <option key={t} value={t}>{t}</option>)}
                          </Select>
                        </FormField>
                      </div>
                      {d.segment === 'C5' ? (
                        <FormField label="PS Unique (kW)" required>
                          <Input
                            type="number"
                            step="0.1"
                            value={d.puissanceParClasseKva.base ?? ''}
                            onChange={(e) => onChange(d.key, { puissanceParClasseKva: { ...d.puissanceParClasseKva, base: e.target.value } })}
                            className={kManque('ps:base')}
                          />
                        </FormField>
                      ) : (
                        <div className="grid grid-cols-3 gap-3">
                          {CLASSES_PUISSANCE_ELEC.map((c) => (
                            <FormField key={c.key} label={c.label} required>
                              <Input
                                type="number"
                                step="0.1"
                                value={d.puissanceParClasseKva[c.key] ?? ''}
                                onChange={(e) => onChange(d.key, { puissanceParClasseKva: { ...d.puissanceParClasseKva, [c.key]: e.target.value } })}
                                className={kManque(`ps:${c.key}`)}
                              />
                            </FormField>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <FormField label="Tarif d'acheminement" required>
                          <Select value={d.tarifDistribution} onChange={(e) => onChange(d.key, { tarifDistribution: e.target.value })} className={kManque('tarifDistribution')}>
                            <option value="">Non renseigné</option>
                            {TARIFS_GAZ.map((t) => <option key={t} value={t}>{t}</option>)}
                          </Select>
                        </FormField>
                        <FormField label="Profil de consommation" required>
                          <Select value={d.profilConsommation} onChange={(e) => onChange(d.key, { profilConsommation: e.target.value })} className={kManque('profilConsommation')}>
                            <option value="">Non renseigné</option>
                            {PROFILS_GAZ.map((p) => <option key={p} value={p}>{p}</option>)}
                          </Select>
                        </FormField>
                      </div>
                      <FormField label="CAR (MWh)" required>
                        <Input type="number" step="0.1" value={d.carMwh} onChange={(e) => onChange(d.key, { carMwh: e.target.value })} className={kManque('carMwh')} />
                      </FormField>
                    </div>
                  )}
                </div>
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
              <div className={manquants.has('responsableContactId') ? 'rounded-lg ring-2 ring-amber-400' : undefined}>
                <FormField label="Responsable" required>
                  <ContactPicker
                    value={d.responsableContactId}
                    onChange={(contactId) => onChange(d.key, { responsableContactId: contactId })}
                    accountContacts={contacts}
                    allContacts={allContacts}
                    accountId={compteId}
                    accountNom={compteNom}
                    segment={compteSegment}
                  />
                </FormField>
              </div>
              {manquants.has('responsableContactId') ? (
                <p className="text-[11px] text-amber-700">La sélection d'un responsable est obligatoire.</p>
              ) : (
                <p className="text-[11px] text-navy-400">
                  Contacts liés au compte. Si le bon contact n'apparaît pas, cherchez dans tous les contacts du CRM.
                </p>
              )}
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
