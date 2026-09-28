import { useMemo, useState } from 'react'
import { Calculator, CheckCircle2, FileText, Loader2, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Label, Select } from '@/components/ui/form'
import { Tableau, TableauTete, TableauCorps } from '@/components/ui/tableau'
import { PrixParCompteur } from '@/components/recommandation/PrixParCompteur'
import { DocumentComparatif } from '@/components/recommandation/DocumentComparatif'
import { useCompte } from '@/lib/data/comptes'
import {
  offresDeLaVersion,
  useCalculerVersion,
  useCircuitsFournisseurs,
  useMajDateDebutFourniture,
  useSiretCompte,
  useValiderVersion,
  type CompteRenduCalcul,
} from '@/lib/data/parcoursPrix'
import { etatDOffre, versionPrete, type EtatDOffre } from '@/lib/parcoursPrix/etatOffres'
import { calculerOffre, margeCiblee } from '@/lib/parcoursPrix/calcul'
import { MARGE_INCLUSE_DANS_LE_PRIX_TRADEO } from '@/lib/parcoursPrix/sourceTradeo'
import { cn } from '@/lib/utils'
import type { Compteur, Recommandation, VersionRecommandation } from '@/types/domain'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE PARCOURS DE PRIX D'UNE VERSION — À DÉPLACER TEL QUEL DANS LA FICHE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 28/09/2026 : « tout construire pour lui, afin qu'il ait juste à déplacer le composant ».
 * Il suit à la lettre le parcours de Michel du même jour :
 *
 *   1. la version : compteurs, date de début de fourniture, durée ;
 *   2. chaque offre « Prix disponible » ou « En attente pour le [date prévisionnelle] » ;
 *   3. « Calculer » : prix par API (Tradeo) ou par le processus prévu (la saisie), puis budgets ;
 *   4. les prix arrivent, les offres passent « Prix disponible », on relance ;
 *   5. tout est là : on valide la version et on génère le document.
 *
 * POUR L'INTÉGRER : `<ParcoursVersion reco={reco} version={version} compteurs={compteursDuPerimetre}
 * peutModifier={canManage} signaler={signaler} />` — ce sont exactement les objets que la fiche
 * recommandation a déjà en main. Aucune donnée n'est chargée deux fois sauf le circuit des
 * fournisseurs et le SIRET, que la fiche n'a pas.
 */
export function ParcoursVersion({
  reco,
  version,
  compteurs,
  peutModifier,
  signaler,
}: {
  reco: Recommandation
  version: VersionRecommandation
  /** Les compteurs de la recommandation (au moins ceux de la version). */
  compteurs: Compteur[]
  peutModifier: boolean
  signaler?: (message: string) => void
}) {
  const [message, setMessage] = useState<string | null>(null)
  const dire = signaler ?? setMessage
  const parId = useMemo(() => new Map(compteurs.map((c) => [c.id, c])), [compteurs])
  const offres = useMemo(() => offresDeLaVersion(version), [version])
  const { data: circuits } = useCircuitsFournisseurs(offres.map((o) => o.fournisseurCompteId).filter((x): x is string => Boolean(x)))
  const { data: siret } = useSiretCompte(reco.compte_id)
  const { data: compte } = useCompte(reco.compte_id)

  const etats = useMemo(
    () => new Map(offres.map((o) => [o.offre.id, etatDOffre(o.offre, version, parId, o.fournisseurCompteId ? circuits?.get(o.fournisseurCompteId) : undefined)])),
    [offres, version, parId, circuits],
  )

  // ── Le choix de marge de l'étape 3 ──
  const [modeMarge, setModeMarge] = useState<'garder' | 'unique' | 'ciblee'>('garder')
  const [marge, setMarge] = useState(3)
  const [cibleId, setCibleId] = useState<string>('')

  const calculs = useMemo(() => {
    const avant = new Map(offres.map((o) => [o.offre.id, calculerOffre(o.offre, version, parId)]))
    if (modeMarge === 'unique') {
      return { avant, apres: new Map(offres.map((o) => [o.offre.id, calculerOffre(o.offre, version, parId, marge)])), ajustements: null }
    }
    if (modeMarge === 'ciblee' && cibleId) {
      const ajustements = margeCiblee(offres.map((o) => ({ offre: o.offre, calcul: avant.get(o.offre.id)! })), cibleId, marge)
      const parOffre = new Map(ajustements.filter((a) => a.margeApres != null).map((a) => [a.offreId, a.margeApres as number]))
      return {
        avant,
        apres: new Map(offres.map((o) => [o.offre.id, parOffre.has(o.offre.id) ? calculerOffre(o.offre, version, parId, parOffre.get(o.offre.id)) : avant.get(o.offre.id)!])),
        ajustements,
      }
    }
    return { avant, apres: avant, ajustements: null }
  }, [offres, version, parId, modeMarge, marge, cibleId])

  const calculer = useCalculerVersion()
  const [compteRendu, setCompteRendu] = useState<CompteRenduCalcul | null>(null)
  async function lancerCalcul() {
    try {
      const margeParOffre = calculs.ajustements
        ? new Map(calculs.ajustements.filter((a) => a.margeApres != null && !a.impossible).map((a) => [a.offreId, a.margeApres as number]))
        : undefined
      const r = await calculer.mutateAsync({
        recommandationId: reco.id,
        versionId: version.id,
        compteurs,
        siret: siret ?? null,
        circuits: circuits ?? new Map(),
        margeParOffre,
        margeUnique: modeMarge === 'unique' ? marge : null,
      })
      setCompteRendu(r)
      setModeMarge('garder')
      dire(`✓ Calcul fait : ${r.lignesEcrites} ligne(s) écrite(s), ${r.offresDisponibles} offre(s) au prix disponible.`)
    } catch (e) {
      dire(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const listeEtats = [...etats.values()]
  const prete = versionPrete(listeEtats)
  const valider = useValiderVersion()
  const [documentOuvert, setDocumentOuvert] = useState(false)
  const estDisponible = version.statut === 'DISPONIBLE'
  const compter = (e: EtatDOffre['etat']) => listeEtats.filter((x) => x.etat === e).length

  return (
    <div className="space-y-5">
      {message && !signaler && <p className="rounded-km bg-km-soft px-3 py-2 text-km-body">{message}</p>}

      <Etapes
        actives={[
          true,
          offres.length > 0,
          compter('DISPONIBLE') > 0,
          compter('EN_ATTENTE') === 0 && offres.length > 0,
          estDisponible,
        ]}
      />

      <Cadrage version={version} parId={parId} peutModifier={peutModifier} dire={dire} />

      {/* ── 2 et 4 : l'état de chaque offre ── */}
      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h4 className="text-km-name font-semibold text-km-text">2. Les offres</h4>
          <Badge tone="green">{compter('DISPONIBLE')} prix disponible</Badge>
          <Badge tone="amber">{compter('EN_ATTENTE')} en attente</Badge>
          {compter('INDISPONIBLE') > 0 && <Badge tone="red">{compter('INDISPONIBLE')} refusée(s)</Badge>}
        </div>
        {offres.length === 0 ? (
          <p className="text-km-muted">Aucun fournisseur consulté sur cette version : il n’y a pas d’offre à suivre.</p>
        ) : (
          <Tableau minWidth={960}>
            <TableauTete>
              <tr><th>Fournisseur</th><th>Offre</th><th>État</th><th>Compteurs chiffrés</th><th>Marge €/MWh</th><th>Budget annuel HT</th><th /></tr>
            </TableauTete>
            <TableauCorps>
              {offres.map(({ offre, fournisseurCompteId }) => {
                const e = etats.get(offre.id)!
                const circuit = fournisseurCompteId ? circuits?.get(fournisseurCompteId) : undefined
                const avant = calculs.avant.get(offre.id)!
                const apres = calculs.apres.get(offre.id)!
                const margeActuelle = avant.lignes.find((l) => l.chiffre)?.marge ?? null
                const margeApres = apres.lignes.find((l) => l.chiffre)?.marge ?? null
                const change = apres.total != null && avant.total != null && Math.abs(apres.total - avant.total) > 0.005
                return (
                  <tr key={offre.id} className={cn(offre.id === cibleId && modeMarge === 'ciblee' && 'bg-km-green-soft/60')}>
                    <td>
                      <p className="font-semibold">{offre.fournisseur_nom}</p>
                      <p className="text-km-label text-km-muted">{circuit?.mode_reponse ?? 'mode non renseigné'}</p>
                    </td>
                    <td className="whitespace-nowrap">
                      {offre.duree_mois ? `${offre.duree_mois} mois` : '—'}{offre.type_prix ? ` · ${offre.type_prix}` : ''}
                      {offre.nature_offre === 'EN_COURS' && <Badge className="ml-1.5">en cours</Badge>}
                    </td>
                    <td><PastilleEtat etat={e} /></td>
                    <td className="tabular-nums">{e.chiffres} / {e.total}</td>
                    <td className="tabular-nums">
                      {nombre(margeActuelle)}
                      {modeMarge !== 'garder' && margeApres !== margeActuelle && <span className="text-km-green"> → {nombre(margeApres)}</span>}
                    </td>
                    <td className="tabular-nums">
                      {euros(avant.total)}
                      {change && <span className="block text-km-label text-km-green">→ {euros(apres.total)}</span>}
                    </td>
                    <td>
                      <PrixParCompteur offre={offre} version={version} compteurs={compteurs} peutModifier={peutModifier} signaler={dire} />
                    </td>
                  </tr>
                )
              })}
            </TableauCorps>
          </Tableau>
        )}
        <p className="mt-2 text-km-label text-km-muted">
          « Prix disponible » : chaque compteur de la version porte le prix du fournisseur (P0). Le bouton de la dernière
          colonne ouvre la saisie habituelle : c’est le « processus prévu » des fournisseurs sans API.
        </p>
      </section>

      {/* ── 3 : Calculer ── */}
      <section className="rounded-km border border-km-line p-3">
        <h4 className="mb-2 text-km-name font-semibold text-km-text">3. Calculer</h4>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="parcours-mode-marge">Marge</Label>
            <Select id="parcours-mode-marge" className="w-[260px]" value={modeMarge} onChange={(e) => setModeMarge(e.target.value as typeof modeMarge)}>
              <option value="garder">Garder la marge de chaque offre</option>
              <option value="unique">La même marge pour toutes</option>
              <option value="ciblee">Mettre une offre en avant</option>
            </Select>
          </div>
          {modeMarge !== 'garder' && (
            <div>
              <Label htmlFor="parcours-marge">Marge (€/MWh)</Label>
              <Input id="parcours-marge" type="number" step={0.5} min={0} className="w-[110px]" value={marge} onChange={(e) => setMarge(Number(e.target.value))} />
            </div>
          )}
          {modeMarge === 'ciblee' && (
            <div>
              <Label htmlFor="parcours-cible">Offre à faire passer</Label>
              <Select id="parcours-cible" className="w-[280px]" value={cibleId} onChange={(e) => setCibleId(e.target.value)}>
                <option value="">Choisir…</option>
                {offres.filter((o) => o.offre.nature_offre !== 'EN_COURS').map(({ offre }) => (
                  <option key={offre.id} value={offre.id}>{offre.fournisseur_nom} · {offre.duree_mois ?? '?'} mois{offre.type_prix ? ` · ${offre.type_prix}` : ''}</option>
                ))}
              </Select>
            </div>
          )}
          <Button variant="primary" disabled={!peutModifier || calculer.isPending || offres.length === 0} onClick={() => void lancerCalcul()}>
            {calculer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />} Calculer
          </Button>
        </div>
        {calculs.ajustements && (
          <ul className="mt-3 space-y-0.5 text-km-body">
            {calculs.ajustements.map((a) => {
              const o = offres.find((x) => x.offre.id === a.offreId)?.offre
              return (
                <li key={a.offreId} className={a.impossible ? 'text-km-amber' : undefined}>
                  <Target className="mr-1 inline h-3.5 w-3.5" />
                  {o?.fournisseur_nom} : marge {nombre(a.margeAvant)} → <strong>{nombre(a.margeApres)}</strong> €/MWh, budget {euros(a.totalApres)}
                  {a.impossible && ` — ${a.impossible}`}
                </li>
              )
            })}
          </ul>
        )}
        <p className="mt-2 text-km-label text-km-muted">
          Les fournisseurs en mode TRADEO sont interrogés par l’API, puis toutes les offres sont recalculées sur les prix en
          base, selon les règles de Michel du 19/08. On peut relancer autant de fois qu’on veut.
          {MARGE_INCLUSE_DANS_LE_PRIX_TRADEO === null && ' Tant que l’effet de la marge Tradeo n’a pas été mesuré, les prix Tradeo sont lus mais pas écrits.'}
        </p>
        {compteRendu && <CompteRendu r={compteRendu} offres={offres.map((o) => o.offre)} />}
      </section>

      {/* ── 5 : Valider et générer ── */}
      <section className="rounded-km border border-km-line p-3">
        <h4 className="mb-2 text-km-name font-semibold text-km-text">5. Valider la version et générer le document</h4>
        <p className="mb-2 text-km-body text-km-muted">
          {estDisponible
            ? 'La version est « Disponible ».'
            : prete
              ? 'Toutes les offres ont répondu : la version peut passer « Disponible ».'
              : `Encore ${compter('EN_ATTENTE')} offre(s) en attente : la validation attend qu’elles aient répondu.`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={!peutModifier || !prete || estDisponible || valider.isPending}
            onClick={() => valider.mutate(version.id, { onSuccess: () => dire('✓ Version validée : « Disponible »'), onError: (e) => dire(`Erreur : ${e.message}`) })}
          >
            <CheckCircle2 className="h-4 w-4" /> Valider la version
          </Button>
          <Button disabled={compter('DISPONIBLE') === 0} onClick={() => setDocumentOuvert(true)}>
            <FileText className="h-4 w-4" /> Générer le document
          </Button>
        </div>
        <p className="mt-2 text-km-label text-km-muted">
          Le document est le comparatif existant de Kimatch. Sa mise en forme définitive revient à William (réunion du 28/09).
        </p>
      </section>

      {documentOuvert && (
        <DocumentComparatif
          ouvert
          onFermer={() => setDocumentOuvert(false)}
          reco={reco}
          version={version}
          compte={compte}
          compteurs={compteurs}
          contactClient={null}
          conseiller={reco.conseiller ? { nom: reco.conseiller } : null}
        />
      )}
    </div>
  )
}

function Etapes({ actives }: { actives: boolean[] }) {
  const libelles = ['Version', 'Offres', 'Calcul', 'Prix reçus', 'Validée']
  return (
    <ol className="flex flex-wrap gap-1.5">
      {libelles.map((l, i) => (
        <li key={l} className={cn('rounded-km-pill px-2.5 py-1 text-km-label font-semibold', actives[i] ? 'bg-km-green-soft text-km-green' : 'bg-km-soft text-km-muted')}>
          {i + 1}. {l}
        </li>
      ))}
    </ol>
  )
}

function Cadrage({ version, parId, peutModifier, dire }: { version: VersionRecommandation; parId: Map<string, Compteur>; peutModifier: boolean; dire: (m: string) => void }) {
  const maj = useMajDateDebutFourniture()
  const echeances = version.compteurs.map((l) => parId.get(l.compteur_id)?.date_echeance).filter((d): d is string => Boolean(d)).sort()
  const proposee = echeances[0] ? lendemain(echeances[0]) : null
  return (
    <section>
      <h4 className="mb-2 text-km-name font-semibold text-km-text">1. La version</h4>
      <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
        <div>
          <Label htmlFor="parcours-debut">Début de fourniture</Label>
          <Input
            id="parcours-debut"
            type="date"
            disabled={!peutModifier || maj.isPending}
            defaultValue={version.date_debut_fourniture ?? ''}
            key={version.date_debut_fourniture ?? 'vide'}
            onBlur={(e) => {
              const v = e.target.value || null
              if (v === (version.date_debut_fourniture ?? null)) return
              maj.mutate({ versionId: version.id, date: v }, { onSuccess: () => dire('✓ Date de début enregistrée'), onError: (err) => dire(`Erreur : ${err.message}`) })
            }}
          />
          {!version.date_debut_fourniture && proposee && peutModifier && (
            <button type="button" className="mt-1 text-km-label text-km-green underline" onClick={() => maj.mutate({ versionId: version.id, date: proposee })}>
              Proposer le {formatDate(proposee)} (lendemain de la première échéance)
            </button>
          )}
        </div>
        <div className="text-km-body text-km-text">
          <p><span className="text-km-muted">Durées demandées :</span> {version.durees.length ? version.durees.map((d) => `${d} mois`).join(', ') : '—'}
            {version.types_prix.length > 0 && <> · <span className="text-km-muted">prix</span> {version.types_prix.join(', ')}</>}</p>
          <p><span className="text-km-muted">Livraison des offres souhaitée le :</span> {version.date_souhaitee ? formatDate(version.date_souhaitee) : '—'}</p>
          <p className="mt-1 text-km-muted">{version.compteurs.length} compteur(s) :</p>
          <ul className="flex flex-wrap gap-1.5">
            {version.compteurs.map((l) => {
              const c = parId.get(l.compteur_id)
              return <li key={l.lien_id}><Badge className="font-mono">{c?.type_energie === 'gaz' ? 'Gaz' : 'Élec'} {c?.numero_pdl || l.label}</Badge></li>
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}

function PastilleEtat({ etat }: { etat: EtatDOffre }) {
  if (etat.etat === 'DISPONIBLE') return <Badge tone="green">Prix disponible</Badge>
  if (etat.etat === 'INDISPONIBLE') return <Badge tone="red">Refusée</Badge>
  const p = etat.prevision
  return (
    <div>
      <Badge tone={etat.enRetard ? 'red' : 'amber'}>
        {p?.date ? `En attente pour le ${formatDate(p.date)}` : 'En attente, sans date'}
        {etat.enRetard && ' · en retard'}
      </Badge>
      {p && <p className={cn('mt-0.5 text-km-tiny', p.parDefaut ? 'text-km-amber' : 'text-km-muted')}>{p.raison}</p>}
    </div>
  )
}

function CompteRendu({ r, offres }: { r: CompteRenduCalcul; offres: { id: string; fournisseur_nom: string; duree_mois: number | null }[] }) {
  const nom = (id: string) => {
    const o = offres.find((x) => x.id === id)
    return o ? `${o.fournisseur_nom} ${o.duree_mois ?? '?'} mois` : id
  }
  return (
    <div className="mt-3 space-y-1 rounded-km bg-km-soft px-3 py-2 text-km-body">
      <p><strong>{r.lignesEcrites}</strong> ligne(s) recalculée(s), <strong>{r.offresDisponibles}</strong> offre(s) au prix disponible.</p>
      {r.tradeo && (
        <>
          <p>Tradeo : {r.tradeo.joignable ? `${r.prixTradeoEcrits} prix écrit(s)` : `non interrogé — ${r.tradeo.message}`}</p>
          <ul className="list-disc pl-5 text-km-label">
            {r.tradeo.lignes.map((l, i) => <li key={i} className={l.ok ? 'text-km-green' : 'text-km-muted'}>{nom(l.offreId)} : {l.texte}</li>)}
          </ul>
        </>
      )}
      {r.erreurs.map((e) => <p key={e} className="text-km-red">{e}</p>)}
    </div>
  )
}

function lendemain(dateIso: string): string {
  const d = new Date(`${dateIso.slice(0, 10)}T12:00:00`)
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function formatDate(dateIso: string) {
  return new Date(`${dateIso.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR')
}
function nombre(n: number | null | undefined) {
  return n == null ? '—' : n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
}
function euros(n: number | null | undefined) {
  return n == null ? '—' : `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`
}
