import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { InlineField } from '@/components/ui/inline-field'
import { majConditionsFournisseur, type ConditionsFournisseur } from '@/lib/data/comptes'
import { useEligibilityRules, type EligibilityRule } from '@/lib/data/eligibilityRules'
import type { Compte } from '@/types/domain'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * L'ONGLET PRICING D'UN COMPTE FOURNISSEUR — ce qui décide s'il est consulté
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 05/10/2026 : « Quand je fais une version, les fournisseurs sont évalués un à un pour
 * savoir s'ils sont éligibles ou non […] quand je vais sur un compte fournisseur comme GAZ EUROPEEN,
 * je ne vois aucun champ qui mentionne la date de fourniture maximale. » Ce sont les DOUZE champs
 * que lit le moteur d'éligibilité (`lib/eligibility.ts`), dans l'ordre de ses règles
 * (`eligibility_rules`). Six seulement étaient affichés, dans le bloc « Détails » ; trois portaient
 * un nom trompeur (« Profils électricité » pour les segments, « Profils gaz » pour les tarifs).
 *
 * SOUS CHAQUE CHAMP, LA RÈGLE QUI LE LIT : son nom, si elle est active, et ce que vaut un champ vide
 * — tantôt « pas de limite », tantôt « le fournisseur est écarté ». Un critère vide n'est pas neutre :
 * le cacher reviendrait à cacher la cause d'un refus.
 *
 * LES LISTES À VOCABULAIRE CONNU SE CHOISISSENT EN PASTILLES, d'un clic, et s'enregistrent aussitôt :
 * une faute de frappe (« Gaz naturel » au lieu de « Gaz Naturel ») écarte le fournisseur sans bruit.
 * Les valeurs inconnues déjà en base restent affichées et retirables.
 */

const ENERGIES = ['Électricité', 'Gaz Naturel']
const CIBLES = ['Entreprise', 'Syndic professionnel', 'Syndic non professionnel']
const TARIFS_GAZ = ['T1', 'T2', 'T3', 'T4', 'TP']
const PROFILS_GAZ = ['P011', 'P012', 'P013', 'P014', 'P015', 'P016', 'P017', 'P018', 'P019']
const SEGMENTS_ELEC = ['C1', 'C2', 'C3', 'C4', 'C5']
const PARTENARIATS = [
  { value: 'kiwee', label: 'Kiwee (en direct)' },
  { value: 'intermediaire', label: 'Intermédiaire' },
  { value: 'aucun', label: 'Aucun' },
]

/** Ce que dit un champ vide, règle par règle (`lib/eligibility.ts`). */
const VIDE: Record<string, string> = {
  partnership: 'Vide ou « Aucun » : le fournisseur est écarté.',
  target: 'Vide : le fournisseur est écarté.',
  score_ellipro: 'Vide : pas de note minimale.',
  energy: 'Vide : le fournisseur est écarté.',
  ddf: 'Vide : pas de limite.',
  tariff: 'Vide : le fournisseur est écarté (compteurs gaz).',
  profile: 'Lu par la règle, mais pas encore vérifié par le moteur.',
  segment: 'Vide : le fournisseur est écarté (compteurs électricité).',
  consumption: 'Vide : pas de limite.',
  dff: 'Vide : pas de limite.',
  response_delay: 'Vide : le fournisseur est écarté (première demande).',
  update_delay: 'Vide : le fournisseur est écarté (actualisation).',
}

