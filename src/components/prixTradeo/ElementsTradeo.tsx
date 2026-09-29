import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Label, Select } from '@/components/ui/form'
import { appelerBanc, messageErreur } from '@/lib/data/tradeo'
import type { CompteurTradeo, ResponsableTradeo } from '@/lib/tradeo/dossier'
import { lireOffresTradeo, type OffreTradeo } from '@/lib/tradeo/prixUnitaires'
import { Explication, PiedAssistant } from './assistant'

/**
 * LES BRIQUES TRADEO DE L'ASSISTANT « PRÉPARER LES PRIX D'UN DOSSIER » : l'aperçu des prix renvoyés
 * par Tradeo et le formulaire de correction d'une demande. Le chemin lui-même vit dans
 * `PhaseTradeo` ; ces deux pièces en sont sorties pour rester lisibles.
 */

/* ── Étape 5 : les prix ───────────────────────────────────────────────────────────────────────── */

const MARGE_MINIMALE = 2

export function EtapePrix({ siret, energie, onRetour, onFermer }: { siret: string; energie: 'ELEC' | 'GAZ'; onRetour: () => void; onFermer: () => void }) {
  const [offres, setOffres] = useState<OffreTradeo[] | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function chercher() {
    setEnCours(true)
    setErreur(null)
    setOffres(null)
    try {
      const l = await appelerBanc('compteurs_par_siret', { siret, energie })
      const liste = ((l.reponse as { listCompteur?: { id: number; numCompteur: string; type?: string; parametreCompteur?: string }[] } | undefined)?.listCompteur ?? []).slice(0, 10)
      if (!l.ok || liste.length === 0) throw new Error(l.ok ? 'Aucun compteur accepté pour l’instant.' : messageErreur(l) ?? '')
      const c = await appelerBanc('consommation', { compteurData: liste })
      const parNum = (c.reponse as { compteur?: Record<string, { id: number; objetConsommation?: Record<string, unknown>; autreFournisseur?: unknown[] }> } | undefined)?.compteur
      if (!c.ok || !parNum) throw new Error(messageErreur(c) ?? 'Consommation illisible.')
      const compteur: Record<string, unknown> = {}
      for (const [num, x] of Object.entries(parNum)) {
        compteur[num] = { id: x.id, marge: MARGE_MINIMALE, objetConsommation: periodeAVenir(x.objetConsommation ?? {}), autreFournisseur: x.autreFournisseur ?? [] }
      }
      const r = await appelerBanc('calculer', { compteur })
      const lu = lireOffresTradeo(r.reponse)
      if (!r.ok && lu.offres.length === 0) throw new Error(messageErreur(r) ?? 'Tradeo n’a pas calculé.')
      if (lu.erreurs.length > 0 && lu.offres.length === 0) throw new Error(lu.erreurs.map((e) => e.message).join(' · '))
      setOffres(lu.offres)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <>
      <Explication>
        Tradeo interroge ses fournisseurs pour les compteurs acceptés. Kimatch garde leurs <strong>prix unitaires</strong>, pas leurs
        budgets : le budget sera calculé dans Kimatch, sur la même consommation pour tous.
      </Explication>
      {!offres && !enCours && !erreur && <p className="text-km-muted">Cliquez sur « Obtenir les prix ».</p>}
      {enCours && <p className="flex items-center gap-2 text-km-muted"><Loader2 className="h-4 w-4 animate-spin" /> Tradeo interroge les fournisseurs…</p>}
      {erreur && <p className="flex items-start gap-2 text-km-red"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{erreur}</p>}
      {offres && (
        <ul className="divide-y divide-km-line rounded-km border border-km-line">
          {offres.map((o, i) => (
            <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
              <span className="font-semibold text-km-text">{o.fournisseur}{o.actuel && <Badge tone="blue" className="ml-1.5">actuel</Badge>}</span>
              <span className="text-km-body">
                {!o.succes ? <span className="text-km-red">{o.message ?? 'refuse de coter'}</span>
                  : o.sansPrixUnitaire ? <span className="text-km-amber">budget seul, pas de prix</span>
                  : <PrixCourts offre={o} />}
              </span>
            </li>
          ))}
        </ul>
      )}
      {offres && <p className="mt-2 text-km-label text-km-muted">Prix de l’environnement de test, en unités Tradeo (€/MWh). Ils incluent peut-être une marge de {MARGE_MINIMALE} : à confirmer avant de les enregistrer.</p>}
      <PiedAssistant onRetour={onRetour}>
        {offres && <Button onClick={onFermer}>Terminer</Button>}
        <Button variant="primary" disabled={enCours} onClick={() => void chercher()}>
          {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {offres ? 'Relancer' : 'Obtenir les prix'}
        </Button>
      </PiedAssistant>
    </>
  )
}

function PrixCourts({ offre }: { offre: OffreTradeo }) {
  const prix = offre.prixMoyens ?? offre.periodes[0]?.prix ?? {}
  const affiches = Object.entries(prix).filter(([k]) => k !== 'abo' && k !== 'cee' && !/capa|coef/i.test(k))
  return (
    <span className="tabular-nums">
      {affiches.map(([k, v]) => `${k === 'prixMolecule' ? 'Molécule' : k.replace(/^prix/, '')} ${v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}`).join(' · ')}
    </span>
  )
}

/** Tradeo refuse une date de début passée : on décale la période au mois prochain, même durée. */
function periodeAVenir(o: Record<string, unknown>): Record<string, unknown> {
  const debut = typeof o.dateDebut === 'string' ? o.dateDebut : null
  const fin = typeof o.dateFin === 'string' ? o.dateFin : null
  const auj = new Date().toISOString().slice(0, 10)
  if (!debut || debut >= auj) return o
  const d = new Date()
  const nouveauDebut = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
  const duree = fin ? Date.parse(fin) - Date.parse(debut) : 365 * 86400000
  return { ...o, dateDebut: nouveauDebut.toISOString().slice(0, 10), dateFin: new Date(nouveauDebut.getTime() + duree).toISOString().slice(0, 10) }
}


/* ── Le formulaire, pour corriger seulement ───────────────────────────────────────────────────── */

export function FormulaireCorrection({ siret, setSiret, responsable, setResponsable, compteurs, setCompteurs }: {
  siret: string; setSiret: (s: string) => void
  responsable: ResponsableTradeo; setResponsable: (r: ResponsableTradeo) => void
  compteurs: CompteurTradeo[]; setCompteurs: (c: CompteurTradeo[]) => void
}) {
  const maj = (i: number, patch: Partial<CompteurTradeo>) => setCompteurs(compteurs.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="as-siret">SIRET</Label>
        <Input id="as-siret" value={siret} onChange={(e) => setSiret(e.target.value.replace(/\s/g, ''))} inputMode="numeric" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="as-sex">Civilité</Label>
          <Select id="as-sex" value={responsable.sex} onChange={(e) => setResponsable({ ...responsable, sex: e.target.value })}>
            <option value="">—</option><option value="M.">M.</option><option value="Mme">Mme</option>
          </Select>
        </div>
        {([['prenom', 'Prénom'], ['nom', 'Nom'], ['email', 'Email'], ['tele', 'Téléphone'], ['fonction', 'Fonction']] as const).map(([k, l]) => (
          <div key={k}>
            <Label htmlFor={`as-${k}`}>{l}</Label>
            <Input id={`as-${k}`} value={responsable[k]} onChange={(e) => setResponsable({ ...responsable, [k]: e.target.value })} />
          </div>
        ))}
      </div>
      {compteurs.map((c, i) => (
        <div key={i} className="grid gap-2 rounded-km border border-km-line p-2 sm:grid-cols-3">
          <p className="self-center font-mono text-km-label sm:col-span-3">{c.num_compteur} · {c.type === 'GAZ' ? 'Gaz' : 'Élec'}</p>
          <div><Label htmlFor={`as-deb-${i}`}>Début</Label><Input id={`as-deb-${i}`} type="date" value={c.dateDebut} onChange={(e) => maj(i, { dateDebut: e.target.value })} /></div>
          <div><Label htmlFor={`as-fin-${i}`}>Fin</Label><Input id={`as-fin-${i}`} type="date" value={c.dateFin} onChange={(e) => maj(i, { dateFin: e.target.value })} /></div>
          <div className="self-end"><Button variant="ghost" onClick={() => setCompteurs(compteurs.filter((_, j) => j !== i))}>Retirer</Button></div>
        </div>
      ))}
    </div>
  )
}
