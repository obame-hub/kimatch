import { useState } from 'react'
import { AlertTriangle, Check, FileText, Loader2, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { lireNombre } from '@/lib/pricing/budget'
import { saisieComplete, useChiffrageMutations, type Chiffrage } from '@/lib/data/chiffrage'
import type { Lectures } from '@/lib/data/lectureOffre'
import {
  MARGE_INCLUSE_PAR_DEFAUT, dejaChiffree, rapprocher, saisieDepuisLecture,
  type OffreLue, type PropositionLue,
} from '@/lib/pricing/lectureOffre'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES PROPOSITIONS LUES PAR L'IA — le volet qui s'ouvre sur le tableau du Pricer
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 01/10/2026 : « ce sera à l'IA ensuite d'identifier à quelles lignes ça correspond ». Un
 * PDF lâché sur le tableau se range sur la version ET se lit ; un fichier déjà déposé se lit d'un
 * clic depuis la liste des propositions.
 *
 * L'IA LIT, LE PRICING INCLUT. Chaque offre lue montre la ligne trouvée (modifiable), ce qui va
 * s'écrire, et ce qui ne colle pas (PCE, CAR, validité). Un clic sur « Inclure » remplit la ligne,
 * et, la ligne étant complète, la passe « Prête » : la relecture vaut confirmation.
 */

const fr = (v: number | null | undefined, max = 2) => (v == null ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: max }))
const date = (iso: string | null) => (iso ? new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('fr-FR') : null)
const heure = (iso: string | null) => (iso && iso.length > 10 && !/T00:00/.test(iso) ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null)

export function VoletLectures({ lectures, chiffrage, versionId, choisirCompteur, onToast }: {
  lectures: Lectures
  chiffrage: Chiffrage
  versionId: string
  choisirCompteur: (vcId: string) => void
  onToast: (m: string) => void
}) {
  if (!lectures.lectures.length) return null
  return (
    <aside aria-label="Propositions lues" className="absolute right-3 top-12 z-30 flex max-h-[calc(100%-6.5rem)] w-[372px] flex-col gap-2 overflow-y-auto rounded-[13px] border border-km-line bg-km-bg/95 p-2 shadow-km-pop backdrop-blur-sm">
      <span className="flex items-center gap-1.5 px-1.5 pt-0.5 text-[9.5px] font-extrabold uppercase tracking-[.1em] text-km-faint">
        <Sparkles className="h-3 w-3 text-km-violet" /> Propositions lues · {lectures.lectures.length}
      </span>
      {lectures.lectures.map((l) => (
        <section key={l.id} className="shrink-0 overflow-hidden rounded-[11px] border border-km-line bg-white">
          <header className="flex items-center gap-2 border-b border-km-line-soft px-3 py-2">
            <FileText className="h-3.5 w-3.5 shrink-0 text-km-red" />
            <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-km-muted" title={l.nom}>{l.nom}</span>
            <button type="button" onClick={() => lectures.fermer(l.id)} aria-label="Fermer cette lecture" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-km-sm text-km-faint hover:bg-km-soft hover:text-km-text">
              <X className="h-3.5 w-3.5" />
            </button>
          </header>
          {l.etat === 'lecture' && (
            <p className="flex items-center gap-2 px-3 py-4 text-[12px] text-km-muted"><Loader2 className="h-3.5 w-3.5 animate-spin text-km-violet" /> Lecture de la proposition…</p>
          )}
          {l.etat === 'erreur' && <p className="px-3 py-3 text-[12px] text-km-red">{l.erreur}</p>}
          {l.etat === 'prete' && l.proposition && (
            <Proposition p={l.proposition} chiffrage={chiffrage} versionId={versionId} choisirCompteur={choisirCompteur} onToast={onToast} />
          )}
        </section>
      ))}
    </aside>
  )
}

