import { useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/form'
import { Tableau, TableauTete, TableauCorps } from '@/components/ui/tableau'
import { appelerBanc, type ReponseBanc } from '@/lib/data/tradeo'
import { Aide, ReponseBrute, Verdict } from './commun'
import { LIBELLE_STATUT_COMPTEUR } from '@/lib/tradeo/outils'

/**
 * ÉTAPE 2 — SUIVRE LES DEMANDES DÉPOSÉES.
 *
 * L'acceptation des compteurs se fait CHEZ TRADEO, par des personnes : ce n'est pas instantané. Le
 * banc relit donc la liste à la demande, et montre le statut de chaque compteur tel que Tradeo le
 * rend — c'est lui qui décide si l'étape 3 est possible.
 */

interface DemandeTradeo {
  id: number
  type?: string
  date_ajout?: string
  societe?: { siret?: string; raison?: string }
  compteurs?: { id: number; status?: number; objetConsommation?: { numCompteur?: string; parametreCompteur?: string } }[]
  files?: { id: number; type: string }[]
}

export function EtapeSuivre({ onCalculer }: { onCalculer: (siret: string, energie: 'ELEC' | 'GAZ') => void }) {
  const [page, setPage] = useState(1)
  const [recherche, setRecherche] = useState('')
  const [reponse, setReponse] = useState<ReponseBanc | null>(null)
  const [chargement, setChargement] = useState(false)
  const [validations, setValidations] = useState<Record<number, ReponseBanc>>({})

  async function charger(p = page) {
    setChargement(true)
    const r = await appelerBanc('mes_demandes', {
      pageNumber: p,
      dataTable: { statusFilter: '', sortBy: null, draw: 1, length: 20, search: recherche, column: 0, dir: 'desc' },
    })
    setReponse(r)
    setChargement(false)
  }

  useEffect(() => {
    void charger(1)
    // Une seule lecture à l'ouverture ; la suite est à la main, chaque appel part chez Tradeo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const corps = reponse?.reponse as { demandesCotations?: DemandeTradeo[]; pagination?: { currentPage: number; totalPages: number; totalItems: number } } | undefined
  const demandes = corps?.demandesCotations ?? []
  const pagination = corps?.pagination

  async function valider(id: number) {
    const r = await appelerBanc('demander_validation', { id_demande: id })
    setValidations((v) => ({ ...v, [id]: r }))
  }

  return (
    <div>
      <Aide>
        Les demandes déposées sous le compte API de KiWee chez Tradeo, avec le statut de chaque compteur. Seuls les
        compteurs <strong>acceptés</strong> peuvent être calculés.
      </Aide>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input className="max-w-[320px]" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="SIRET, raison sociale, PDL…"
          onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); void charger(1) } }} />
        <Button onClick={() => { setPage(1); void charger(1) }} disabled={chargement}>
          {chargement ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Relire chez Tradeo
        </Button>
        {pagination && <span className="text-km-label text-km-muted">{pagination.totalItems} demande(s)</span>}
      </div>

      {reponse && !reponse.ok && <Verdict reponse={reponse} succes="" />}

      {demandes.length > 0 && (
        <Tableau minWidth={820}>
          <TableauTete>
            <tr><th>N°</th><th>Société</th><th>Énergie</th><th>Compteurs</th><th>Fichiers</th><th>Déposée le</th><th /></tr>
          </TableauTete>
          <TableauCorps>
            {demandes.map((d) => {
              const acceptes = (d.compteurs ?? []).filter((c) => c.status === 1).length
              return (
                <tr key={d.id}>
                  <td className="font-mono">{d.id}</td>
                  <td>
                    <p className="font-semibold">{d.societe?.raison ?? '—'}</p>
                    <p className="font-mono text-km-label text-km-muted">{d.societe?.siret}</p>
                  </td>
                  <td>{d.type ?? '—'}</td>
                  <td>
                    <div className="flex flex-col gap-1">
                      {(d.compteurs ?? []).map((c) => {
                        const s = c.status !== undefined ? LIBELLE_STATUT_COMPTEUR[c.status] : undefined
                        return (
                          <span key={c.id} className="flex items-center gap-1.5">
                            <span className="font-mono text-km-label">{c.objetConsommation?.numCompteur ?? `#${c.id}`}</span>
                            <Badge tone={s?.tone ?? 'neutral'}>{s?.libelle ?? (c.status === undefined ? 'statut non rendu' : `statut ${c.status}`)}</Badge>
                          </span>
                        )
                      })}
                    </div>
                  </td>
                  <td className="text-km-label text-km-muted">{(d.files ?? []).map((f) => f.type).join(', ') || 'aucun'}</td>
                  <td className="text-km-label text-km-muted">{d.date_ajout ? new Date(d.date_ajout).toLocaleDateString('fr-FR') : '—'}</td>
                  <td>
                    <div className="flex flex-col items-end gap-1">
                      <Button size="sm" disabled={acceptes === 0 || !d.societe?.siret}
                        onClick={() => onCalculer(d.societe!.siret!, d.type === 'GAZ' ? 'GAZ' : 'ELEC')}>
                        Calculer →
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void valider(d.id)}>Demander la validation</Button>
                      {validations[d.id] && (
                        <span className={validations[d.id].ok ? 'text-km-label text-km-green' : 'text-km-label text-km-red'}>
                          {validations[d.id].ok ? 'Demandée' : String((validations[d.id].reponse as { message?: string })?.message ?? validations[d.id].message ?? 'Échec')}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </TableauCorps>
        </Tableau>
      )}
      {reponse?.ok && demandes.length === 0 && <p className="text-km-muted">Aucune demande chez Tradeo pour ce compte.</p>}

      {pagination && pagination.totalPages > 1 && (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" disabled={page <= 1} onClick={() => { setPage(page - 1); void charger(page - 1) }}>Précédente</Button>
          <span className="text-km-label text-km-muted">Page {pagination.currentPage} / {pagination.totalPages}</span>
          <Button size="sm" disabled={page >= pagination.totalPages} onClick={() => { setPage(page + 1); void charger(page + 1) }}>Suivante</Button>
        </div>
      )}

      <ReponseBrute reponse={reponse} />
    </div>
  )
}