export function OngletPricingFournisseur({ compte, modifiable, onToast }: { compte: Compte; modifiable: boolean; onToast: (m: string) => void }) {
  const queryClient = useQueryClient()
  const { data: regles } = useEligibilityRules()
  const regle = (cle: string) => regles?.find((r) => r.rule_key === cle)

  const enregistrer = async (c: ConditionsFournisseur, message: string) => {
    await majConditionsFournisseur(compte.id, c)
    void queryClient.invalidateQueries({ queryKey: ['comptes'] })
    onToast(message)
  }
  const erreur = (e: Error) => onToast(`Erreur : ${e.message}`)
  const nombre = (cle: keyof ConditionsFournisseur, libelle: string, unite: string) => (v: number | null) =>
    enregistrer({ [cle]: v } as ConditionsFournisseur, v == null ? `✓ ${libelle} retiré(e)` : `✓ ${libelle} : ${v}${unite ? ` ${unite}` : ''}`)
  const date = (cle: keyof ConditionsFournisseur, libelle: string) => (v: string | null) =>
    enregistrer({ [cle]: v || null } as ConditionsFournisseur, v ? `✓ ${libelle} : ${new Date(`${v}T12:00:00`).toLocaleDateString('fr-FR')}` : `✓ ${libelle} retirée`)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] leading-relaxed text-km-muted">
        À chaque version, Kimatch vérifie ces critères pour proposer — ou écarter — ce fournisseur. Sous chaque champ, la règle qui le lit et ce que vaut un champ vide.
      </p>

      <Section titre="Partenariat et clients">
        <Champ libelle="Partenariat" regle={regle('partnership')} cle="partnership">
          <InlineField
            variant="select"
            label=""
            emptyLabel="non renseigné"
            options={PARTENARIATS}
            value={compte.partnership ?? ''}
            disabled={!modifiable}
            onCommit={(v) => enregistrer({ partnership: v || null }, '✓ Partenariat enregistré')}
            onSaved={() => undefined}
            onError={erreur}
          />
        </Champ>
        <Champ libelle="Intermédiaire" note="Pour information : Energix, OBD…">
          <InlineField variant="text" label="" emptyLabel="aucun" value={compte.intermediary ?? ''} disabled={!modifiable}
            onCommit={(v) => enregistrer({ intermediary: v.trim() || null }, '✓ Intermédiaire enregistré')} onSaved={() => undefined} onError={erreur} />
        </Champ>
        <Champ libelle="Clients acceptés" regle={regle('target')} cle="target">
          <Pastilles options={CIBLES} valeurs={compte.targets ?? []} modifiable={modifiable}
            onChange={(v) => enregistrer({ targets: v }, '✓ Clients acceptés enregistrés').catch(erreur)} />
        </Champ>
        <Champ libelle="Note Ellisphere minimale" regle={regle('score_ellipro')} cle="score_ellipro">
          <InlineField variant="number" label="" emptyLabel="aucune" unit="" value={compte.min_ellipro_score ?? compte.limite_ellipro ?? null} disabled={!modifiable}
            onCommit={nombre('min_ellipro_score', 'Note minimale', '')} onSaved={() => undefined} onError={erreur} />
        </Champ>
      </Section>

      <Section titre="Énergies et compteurs">
        <Champ libelle="Énergies fournies" regle={regle('energy')} cle="energy">
          <Pastilles options={ENERGIES} valeurs={compte.energy_types ?? []} modifiable={modifiable}
            onChange={(v) => enregistrer({ energy_types: v }, '✓ Énergies enregistrées').catch(erreur)} />
        </Champ>
        <Champ libelle="Tarifs gaz" regle={regle('tariff')} cle="tariff">
          <Pastilles options={TARIFS_GAZ} valeurs={compte.tariffs ?? []} modifiable={modifiable} mono
            onChange={(v) => enregistrer({ tariffs: v }, '✓ Tarifs gaz enregistrés').catch(erreur)} />
        </Champ>
        <Champ libelle="Profils gaz" regle={regle('profile')} cle="profile">
          <Pastilles options={PROFILS_GAZ} valeurs={compte.profiles ?? []} modifiable={modifiable} mono
            onChange={(v) => enregistrer({ profiles: v }, '✓ Profils gaz enregistrés').catch(erreur)} />
        </Champ>
        <Champ libelle="Segments électricité" regle={regle('segment')} cle="segment">
          <Pastilles options={SEGMENTS_ELEC} valeurs={compte.segments ?? []} modifiable={modifiable} mono
            onChange={(v) => enregistrer({ segments: v }, '✓ Segments électricité enregistrés').catch(erreur)} />
        </Champ>
        <Champ libelle="Consommation annuelle" regle={regle('consumption')} cle="consumption">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5 text-km-faint">min.
              <InlineField variant="number" label="" emptyLabel="aucun" unit="MWh" value={compte.min_consumption ?? null} disabled={!modifiable}
                onCommit={nombre('min_consumption', 'Minimum', 'MWh')} onSaved={() => undefined} onError={erreur} />
            </span>
            <span className="flex items-center gap-1.5 text-km-faint">max.
              <InlineField variant="number" label="" emptyLabel="aucun" unit="MWh" value={compte.max_consumption ?? null} disabled={!modifiable}
                onCommit={nombre('max_consumption', 'Maximum', 'MWh')} onSaved={() => undefined} onError={erreur} />
            </span>
          </span>
        </Champ>
      </Section>

      <Section titre="Dates de fourniture">
        <Champ libelle="Début de fourniture au plus tard" regle={regle('ddf')} cle="ddf" note="Le lendemain de l'échéance du compteur doit tomber avant cette date.">
          <InlineField variant="date" label="" emptyLabel="aucune limite" value={compte.max_ddf ?? null} disabled={!modifiable}
            onCommit={date('max_ddf', 'Début de fourniture max.')} onSaved={() => undefined} onError={erreur} />
        </Champ>
        <Champ libelle="Fin de fourniture au plus tard" regle={regle('dff')} cle="dff" note="Au moins une durée demandée doit finir avant cette date.">
          <InlineField variant="date" label="" emptyLabel="aucune limite" value={compte.max_dff ?? null} disabled={!modifiable}
            onCommit={date('max_dff', 'Fin de fourniture max.')} onSaved={() => undefined} onError={erreur} />
        </Champ>
      </Section>

      <Section titre="Délais">
        <Champ libelle="Délai de réponse" regle={regle('response_delay')} cle="response_delay" note="En jours ouvrés, pour une première demande.">
          <InlineField variant="number" label="" emptyLabel="non renseigné" unit="j" value={compte.response_delay_days ?? null} disabled={!modifiable}
            onCommit={nombre('response_delay_days', 'Délai de réponse', 'j')} onSaved={() => undefined} onError={erreur} />
        </Champ>
        <Champ libelle="Délai d'actualisation" regle={regle('update_delay')} cle="update_delay" note="En jours ouvrés, pour actualiser les prix.">
          <InlineField variant="number" label="" emptyLabel="non renseigné" unit="j" value={compte.update_delay_days ?? null} disabled={!modifiable}
            onCommit={nombre('update_delay_days', "Délai d'actualisation", 'j')} onSaved={() => undefined} onError={erreur} />
        </Champ>
      </Section>
    </div>
  )
}

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-km-line bg-white">
      <h3 className="border-b border-km-line-soft px-4 py-2.5 text-km-xs font-bold uppercase tracking-wide text-km-faint">{titre}</h3>
      <div className="divide-y divide-km-line-soft">{children}</div>
    </section>
  )
}

