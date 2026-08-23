import { useMemo, useState } from 'react'
import { Plus, Euro, AlertTriangle } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select, Textarea } from '@/components/ui/form'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { EntityLink } from '@/components/ui/entity-link'
import {
  useRemunerations,
  useCreerRemuneration,
  useMajRemuneration,
  STATUTS_REMUNERATION,
} from '@/lib/data/remunerations'
import { useComptes } from '@/lib/data/comptes'
import { useContrats } from '@/lib/data/contrats'
import { cn } from '@/lib/utils'
import type { Remuneration } from '@/types/domain'

/**
 * Les rémunérations : le bout de la chaîne.
 *
 * Mémo de Michel, 23/08/2026 : « Contrat via KiWee → Recommandation acceptée → Rémunération. Contrat
 * hors KiWee → Recommandation acceptée mais pas de rémunération KiWee, sauf exception. »
 *
 * CE QUE L'ÉCRAN SURVEILLE : l'écart entre l'attendu et le perçu. Une commission annoncée qui
 * n'arrive pas, ou qui arrive pour un autre montant, est le seul fait qui demande une action — le
 * reste n'est que de l'archive.
 *
 * PAS DE MAQUETTE pour cet écran : il s'en tient au mémo.
 */

const TON_STATUT: Record<string, 'kiwi' | 'amber' | 'neutral'> = {
  ATTENDUE: 'amber',
  FACTUREE: 'amber',
  PERCUE: 'kiwi',
  ANNULEE: 'neutral',
}

const euros = (v: number | null) =>
  v == null ? '—' : `${Math.round(v).toLocaleString('fr-FR')} €`

