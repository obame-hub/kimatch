import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Zap, Flame, Loader2, AlertCircle, Gauge, Hash, MapPin } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EntityLink } from '@/components/ui/entity-link'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { useCompteurs, useCreateCompteur } from '@/lib/data/compteurs'
import { useSites } from '@/lib/data/sites'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_TYPES_ENERGIES } from '@/lib/referenceFallbacks'
import { useEnedisFetch, type EnedisElecResult } from '@/lib/data/enedis'

function GrdDetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-navy-100 py-1.5 text-xs last:border-0">
      <span className="flex items-center gap-1.5 text-navy-500">
        <Icon className="h-3 w-3 opacity-60" />
        {label}
      </span>
      <span className="font-semibold text-navy-800">{value ?? '—'}</span>
    </div>
  )
}

function CreateCompteurDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: sites } = useSites()
  const { data: energiesRef } = useReferenceTable('types_energies')
  const energies = energiesRef && energiesRef.length > 0 ? energiesRef : FALLBACK_TYPES_ENERGIES
  const createCompteur = useCreateCompteur()
  const enedisFetch = useEnedisFetch()

  const [siteId, setSiteId] = useState('')
  const [typeEnergieId, setTypeEnergieId] = useState('')
  const [numeroPdl, setNumeroPdl] = useState('')
  const [utilisation, setUtilisation] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [grdResult, setGrdResult] = useState<EnedisElecResult | null>(null)
  const [grdError, setGrdError] = useState<string | null>(null)

  const energieChoisie = energies.find((en) => en.id === typeEnergieId)
  const isElec = (energieChoisie?.code?.toLowerCase() ?? 'electricite') !== 'gaz'

  function reset() {
    setSiteId('')
    setTypeEnergieId('')
    setNumeroPdl('')
    setUtilisation('')
    setFeedback(null)
    setGrdResult(null)
    setGrdError(null)
  }

  async function handleCollecter() {
    setGrdError(null)
    setGrdResult(null)
    try {
      const result = await enedisFetch.mutateAsync(numeroPdl.trim())
      if (!result.success) {
        setGrdError(result.error ?? 'Erreur Enedis inconnue')
        return
      }
      setGrdResult(result)
      if (!utilisation && result.utilisation) setUtilisation(result.utilisation)
    } catch (e) {
      setGrdError(e instanceof Error ? e.message : 'Erreur inconnue')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const site = sites?.find((s) => s.id === siteId)
    const energie = energies.find((en) => en.id === typeEnergieId)
    if (!site) return
    const typeEnergie = (energie?.code?.toLowerCase() === 'gaz' ? 'gaz' : 'electricite') as 'electricite' | 'gaz'

    // Pour les segments C1..C4 (HTA/fort consommateur), Enedis ventile conso et
    // puissance par classe temporelle (POINTE/HPH/HCH/HPE/HCE). Pour C5 (BT), une
    // seule puissance souscrite existe — on la range dans la case "base".
    const puissanceParClasseKva = grdResult?.isHTA
      ? grdResult.puissancesParClasse ?? undefined
      : grdResult?.puissanceSouscrite != null
        ? { BASE: grdResult.puissanceSouscrite }
        : undefined

    const result = await createCompteur.mutateAsync({
      site_id: site.id,
      site_nom: site.nom,
      type_energie_id: typeEnergieId || null,
      type_energie: typeEnergie,
      numero_pdl: numeroPdl,
      utilisation,
      consommation_annuelle_mwh: grdResult?.success ? grdResult.consoTotaleMwh ?? null : null,
      grdElec:
        grdResult?.success
          ? {
              segment: grdResult.segment ?? null,
              tension: grdResult.domaineTension?.toUpperCase().startsWith('BT') ? 'BT' : grdResult.isHTA ? 'HTA' : null,
              tarif_distribution: grdResult.ftaLibelle ?? grdResult.fta ?? null,
              consoParClasseMwh: grdResult.consoParClasseMwh ?? undefined,
              puissanceParClasseKva,
            }
          : undefined,
    })
    setFeedback(result.persisted ? 'Compteur créé.' : 'Compteur ajouté localement (non synchronisé avec Supabase).')
    setTimeout(() => {
      reset()
      onClose()
    }, 700)
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Nouveau compteur" description="Ajouter un point de livraison à un site.">
      <form onSubmit={handleSubmit} className="max-h-[75vh] space-y-3 overflow-y-auto pr-1">
        <FormField label="Site">
          <Select value={siteId} onChange={(e) => setSiteId(e.target.value)} required>
            <option value="">Sélectionner un site…</option>
            {sites?.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </Select>
        </FormField>
        <FormField label="Énergie">
          <Select value={typeEnergieId} onChange={(e) => { setTypeEnergieId(e.target.value); setGrdResult(null); setGrdError(null) }} required>
            <option value="">Sélectionner…</option>
            {energies.map((en) => <option key={en.id} value={en.id}>{en.libelle}</option>)}
          </Select>
        </FormField>
        <FormField label="Numéro (PDL / PCE)">
          <Input value={numeroPdl} onChange={(e) => { setNumeroPdl(e.target.value); setGrdResult(null); setGrdError(null) }} placeholder="Ex. 50060311986474" />
        </FormField>

        {typeEnergieId && (
          isElec ? (
            <div className="rounded-lg border border-kiwi-200 bg-kiwi-50/40 p-3">
              <Button
                type="button"
                onClick={handleCollecter}
                disabled={enedisFetch.isPending || !numeroPdl.trim()}
                className="w-full"
                variant="outline"
              >
                {enedisFetch.isPending ? (
                  <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Collecte en cours…</span>
                ) : (
                  <span className="flex items-center gap-2"><Zap className="h-4 w-4 text-kiwi-600" /> Collecter via Enedis</span>
                )}
              </Button>

              {grdError && (
                <div className="mt-2 flex items-start gap-2 rounded-md bg-red-50 p-2 text-xs text-red-700">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{grdError}</span>
                </div>
              )}

              {grdResult?.success && (
                <div className="mt-2 rounded-lg border border-navy-100 bg-white p-3">
                  <GrdDetailRow icon={Gauge} label="Segment" value={grdResult.segment} />
                  <GrdDetailRow icon={Hash} label="Tarif (FTA)" value={grdResult.ftaLibelle ?? grdResult.fta} />
                  <GrdDetailRow
                    icon={Zap}
                    label="Puissance souscrite"
                    value={grdResult.puissanceSouscrite != null ? `${grdResult.puissanceSouscrite} kVA` : null}
                  />
                  <GrdDetailRow
                    icon={Gauge}
                    label="Conso. annuelle"
                    value={grdResult.consoTotaleMwh != null ? `${grdResult.consoTotaleMwh} MWh` : null}
                  />
                  <GrdDetailRow icon={MapPin} label="Adresse" value={grdResult.adresse ? `${grdResult.adresse}, ${grdResult.ville ?? ''}` : grdResult.ville} />
                </div>
              )}
            </div>
          ) : (
            <p className="rounded-lg border border-navy-100 bg-navy-50 p-3 text-xs text-navy-500">
              Connecteur GRDF (gaz) à venir — les identifiants ne sont pas encore configurés.
            </p>
          )
        )}

        <FormField label="Utilisation">
          <Input value={utilisation} onChange={(e) => setUtilisation(e.target.value)} placeholder="Ex. Parties communes, Chaufferie…" />
        </FormField>
        {feedback && <p className="text-xs text-navy-500">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={createCompteur.isPending}>Créer le compteur</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function Compteurs() {
  const { data: compteurs, isLoading } = useCompteurs()
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div>
      <Topbar title="Compteurs" />
      <div className="p-6">
        <PageHeader
          title="Compteurs"
          description="Les points de livraison qui alimentent chaque site en énergie — électricité et gaz sont suivis séparément."
          actions={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nouveau compteur</Button>}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading && <p className="text-sm text-navy-400">Chargement…</p>}
          {compteurs?.map((c) => (
            <Card
              key={c.id}
              onClick={() => navigate(`/compteurs/${c.id}`)}
              className="animate-fade-up cursor-pointer p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={
                      'flex h-8 w-8 items-center justify-center rounded-lg ' +
                      (c.type_energie === 'electricite' ? 'bg-amber-gradient text-white' : 'bg-navy-800 text-white')
                    }
                  >
                    {c.type_energie === 'electricite' ? <Zap className="h-4 w-4" /> : <Flame className="h-4 w-4" />}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-navy-800"><EntityLink to={`/sites/${c.site_id}`}>{c.site_nom}</EntityLink></p>
                    <p className="text-xs text-navy-500">{c.utilisation}</p>
                  </div>
                </div>
                <Badge tone={c.statut === 'actif' ? 'kiwi' : 'neutral'}>{c.statut}</Badge>
              </div>
              <p className="mt-3 font-mono text-xs text-navy-400">{c.numero_pdl}</p>
            </Card>
          ))}
        </div>
      </div>
      <CreateCompteurDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