function Proposition({ p, chiffrage, versionId, choisirCompteur, onToast }: { p: PropositionLue; chiffrage: Chiffrage; versionId: string; choisirCompteur: (vcId: string) => void; onToast: (m: string) => void }) {
  const expiree = p.date_validite ? Date.parse(p.date_validite) < Date.now() : false
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-0.5 px-3 pb-2 pt-2.5">
        <span className="flex items-baseline gap-2">
          <span className="text-[13.5px] font-extrabold text-km-text">{p.fournisseur_nom ?? 'Fournisseur non lu'}</span>
          {p.reference_offre && <span className="truncate font-mono text-[10.5px] text-km-faint">n° {p.reference_offre}</span>}
        </span>
        <span className="text-[11px] text-km-muted">
          {p.date_prise_effet && <>Prise d’effet <b className="font-semibold text-km-text">{date(p.date_prise_effet)}</b></>}
          {p.date_prise_effet && p.date_validite && ' · '}
          {p.date_validite && (
            <span className={cn(expiree && 'font-bold text-km-red')}>
              {expiree ? 'expirée le ' : 'valable jusqu’au '}{date(p.date_validite)}{heure(p.date_validite) ? ` ${heure(p.date_validite)}` : ''}
            </span>
          )}
        </span>
      </div>
      {p.offres.length === 0 && <p className="px-3 pb-3 text-[12px] text-km-faint">Aucune offre de prix reconnue dans ce document.</p>}
      {p.offres.map((o, i) => (
        <OffreLueCarte key={i} p={p} lue={o} chiffrage={chiffrage} versionId={versionId} choisirCompteur={choisirCompteur} onToast={onToast} />
      ))}
      {p.remarques && <p className="border-t border-km-line-soft px-3 py-2 text-[11px] italic text-km-muted">L’IA note : {p.remarques}</p>}
    </div>
  )
}

/** Une ligne du détail : ce qui est lu, et ce qui va s'écrire. */
function Ligne({ nom, children, fort }: { nom: string; children: React.ReactNode; fort?: boolean }) {
  return (
    <span className="flex items-baseline justify-between gap-3 py-[3px]">
      <span className="text-[11.5px] text-km-muted">{nom}</span>
      <span className={cn('whitespace-nowrap text-right font-mono text-[12px] tabular-nums', fort ? 'font-extrabold text-km-text' : 'font-semibold text-km-text')}>{children}</span>
    </span>
  )
}