export default function Remunerations() {
  const { data: remunerations } = useRemunerations()
  const maj = useMajRemuneration()
  const [recherche, setRecherche] = useState('')
  const [creation, setCreation] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  function signaler(m: string) {
    setToast(m)
    setTimeout(() => setToast(null), 2600)
  }

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return (remunerations ?? []).filter((r) => !q || [r.compte_nom, r.fournisseur_nom, r.reference]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
  }, [remunerations, recherche])

  // Les trois totaux qui résument la situation. Le troisième est le seul qui demande une action.
  const totaux = useMemo(() => {
    const vivantes = filtrees.filter((r) => r.statut !== 'ANNULEE')
    const attendu = vivantes.reduce((t, r) => t + (r.montant_attendu_ht ?? 0), 0)
    const percu = vivantes.reduce((t, r) => t + (r.montant_percu_ht ?? 0), 0)
    const enRetard = vivantes.filter((r) =>
      r.statut !== 'PERCUE' && r.date_attendue && new Date(r.date_attendue) < new Date())
    return { attendu, percu, enRetard }
  }, [filtrees])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar title="Rémunérations" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
        <PageHeader
          title="Rémunérations"
          description="Ce que Kiwee attend et ce qu'elle a perçu. L'écart entre les deux est le suivi."
          actions={
            <Button size="sm" onClick={() => setCreation(true)}>
              <Plus className="h-3.5 w-3.5" /> Nouvelle rémunération
            </Button>
          }
        />

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Tuile libelle="Attendu" valeur={euros(totaux.attendu)} />
          <Tuile libelle="Perçu" valeur={euros(totaux.percu)} accent="kiwi" />
          <Tuile
            libelle="En retard"
            valeur={`${totaux.enRetard.length} ligne${totaux.enRetard.length > 1 ? 's' : ''}`}
            accent={totaux.enRetard.length > 0 ? 'rouge' : undefined}
            detail={totaux.enRetard.length > 0
              ? euros(totaux.enRetard.reduce((t, r) => t + (r.montant_attendu_ht ?? 0), 0))
              : undefined}
          />
        </div>

        <ListToolbar query={recherche} onQueryChange={setRecherche} placeholder="Compte, fournisseur…" count={filtrees.length} />

        {filtrees.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 p-8 text-center">
            <Euro className="h-6 w-6 text-navy-300" />
            <p className="text-sm font-medium text-navy-700">Aucune rémunération</p>
            <p className="max-w-md text-xs text-navy-400">
              Une rémunération naît d'un contrat signé via Kiwee. Un contrat signé hors Kiwee n'en
              produit pas, sauf exception — et l'exception se justifie.
            </p>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-xl border border-navy-100 bg-white">
            {filtrees.map((r) => (
              <LigneRemuneration
                key={r.id}
                remuneration={r}
                onStatut={async (statut) => {
                  try {
                    await maj.mutateAsync({
                      id: r.id,
                      patch: {
                        statut,
                        ...(statut === 'PERCUE' && !r.date_perception
                          ? { date_perception: new Date().toISOString().slice(0, 10) }
                          : {}),
                      },
                    })
                    signaler('✓ Statut mis à jour')
                  } catch (e) {
                    signaler(e instanceof Error ? e.message : 'Enregistrement impossible')
                  }
                }}
                onPercu={async (montant) => {
                  try {
                    await maj.mutateAsync({ id: r.id, patch: { montant_percu_ht: montant } })
                    signaler('✓ Montant perçu enregistré')
                  } catch (e) {
                    signaler(e instanceof Error ? e.message : 'Enregistrement impossible')
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {creation && <DialogCreation onFermer={() => setCreation(false)} signaler={signaler} />}

      {toast && (
        <div className="fixed bottom-[70px] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-800 px-4 py-2.5 text-xs font-semibold text-white shadow-lg lg:bottom-6">
          {toast}
        </div>
      )}
    </div>
  )
}

function Tuile({ libelle, valeur, detail, accent }: {
  libelle: string
  valeur: string
  detail?: string
  accent?: 'kiwi' | 'rouge'
}) {
  return (
    <Card className={cn(
      'p-3.5',
      accent === 'kiwi' && 'border-kiwi-200 bg-kiwi-50/60',
      accent === 'rouge' && 'border-red-200 bg-red-50',
    )}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-navy-400">{libelle}</p>
      <p className={cn(
        'mt-0.5 font-mono text-lg font-extrabold tabular-nums',
        accent === 'rouge' ? 'text-red-700' : accent === 'kiwi' ? 'text-kiwi-700' : 'text-navy-800',
      )}>
        {valeur}
      </p>
      {detail && <p className="text-[10.5px] text-navy-500">{detail} en attente</p>}
    </Card>
  )
}

function LigneRemuneration({ remuneration: r, onStatut, onPercu }: {
  remuneration: Remuneration
  onStatut: (statut: string) => void
  onPercu: (montant: number | null) => void
}) {
  const [percu, setPercu] = useState(r.montant_percu_ht == null ? '' : String(r.montant_percu_ht))
  const enRetard = r.statut !== 'PERCUE' && r.date_attendue && new Date(r.date_attendue) < new Date()
  // L'ÉCART EST LE SUIVI : un perçu qui diffère de l'attendu se voit, plutôt que de se deviner en
  // comparant deux colonnes.
  const ecart = r.montant_attendu_ht != null && r.montant_percu_ht != null
    ? r.montant_percu_ht - r.montant_attendu_ht
    : null

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-navy-50 px-4 py-3 last:border-b-0">
      <div className="min-w-[180px] flex-1">
        <p className="truncate text-sm font-medium text-navy-800">
          {r.compte_id ? <EntityLink to={`/comptes/${r.compte_id}`}>{r.compte_nom}</EntityLink> : 'Compte non rattaché'}
        </p>
        <p className="truncate text-xs text-navy-500">
          {[r.fournisseur_nom || null, r.reference].filter(Boolean).join(' · ') || '—'}
          {r.hors_kiwee && ' · hors Kiwee'}
        </p>
      </div>

      <div className="min-w-[96px] text-right">
        <p className="text-[10px] uppercase tracking-wide text-navy-400">Attendu</p>
        <p className="font-mono text-sm font-bold tabular-nums text-navy-800">{euros(r.montant_attendu_ht)}</p>
        {r.date_attendue && (
          <p className={cn('text-[10px]', enRetard ? 'font-semibold text-red-600' : 'text-navy-400')}>
            {new Date(r.date_attendue).toLocaleDateString('fr-FR')}
          </p>
        )}
      </div>

      <div className="min-w-[110px]">
        <p className="text-[10px] uppercase tracking-wide text-navy-400">Perçu</p>
        <Input
          value={percu}
          onChange={(e) => setPercu(e.target.value)}
          onBlur={() => {
            const v = percu.trim() === '' ? null : Number(percu.replace(',', '.'))
            if (v !== r.montant_percu_ht && (v == null || Number.isFinite(v))) onPercu(v)
          }}
          placeholder="—"
          className="h-8 text-right font-mono text-sm"
        />
      </div>

      {ecart != null && Math.abs(ecart) >= 1 && (
        <Badge tone={ecart > 0 ? 'kiwi' : 'amber'}>
          {ecart > 0 ? '+' : '−'}{Math.abs(Math.round(ecart)).toLocaleString('fr-FR')} €
        </Badge>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {STATUTS_REMUNERATION.map((s) => (
          <button
            key={s.code}
            type="button"
            onClick={() => onStatut(s.code)}
            className={cn(
              'rounded-lg border px-2 py-0.5 text-[10.5px] font-semibold transition-colors',
              r.statut === s.code
                ? `border-transparent ${s.code === 'PERCUE' ? 'bg-kiwi-600 text-white' : 'bg-navy-800 text-white'}`
                : 'border-navy-200 text-navy-500 hover:bg-navy-50',
            )}
          >
            {s.libelle}
          </button>
        ))}
      </div>
      {r.statut && <Badge tone={TON_STATUT[r.statut] ?? 'neutral'}>{r.statut.toLowerCase()}</Badge>}
    </div>
  )
}

function DialogCreation({ onFermer, signaler }: { onFermer: () => void; signaler: (m: string) => void }) {
  const { data: comptes } = useComptes()
  const { data: contrats } = useContrats()
  const creer = useCreerRemuneration()
  const [compteId, setCompteId] = useState('')
  const [contratId, setContratId] = useState('')
  const [montant, setMontant] = useState('')
  const [dateAttendue, setDateAttendue] = useState('')
  const [horsKiwee, setHorsKiwee] = useState(false)
  const [motif, setMotif] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  const contratsDuCompte = useMemo(
    () => (contrats ?? []).filter((c) => !compteId || c.compte_id === compteId),
    [contrats, compteId],
  )
  const contratChoisi = contratsDuCompte.find((c) => c.id === contratId)

  return (
    <Dialog open onClose={onFermer} title="Nouvelle rémunération" description="Ce que Kiwee attend d'un contrat signé.">
      <div className="space-y-3">
        <FormField label="Compte">
          <Select value={compteId} onChange={(e) => { setCompteId(e.target.value); setContratId('') }}>
            <option value="">Choisir…</option>
            {[...(comptes ?? [])].sort((a, b) => a.nom.localeCompare(b.nom))
              .map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </Select>
        </FormField>
        <FormField label="Contrat">
          <Select value={contratId} onChange={(e) => setContratId(e.target.value)} disabled={!compteId}>
            <option value="">{compteId ? 'Non rattachée à un contrat' : 'Choisir un compte d’abord'}</option>
            {contratsDuCompte.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fournisseur_nom} — {c.site_nom}
                {c.date_debut ? ` (${new Date(c.date_debut).toLocaleDateString('fr-FR')})` : ''}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Montant attendu HT">
          <Input value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="0" className="text-right font-mono" />
        </FormField>
        <FormField label="Date attendue">
          <input
            type="date"
            value={dateAttendue}
            onChange={(e) => setDateAttendue(e.target.value)}
            className="w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm outline-none focus:border-kiwi-500"
          />
        </FormField>

        {/* L'EXCEPTION SE JUSTIFIE. « Contrat hors KiWee → pas de rémunération KiWee, sauf
            exception » : cocher la case oblige donc à dire laquelle. */}
        <label className="flex items-start gap-2 rounded-lg bg-navy-50/60 px-3 py-2 text-xs text-navy-700">
          <input type="checkbox" checked={horsKiwee} onChange={(e) => setHorsKiwee(e.target.checked)} className="mt-0.5" />
          <span>
            Contrat signé hors Kiwee
            <span className="block text-[10.5px] text-navy-400">
              Normalement sans rémunération : cochez seulement s'il y a une exception.
            </span>
          </span>
        </label>
        {horsKiwee && (
          <FormField label="Motif de l’exception">
            <Textarea value={motif} onChange={(e) => setMotif(e.target.value)} rows={2} placeholder="Pourquoi une rémunération malgré tout…" />
          </FormField>
        )}

        {horsKiwee && !motif.trim() && (
          <p className="flex items-start gap-1.5 text-[10.5px] leading-snug text-amber-700">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
            Sans motif, l'exception ne se justifie pas — et personne ne saura pourquoi cette ligne existe.
          </p>
        )}

        {erreur && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{erreur}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onFermer}>Annuler</Button>
          <Button
            type="button"
            disabled={creer.isPending || (horsKiwee && !motif.trim())}
            onClick={async () => {
              setErreur(null)
              const v = montant.trim() === '' ? null : Number(montant.replace(',', '.'))
              try {
                await creer.mutateAsync({
                  compte_id: compteId || null,
                  contrat_id: contratId || null,
                  recommandation_id: null,
                  fournisseur_compte_id: contratChoisi?.fournisseur_compte_id ?? null,
                  montant_attendu_ht: v != null && Number.isFinite(v) ? v : null,
                  date_attendue: dateAttendue || null,
                  hors_kiwee: horsKiwee,
                  motif_exception: horsKiwee ? motif.trim() : null,
                })
                onFermer()
                signaler('✓ Rémunération créée')
              } catch (e) {
                setErreur(e instanceof Error ? e.message : 'Création impossible')
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
