import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Zap, Flame, Plus } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { useCompteurs } from '@/lib/data/compteurs'
import { useConsommations, useCreateConsommation } from '@/lib/data/consommations'

const POSTE_OPTIONS = ['TOTAL', 'HP', 'HC', 'POINTE', 'HPH', 'HCH', 'HPE', 'HCE']
const TYPE_VALEUR_OPTIONS = ['MESUREE', 'ESTIMEE', 'CORRIGEE']

function AddConsommationDialog({ compteurId, open, onClose }: { compteurId: string; open: boolean; onClose: () => void }) {
  const createConsommation = useCreateConsommation()
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [quantite, setQuantite] = useState('')
  const [unite, setUnite] = useState('MWh')
  const [posteTarifaire, setPosteTarifaire] = useState('TOTAL')
  const [typeValeur, setTypeValeur] = useState('MESUREE')
  const [feedback, setFeedback] = useState<string | null>(null)

  function reset() {
    setDateDebut('')
    setDateFin('')
    setQuantite('')
    setUnite('MWh')
    setPosteTarifaire('TOTAL')
    setTypeValeur('MESUREE')
    setFeedback(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const result = await createConsommation.mutateAsync({
      compteur_id: compteurId,
      date_debut_periode: dateDebut,
      date_fin_periode: dateFin,
      quantite: parseFloat(quantite),
      unite,
      poste_tarifaire: posteTarifaire,
      type_valeur: typeValeur,
      source: 'Saisie manuelle',
      commentaire: null,
    })
    setFeedback(result.persisted ? 'Période ajoutée.' : 'Ajoutée localement (non synchronisée avec Supabase).')
    setTimeout(() => {
      reset()
      onClose()
    }, 700)
  }

  return (
    <Dialog open={open} onClose={() => { reset(); onClose() }} title="Ajouter une période de consommation" description="Enregistrer un relevé pour ce compteur.">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Début de période">
            <Input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} required />
          </FormField>
          <FormField label="Fin de période">
            <Input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} required />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Quantité">
            <Input type="number" step="0.001" value={quantite} onChange={(e) => setQuantite(e.target.value)} required />
          </FormField>
          <FormField label="Unité">
            <Input value={unite} onChange={(e) => setUnite(e.target.value)} required />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Poste tarifaire">
            <Select value={posteTarifaire} onChange={(e) => setPosteTarifaire(e.target.value)}>
              {POSTE_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </FormField>
          <FormField label="Type de valeur">
            <Select value={typeValeur} onChange={(e) => setTypeValeur(e.target.value)}>
              {TYPE_VALEUR_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </FormField>
        </div>
        {feedback && <p className="text-xs text-navy-500">{feedback}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => { reset(); onClose() }}>Annuler</Button>
          <Button type="submit" disabled={createConsommation.isPending}>Ajouter</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function CompteurDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: compteurs } = useCompteurs()
  const { data: consommations } = useConsommations()
  const compteur = compteurs?.find((c) => c.id === id)
  const consommationsDuCompteur = consommations?.filter((c) => c.compteur_id === id) ?? []
  const [showAdd, setShowAdd] = useState(false)

  return (
    <div>
      <Topbar crumb="Compteurs" title={compteur ? `Compteur ${compteur.numero_pdl}` : 'Compteur'} />
      <div className="p-4 sm:p-6">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/compteurs')}>
          <ArrowLeft className="h-4 w-4" />
          Retour aux compteurs
        </Button>

        {!compteur ? (
          <p className="text-sm text-navy-500">Compteur introuvable.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-4 sm:p-6">
              <CardHeader className="px-0 pt-0">
                <CardTitle>Détail du compteur</CardTitle>
              </CardHeader>
              <CardContent className="px-0 space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <span
                    className={
                      'flex h-10 w-10 items-center justify-center rounded-lg ' +
                      (compteur.type_energie === 'electricite' ? 'bg-amber-gradient text-white' : 'bg-navy-800 text-white')
                    }
                  >
                    {compteur.type_energie === 'electricite' ? <Zap className="h-5 w-5" /> : <Flame className="h-5 w-5" />}
                  </span>
                  <div>
                    <p className="font-display font-medium text-navy-800">{compteur.utilisation}</p>
                    <p className="font-mono text-xs text-navy-400">{compteur.numero_pdl}</p>
                  </div>
                </div>
                <p><span className="text-navy-400">Type d'énergie :</span> {compteur.type_energie === 'electricite' ? 'Électricité' : 'Gaz'}</p>
                <p><span className="text-navy-400">Statut :</span> <Badge tone={compteur.statut === 'actif' ? 'kiwi' : 'neutral'}>{compteur.statut}</Badge></p>
                <p
                  className="cursor-pointer text-navy-600 hover:text-kiwi-700 hover:underline"
                  onClick={() => navigate(`/sites/${compteur.site_id}`)}
                >
                  Site : {compteur.site_nom} →
                </p>
                {compteur.consommation_annuelle_mwh != null && (
                  <p><span className="text-navy-400">Consommation annuelle :</span> {compteur.consommation_annuelle_mwh} MWh</p>
                )}
                {compteur.segment && <p><span className="text-navy-400">Segment :</span> {compteur.segment}</p>}
                {compteur.tension && <p><span className="text-navy-400">Tension :</span> {compteur.tension}</p>}
                {compteur.tarif_distribution && <p><span className="text-navy-400">Tarif :</span> {compteur.tarif_distribution}</p>}
                {compteur.car_mwh != null && <p><span className="text-navy-400">CAR :</span> {compteur.car_mwh} MWh</p>}
                {compteur.profil_consommation && <p><span className="text-navy-400">Profil :</span> {compteur.profil_consommation}</p>}
                {compteur.zone_tarifaire && <p><span className="text-navy-400">Zone tarifaire :</span> {compteur.zone_tarifaire}</p>}
                <p className="text-xs text-navy-400">
                  {compteur.synchro_eneo
                    ? `Synchronisé le ${compteur.date_derniere_synchro_eneo ? new Date(compteur.date_derniere_synchro_eneo).toLocaleDateString('fr-FR') : '—'}`
                    : 'Jamais synchronisé'}
                </p>
                <HistoriqueDiscret tableNom="compteurs" ligneId={compteur.id} />
              </CardContent>
            </Card>

            <Card className="p-4 sm:p-6">
              <CardHeader className="flex-row items-center justify-between px-0 pt-0">
                <CardTitle>Historique de consommation</CardTitle>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowAdd(true)}>
                  <Plus className="h-3.5 w-3.5" /> Ajouter
                </Button>
              </CardHeader>
              <CardContent className="px-0 space-y-2">
                {consommationsDuCompteur.length === 0 && <p className="text-sm text-navy-400">Aucune période enregistrée.</p>}
                {consommationsDuCompteur.map((c) => (
                  <div key={c.id} className="rounded-lg border border-navy-100 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-navy-800">
                        {new Date(c.date_debut_periode).toLocaleDateString('fr-FR')} → {new Date(c.date_fin_periode).toLocaleDateString('fr-FR')}
                      </span>
                      <span className="font-semibold text-navy-800">{c.quantite} {c.unite}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-navy-500">
                      <Badge tone="neutral">{c.poste_tarifaire}</Badge>
                      <Badge tone={c.type_valeur === 'MESUREE' ? 'kiwi' : 'amber'}>{c.type_valeur}</Badge>
                      {c.source && <span>{c.source}</span>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
      {compteur && <AddConsommationDialog compteurId={compteur.id} open={showAdd} onClose={() => setShowAdd(false)} />}
    </div>
  )
}