function OffreLueCarte({ p, lue, chiffrage, versionId, choisirCompteur, onToast }: { p: PropositionLue; lue: OffreLue; chiffrage: Chiffrage; versionId: string; choisirCompteur: (vcId: string) => void; onToast: (m: string) => void }) {
  const m = useChiffrageMutations(versionId)
  const trouve = rapprocher(chiffrage, p, lue)
  /* LE RATTACHEMENT SE CHANGE ICI — une ligne trouvée par l'IA peut être la mauvaise. */
  const [offreId, setOffreId] = useState(trouve.offre?.id ?? '')
  const [vcId, setVcId] = useState(trouve.compteur?.vcId ?? '')
  const offre = chiffrage.offres.find((o) => o.id === offreId) ?? null
  const compteur = chiffrage.compteurs.find((c) => c.vcId === vcId) ?? null
  const existante = offre && compteur ? offre.saisies[compteur.vcId] : undefined
  const [margeTexte, setMargeTexte] = useState(() => fr(existante?.marge ?? MARGE_INCLUSE_PAR_DEFAUT).replace(/\s/g, ''))
  const [incluse, setIncluse] = useState(false)
  const marge = lireNombre(margeTexte) ?? 0
  const gaz = (compteur?.energie ?? p.type_energie) !== 'electricite'
  const saisie = compteur ? saisieDepuisLecture(compteur, lue, marge, existante) : null
  const enCours = m.enregistrerLigne.isPending || m.changerStatut.isPending

  /* Ce qui ne colle pas avec le compteur : dit, jamais bloquant. */
  const alertes: string[] = []
  if (trouve.alerteOffre && !offre) alertes.push(trouve.alerteOffre)
  if (trouve.alerteCompteur && (!compteur || compteur.vcId === trouve.compteur?.vcId)) alertes.push(trouve.alerteCompteur)
  if (compteur?.car != null && lue.car_mwh != null && Math.abs(compteur.car - lue.car_mwh) > 0.001) alertes.push(`CAR lue ${fr(lue.car_mwh, 3)} MWh, CAR du compteur ${fr(compteur.car, 3)} MWh.`)
  if (gaz && compteur?.profil && lue.profil && compteur.profil !== lue.profil) alertes.push(`Profil lu ${lue.profil}, profil du compteur ${compteur.profil}.`)
  if (existante && dejaChiffree(existante) && !incluse) alertes.push('La ligne porte déjà des prix : ils seront remplacés.')
  const manque = gaz ? lue.p0_mwh == null : Object.keys(lue.prix_postes_mwh).length === 0

  const inclure = async () => {
    if (!offre || !compteur || !saisie) return
    try {
      await m.enregistrerLigne.mutateAsync({ offre, compteur, saisie })
      const complete = chiffrage.compteurs.every((c) => saisieComplete(c, c.vcId === compteur.vcId ? saisie : offre.saisies[c.vcId]))
      if (complete && offre.statut === 'EN_ATTENTE') await m.changerStatut.mutateAsync({ offreId: offre.id, statut: 'DISPONIBLE' })
      setIncluse(true)
      choisirCompteur(compteur.vcId)
      onToast(`✓ ${offre.fournisseurNom} ${offre.duree ?? '?'} mois incluse${complete ? ' · ligne prête' : ''}`)
    } catch (e) {
      onToast(`Erreur : ${(e as Error).message}`)
    }
  }

  const choix = 'h-7 w-full min-w-0 rounded-[8px] border border-km-line bg-km-soft px-2 text-[12px] font-semibold text-km-text outline-none focus:border-km-green focus:bg-white'
  return (
    <div className="flex flex-col gap-2 border-t border-km-line-soft px-3 py-2.5">
      <span className="flex items-center gap-1.5">
        <span className="rounded-full bg-km-violet/10 px-2 text-[10.5px] font-extrabold leading-[18px] text-km-violet">{lue.duree_mois ?? '?'} mois</span>
        <span className="rounded-[6px] border border-km-line-soft px-1.5 text-[10.5px] font-semibold leading-[17px] text-km-muted">{lue.type_prix ?? 'type ?'}</span>
        {lue.numero_point && <span className="font-mono text-[11px] font-bold text-km-muted">{lue.numero_point}</span>}
      </span>

      <label className="flex flex-col gap-1">
        <span className="text-[9.5px] font-extrabold uppercase tracking-[.08em] text-km-faint">Ligne à remplir</span>
        <select value={offreId} onChange={(e) => setOffreId(e.target.value)} disabled={incluse} className={choix}>
          <option value="">— Choisir une ligne —</option>
          {chiffrage.offres.map((o) => <option key={o.id} value={o.id}>{o.fournisseurNom} · {o.duree ?? '?'} mois · {o.type ?? '?'}</option>)}
        </select>
      </label>
      {chiffrage.compteurs.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-[9.5px] font-extrabold uppercase tracking-[.08em] text-km-faint">Compteur</span>
          <select value={vcId} onChange={(e) => setVcId(e.target.value)} disabled={incluse} className={choix}>
            <option value="">— Choisir le compteur —</option>
            {chiffrage.compteurs.map((c) => <option key={c.vcId} value={c.vcId}>{c.numero}{c.libelle ? ` · ${c.libelle}` : ''}</option>)}
          </select>
        </label>
      )}

      <div className="flex flex-col rounded-[9px] bg-km-soft px-2.5 py-1.5">
        {gaz ? (
          <>
            <Ligne nom="P0 imprimé">{fr(lue.p0_mwh, 4)} €/MWh</Ligne>
            <span className="flex items-center justify-between gap-3 py-[3px]">
              <span className="text-[11.5px] text-km-muted">dont marge incluse</span>
              <MargeIncluse valeur={margeTexte} onChange={setMargeTexte} disabled={incluse} />
            </span>
            <Ligne nom="P0 fournisseur" fort>{fr(saisie?.p0, 4)} €/MWh</Ligne>
          </>
        ) : (
          <>
            {Object.entries(lue.prix_postes_mwh).map(([poste, prix]) => (
              <Ligne key={poste} nom={`${poste} imprimé`}>{fr(prix, 4)} → <b>{fr(saisie?.p0Postes[poste], 4)}</b></Ligne>
            ))}
            <span className="flex items-center justify-between gap-3 py-[3px]">
              <span className="text-[11.5px] text-km-muted">dont marge incluse</span>
              <MargeIncluse valeur={margeTexte} onChange={setMargeTexte} disabled={incluse} />
            </span>
            {lue.capacite_mwh != null && <Ligne nom="Capacité">{fr(lue.capacite_mwh, 4)} €/MWh</Ligne>}
          </>
        )}
        <span className="my-1 h-px bg-km-line" aria-hidden="true" />
        <Ligne nom={lue.abonnement_imprime?.periode === 'mois' ? 'Abonnement (imprimé au mois)' : 'Abonnement'}>
          <span title={lue.abonnement_annuel != null ? `Rangé à l’année : ${fr(lue.abonnement_annuel)} € ; la case l’affiche au mois` : undefined}>{fr(lue.abonnement_annuel)} €/an</span>
        </Ligne>
        <Ligne nom="CEE">
          {lue.cee_classiques_mwh != null && lue.cee_precarite_mwh != null
            ? <><span className="font-normal text-km-muted">{fr(lue.cee_classiques_mwh, 4)} + {fr(lue.cee_precarite_mwh, 4)} = </span>{fr(lue.cee_mwh, 4)}</>
            : fr(lue.cee_mwh, 4)} €/MWh
        </Ligne>
      </div>
      <span className="text-[10.5px] leading-[14px] text-km-faint">TQD, CTA, accise et CPB ne sont pas repris : ils viennent de la base, à la bonne date.</span>

      {alertes.map((a) => (
        <span key={a} className="flex items-start gap-1.5 rounded-[8px] border border-km-amber-line bg-km-amber-soft px-2 py-1.5 text-[11px] leading-[15px] text-[#8a4b2a]">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" /> {a}
        </span>
      ))}

      <button
        type="button"
        disabled={incluse || !offre || !compteur || manque || enCours}
        onClick={() => void inclure()}
        className={cn(
          'inline-flex h-8 items-center justify-center gap-1.5 rounded-km text-[12.5px] font-bold transition-colors',
          incluse ? 'bg-km-green-soft text-km-green' : offre && compteur && !manque ? 'bg-km-green text-white hover:bg-[#0a6650]' : 'cursor-not-allowed border border-km-line bg-km-soft text-km-faint',
        )}
      >
        {enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : incluse ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
        {incluse ? 'Incluse dans la ligne' : manque ? 'Aucun prix lu' : !offre ? 'Choisissez la ligne' : !compteur ? 'Choisissez le compteur' : 'Inclure dans la ligne'}
      </button>
    </div>
  )
}

/** La marge incluse dans le prix imprimé — 6 €/MWh d'ordinaire, modifiable avant d'inclure. */
function MargeIncluse({ valeur, onChange, disabled }: { valeur: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label="Marge incluse dans le prix imprimé"
      value={valeur}
      disabled={disabled}
      onChange={(e) => {
        const t = e.target.value.replace(/\./g, ',').replace(/[^\d,]/g, '')
        const i = t.indexOf(',')
        onChange(i < 0 ? t.slice(0, 6) : `${t.slice(0, i)},${t.slice(i + 1).replace(/,/g, '').slice(0, 2)}`)
      }}
      className="h-6 w-[72px] rounded-[7px] border border-[#CFE6DB] bg-[#EAF5F0] px-1.5 text-right font-mono text-[12px] font-semibold text-km-green outline-none focus:border-km-green focus:bg-white"
    />
  )
}