function Champ({ libelle, regle, cle, note, children }: { libelle: string; regle?: EligibilityRule; cle?: string; note?: string; children: ReactNode }) {
  const condition = regle?.condition_field === 'energy'
    ? (regle.condition_operator === 'neq' ? 'compteurs électricité' : 'compteurs gaz')
    : regle?.condition_field === 'request_type'
      ? (regle.condition_operator === 'neq' ? 'actualisations' : 'premières demandes')
      : null
  return (
    <div className="grid gap-x-4 gap-y-1 px-4 py-3 text-km-body sm:grid-cols-[220px_minmax(0,1fr)]">
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold text-km-text">{libelle}</span>
        {regle ? (
          <span className={cn('text-[11px]', regle.is_active ? 'text-km-muted' : 'text-km-faint line-through')} title={regle.description ?? undefined}>
            Règle « {regle.name} » · {regle.is_active ? 'active' : 'inactive'}{condition ? ` · ${condition}` : ''}
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        {children}
        {(cle || note) && <span className="text-[11px] text-km-faint">{[note, cle ? VIDE[cle] : null].filter(Boolean).join(' ')}</span>}
      </div>
    </div>
  )
}

/** Un choix multiple en pastilles : un clic ajoute ou retire, et s'enregistre aussitôt. */
function Pastilles({ options, valeurs, modifiable, mono, onChange }: { options: string[]; valeurs: string[]; modifiable: boolean; mono?: boolean; onChange: (v: string[]) => void }) {
  /* L'état local suit le clic sans attendre la base ; les valeurs inconnues déjà en base restent. */
  const [choisies, setChoisies] = useState<string[] | null>(null)
  const actuelles = choisies ?? valeurs
  const toutes = [...options, ...actuelles.filter((v) => !options.includes(v))]
  const basculer = (o: string) => {
    if (!modifiable) return
    const suivantes = actuelles.includes(o) ? actuelles.filter((x) => x !== o) : [...actuelles, o]
    setChoisies(suivantes)
    onChange(suivantes)
  }
  return (
    <span className="flex flex-wrap gap-1.5">
      {toutes.map((o) => {
        const oui = actuelles.includes(o)
        return (
          <button
            key={o}
            type="button"
            onClick={() => basculer(o)}
            disabled={!modifiable}
            aria-pressed={oui}
            className={cn(
              'inline-flex h-[26px] items-center gap-1 rounded-full border px-2.5 text-[12px] font-semibold transition-colors disabled:cursor-default',
              mono && 'font-mono',
              oui ? 'border-km-green bg-km-green-soft text-km-green' : 'border-km-line bg-white text-km-faint hover:border-km-green hover:text-km-green',
            )}
          >
            {oui && <Check className="h-3 w-3" strokeWidth={3} />}
            {o}
          </button>
        )
      })}
    </span>
  )
}
