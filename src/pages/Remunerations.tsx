import { useMemo, useState } from 'react'
import { Plus, Euro, AlertTriangle } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ChoixParRecherche } from '@/components/ui/choix-recherche'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Textarea } from '@/components/ui/form'
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
            <Euro className="h-6 w-6 text-km-faint" />
            <p className="text-sm font-medium text-km-text">Aucune rémunération</p>
            <p className="max-w-md text-xs text-km-faint">
              Une rémunération naît d'un contrat signé via Kiwee. Un contrat signé hors Kiwee n'en
              produit pas, sauf exception — et l'exception se justifie.
            </p>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-xl border border-km-line bg-white">
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
    <div className={cn(
      'rounded-[13px] border bg-white px-3.5 py-3',
      accent === 'kiwi' ? 'border-kiwi-200 bg-kiwi-50/50' : accent === 'rouge' ? 'border-red-200 bg-km-red-soft' : 'border-km-line',
    )}>
      <p className="text-km-xs font-bold uppercase tracking-[0.08em] text-km-faint">{libelle}</p>
      <p className={cn(
        'mt-0.5 font-mono text-lg font-extrabold tabular-nums',
        accent === 'rouge' ? 'text-red-700' : accent === 'kiwi' ? 'text-km-green' : 'text-km-text',
      )}>
        {valeur}
      </p>
      {detail && <p className="text-km-xs text-km-muted">{detail} en attente</p>}
    </div>
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
    <div className={cn(
      'flex flex-wrap items-center gap-3 border-b border-km-line px-4 py-3 last:border-b-0',
      enRetard && 'bg-km-red-soft/40',
    )}>
      <div className="flex min-w-[180px] flex-1 items-start gap-2.5">
        <span
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
            r.statut === 'PERCUE' ? 'bg-kiwi-50 text-km-green' : enRetard ? 'bg-red-100 text-red-700' : 'bg-km-bg text-km-muted',
          )}
        >
          <Euro className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-km-text">
            {r.compte_id ? <EntityLink to={`/comptes/${r.compte_id}`}>{r.compte_nom}</EntityLink> : 'Compte non rattaché'}
          </p>
          <p className="truncate text-km-label text-km-muted">
            {r.reference && <span className="font-mono text-km-faint">{r.reference} · </span>}
            {r.fournisseur_nom || 'fournisseur non précisé'}
            {r.hors_kiwee && ' · hors Kiwee'}
          </p>
        </div>
      </div>

      <div className="min-w-[96px] text-right">
        <p className="text-km-xs uppercase tracking-wide text-km-faint">Attendu</p>
        <p className="font-mono text-sm font-bold tabular-nums text-km-text">{euros(r.montant_attendu_ht)}</p>
        {r.date_attendue && (
          <p className={cn('text-km-xs', enRetard ? 'font-semibold text-km-red' : 'text-km-faint')}>
            {new Date(r.date_attendue).toLocaleDateString('fr-FR')}
          </p>
        )}
      </div>

      <div className="min-w-[110px]">
        <p className="text-km-xs uppercase tracking-wide text-km-faint">Perçu</p>
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
              'rounded-lg border px-2 py-0.5 text-km-xs font-semibold transition-colors',
              r.statut === s.code
                ? `border-transparent ${s.code === 'PERCUE' ? 'bg-km-green text-white' : 'bg-navy-800 text-white'}`
                : 'border-km-line text-km-muted hover:bg-km-bg',
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
  const [parCompte, setParCompte] = useState(false)
  const [motif, setMotif] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  const contratChoisi = (contrats ?? []).find((c) => c.id === contratId)

  return (
    <Dialog open onClose={onFermer} title="Nouvelle rémunération" description="Ce que Kiwee attend d'un contrat signé.">
      <div className="space-y-3">
        {/* LE CONTRAT COMMANDE, LE COMPTE SUIT.
            « Une rémunération naît d'un contrat signé via Kiwee » : le contrat est donc l'entrée
            naturelle, et il connaît déjà son compte. Deux listes déroulantes de 2 765 et 1 601
            options (mesuré à l'écran le 23/08/2026) deviennent une recherche. */}
        <FormField label="Contrat">
          <ChoixParRecherche
            items={contrats ?? []}
            valeur={contratId}
            onChoisir={(c) => { setContratId(c?.id ?? ''); setCompteId(c?.compte_id ?? '') }}
            placeholder="Compte, fournisseur ou site…"
            principal={(c) => `${c.fournisseur_nom || 'Fournisseur inconnu'} — ${c.site_nom}`}
            secondaire={(c) => c.compte_nom || null}
            filtre={(c, q) => [c.compte_nom, c.fournisseur_nom, c.site_nom, c.reference_fournisseur]
              .some((v) => (v ?? '').toLowerCase().includes(q))}
            aucun="Aucun contrat. Une rémunération peut aussi se rattacher au compte seul."
            totalLibelle={`${(contrats ?? []).length} contrats`}
          />
        </FormField>

        {/* SANS CONTRAT, LE COMPTE SUFFIT — mais on ne montre pas deux recherches d'emblée.
            Le cas existe : un contrat signé hors Kiwee n'est pas forcément enregistré ici, et la
            rémunération d'exception doit quand même se rattacher à quelque chose. Il est donc
            proposé en un mot plutôt qu'affiché en permanence. */}
        {!contratId && !parCompte && (
          <button
            type="button"
            onClick={() => setParCompte(true)}
            className="text-xs font-semibold text-km-green hover:underline"
          >
            Aucun contrat ici ? Rattacher au compte seul
          </button>
        )}
        {!contratId && parCompte && (
          <FormField label="Compte">
            <ChoixParRecherche
              items={comptes ?? []}
              valeur={compteId}
              onChoisir={(c) => setCompteId(c?.id ?? '')}
              placeholder="Nom du compte…"
              principal={(c) => c.nom}
              secondaire={(c) => c.ville || null}
              filtre={(c, q) => c.nom.toLowerCase().includes(q)}
              aucun="Aucun compte trouvé."
              totalLibelle={`${(comptes ?? []).length} comptes`}
            />
          </FormField>
        )}
        <FormField label="Montant attendu HT">
          <Input value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="0" className="text-right font-mono" />
        </FormField>
        <FormField label="Date attendue">
          <input
            type="date"
            value={dateAttendue}
            onChange={(e) => setDateAttendue(e.target.value)}
            className="w-full rounded-lg border border-km-line bg-white px-3 py-2 text-sm outline-none focus:border-km-green"
          />
        </FormField>

        {/* L'EXCEPTION SE JUSTIFIE. « Contrat hors KiWee → pas de rémunération KiWee, sauf
            exception » : cocher la case oblige donc à dire laquelle. */}
        <label className="flex items-start gap-2 rounded-lg bg-km-bg/60 px-3 py-2 text-xs text-km-text">
          <input
            type="checkbox"
            checked={horsKiwee}
            onChange={(e) => { setHorsKiwee(e.target.checked); if (e.target.checked) setParCompte(true) }}
            className="mt-0.5"
          />
          <span>
            Contrat signé hors Kiwee
            <span className="block text-km-xs text-km-faint">
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
          <p className="flex items-start gap-1.5 text-km-xs leading-snug text-amber-700">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
            Sans motif, l'exception ne se justifie pas — et personne ne saura pourquoi cette ligne existe.
          </p>
        )}

        {erreur && <p className="rounded-lg border border-red-200 bg-km-red-soft px-3 py-2 text-xs text-red-700">{erreur}</p>}

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
