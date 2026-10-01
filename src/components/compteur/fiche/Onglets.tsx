import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { ZoneDepotFichiers } from '@/components/ui/zone-depot-fichiers'
import { FenetreApercu } from '@/components/document/FenetreApercu'
import { useRecommandationsParCompte } from '@/lib/data/recommandations'
import { offresDeLaVersion } from '@/lib/data/parcoursPrix'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { FALLBACK_STATUTS_VERSIONS } from '@/lib/referenceFallbacks'
import { statutVieContrat } from '@/lib/statutVieContrat'
import { cn } from '@/lib/utils'
import type { Compteur, Contrat, ContratProspect, DocumentItem, Mandat, Recommandation } from '@/types/domain'
import { LogoFournisseur } from '@/components/compteur/fiche/ColonneLaterale'
import { Carte, Sourcil, dateFr, dateHeureFr, joursJusqua, libelleJours, nombreFr } from '@/components/compteur/fiche/commun'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * FICHE COMPTEUR v4 — LES ONGLETS CONTRATS, RECOMMANDATIONS, MANDATS, FICHIERS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const ANIMATION = 'animate-[kmFade_.18s_ease-out]'

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// CONTRATS — la frise et la liste
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Une tuile d'initiales teintée, stable pour un même fournisseur. */
const TEINTES_TUILE = [['#FFF3D8', '#A06B19'], ['#EAF1F8', '#3F6E9C'], ['#E7F4EF', '#0D7A5F'], ['#F2ECFB', '#7C5BB0']] as const
function teinteDe(nom: string) {
  let h = 0
  for (const c of nom) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return TEINTES_TUILE[h % TEINTES_TUILE.length]
}

/* « TotalEnergies » → TE, « EDF » → EDF, « Gaz Européen » → GE : un nom court se garde, un nom d'un
   seul mot donne ses deux premières majuscules (ou lettres), plusieurs mots leurs initiales. */
function initialesTuile(nom: string | null | undefined): string {
  const n = (nom ?? '').trim()
  if (!n) return '?'
  const mots = n.split(/\s+/).filter(Boolean)
  if (mots.length > 1) return mots.slice(0, 2).map((m) => m[0]).join('').toUpperCase()
  if (n.length <= 4) return n.toUpperCase()
  const majuscules = n.replace(/[^A-ZÀ-Ý]/g, '')
  return (majuscules.length >= 2 ? majuscules.slice(0, 2) : n.slice(0, 2)).toUpperCase()
}

function libellePrix(c: Contrat): string {
  return c.prix_molecule_eur_mwh != null ? `${nombreFr(c.prix_molecule_eur_mwh, 1)} €/MWh` : ''
}

/** Où en est un contrat prospect : ses dates peuvent manquer, on lit ce qu'elles disent. */
function etatProspect(p: ContratProspect, aujourdhui: string): 'EN_COURS' | 'A_VENIR' | 'TERMINE' {
  if (p.date_fin && p.date_fin.slice(0, 10) < aujourdhui) return 'TERMINE'
  if (p.date_debut && p.date_debut.slice(0, 10) > aujourdhui) return 'A_VENIR'
  return 'EN_COURS'
}

const LIBELLE_ETAT = { EN_COURS: 'En cours', A_VENIR: 'À venir', TERMINE: 'Terminé', RESILIE: 'Résilié', EXPIRE: 'Terminé' } as const

/* ══ UNE SEULE LIGNE, DEUX FAMILLES QUI NE SE CONFONDENT PAS — William, 01/10/2026 ══
   « Les contrats prospects et clients sont sur la même ligne, en revanche il faut une vraie
   différence graphique permettant de les distinguer. » La chronologie reste continue ; les contrats
   KiWee gardent le vert (et le gris une fois terminés), les contrats prospects prennent le violet,
   hachuré, avec leur mot écrit dans la barre. La couleur n'est jamais seule à le dire. */
const PROSPECT = { fg: '#5E3F94', bord: '#9A7CCB', fond: 'repeating-linear-gradient(135deg,#F2ECFB 0 8px,#E6DAF7 8px 16px)', doux: '#F2ECFB', rangee: '#FBF8FE' }

export function OngletContrats({ compteur, contrats, prospects, recoOuverte, modifiable, onEditerEcheance, onSupprimerProspect }: {
  compteur: Compteur
  contrats: Contrat[]
  /** Les contrats signés sans KiWee, déclarés par le client (`contrats_prospects`). */
  prospects: ContratProspect[]
  /** Une recommandation en cours sur ce compteur dessine « Prochain contrat » au bout de la frise. */
  recoOuverte: Recommandation | null
  modifiable: boolean
  /** `null` : créer ou choisir ; un contrat prospect : le corriger. */
  onEditerEcheance: (p: ContratProspect | null) => void
  onSupprimerProspect: (p: ContratProspect) => void
}) {
  const aujourdhui = new Date().toISOString().slice(0, 10)
  const tries = useMemo(
    () => [...contrats].filter((c) => c.date_debut).sort((a, b) => (a.date_debut ?? '').localeCompare(b.date_debut ?? '')),
    [contrats],
  )
  const statut = (c: Contrat) => statutVieContrat(c.date_debut, c.date_fin, aujourdhui, c.date_resiliation)
  const enCours = tries.find((c) => statut(c) === 'EN_COURS') ?? null

  /* L'AXE : du début du premier contrat moins un an, à la fin du dernier plus un an — contrats
     prospects compris. Une fin Indéterminée pousse l'axe d'un an après son début. */
  const datesConnues = [
    ...tries.flatMap((c) => [c.date_debut, c.date_fin]),
    ...prospects.flatMap((p) => [p.date_debut, p.date_fin]),
  ].filter((d): d is string => !!d)
  const annees0 = datesConnues.map((d) => Number(d.slice(0, 4)))
  const anneeDebut = annees0.length ? Math.min(...annees0) - 1 : new Date().getFullYear() - 2
  const indeterminees = prospects.some((p) => !p.date_fin)
  const anneeFin = Math.max(new Date().getFullYear(), ...annees0) + (indeterminees ? 2 : 1)
  const annees = Array.from({ length: anneeFin - anneeDebut + 1 }, (_, i) => anneeDebut + i)
  const t0 = Date.UTC(anneeDebut, 0, 1)
  const t1 = Date.UTC(anneeFin, 11, 31)
  const pos = (iso: string) => Math.max(0, Math.min(100, ((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - t0) / (t1 - t0)) * 100))
  const maintenant = pos(aujourdhui)

  const defilement = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = defilement.current
    if (!el) return
    /* « Aujourd'hui » à environ 70 % de la largeur visible, au chargement. */
    el.scrollLeft = Math.max(0, (el.scrollWidth * maintenant) / 100 - el.clientWidth * 0.7)
  }, [maintenant, tries.length])

  /* LA LISTE : clients et prospects ensemble, du plus récent au plus ancien — une fin Indéterminée
     passe devant, comme pour l'échéance. */
  const lignes = [
    ...tries.map((c) => ({ cle: c.date_fin ?? '9999-12-31', client: c, prospect: null as ContratProspect | null })),
    ...prospects.map((p) => ({ cle: p.date_fin ?? '9999-12-31', client: null as Contrat | null, prospect: p })),
  ].sort((a, b) => b.cle.localeCompare(a.cle))

  return (
    <div className={cn('flex flex-col gap-[14px]', ANIMATION)}>
      <Carte className="px-[18px] pb-3 pt-4">
        <div className="mb-[14px] flex flex-wrap items-center gap-3">
          <Sourcil>Frise contractuelle du compteur</Sourcil>
          <span className="flex-1" />
          <span className="flex gap-3 text-[11px] text-km-muted">
            <span className="flex items-center gap-[5px]"><span className="h-[9px] w-4 rounded-[3px] bg-km-green" />en cours</span>
            <span className="flex items-center gap-[5px]"><span className="h-[9px] w-4 rounded-[3px] bg-[#DCE2DE]" />terminé</span>
            <span className="flex items-center gap-[5px]"><span className="h-[9px] w-4 rounded-[3px] border border-dashed border-km-green bg-km-green-soft" />à venir</span>
            <span className="flex items-center gap-[5px]"><span className="h-[9px] w-4 rounded-[3px] border" style={{ borderColor: PROSPECT.bord, background: PROSPECT.fond }} />contrat prospect</span>
            <span className="flex items-center gap-[5px]"><span className="h-[11px] w-0.5 rounded-[1px] bg-km-red" />aujourd’hui</span>
          </span>
          {modifiable && (
            <button
              type="button"
              onClick={() => onEditerEcheance(null)}
              className="flex h-[26px] items-center gap-[6px] rounded-[8px] border border-km-line bg-white px-[9px] text-[11.5px] font-semibold text-km-green transition-colors hover:border-km-green hover:bg-km-green-soft"
            >
              <CalendarClock className="h-[13px] w-[13px]" strokeWidth={2.2} />
              Éditer l’échéance
            </button>
          )}
        </div>
        <div ref={defilement} className="-mx-0.5 overflow-x-auto pb-1 pt-1.5">
            <div className="min-w-[1500px] px-0.5">
              <div className="relative h-20 rounded-[14px] bg-km-soft">
                {tries.map((c) => {
                  const s = statut(c)
                  const nature = s === 'EN_COURS' ? 'cur' : s === 'A_VENIR' ? 'fut' : 'old'
                  const a = pos(c.date_debut!) + 0.4
                  const b = (c.date_fin ? pos(c.date_fin) : 100) - 0.4
                  return (
                    <BarreFrise
                      key={c.id}
                      nature={nature}
                      gauche={a}
                      largeur={Math.max(0.8, b - a)}
                      fournisseur={c.fournisseur_nom}
                      libelle={`${c.fournisseur_nom || 'Fournisseur'}${c.type_prix ? ` · ${c.type_prix.toLowerCase()}` : ''}`}
                      sous={`${libellePrix(c) ? `${libellePrix(c).replace('/MWh', '')} → ` : '→ '}${dateFr(c.date_fin)}`}
                      titre={`${s === 'EN_COURS' ? 'En cours' : s === 'A_VENIR' ? 'À venir' : 'Terminé'} — ${c.fournisseur_nom}${c.type_prix ? ` ${c.type_prix.toLowerCase()}` : ''} · ${dateFr(c.date_debut)} → ${dateFr(c.date_fin)}`}
                    />
                  )
                })}
                {recoOuverte && enCours?.date_fin && (
                  <BarreFrise
                    nature="fut"
                    gauche={pos(enCours.date_fin) + 0.4}
                    largeur={Math.max(0.8, 99.4 - (pos(enCours.date_fin) + 0.4))}
                    fournisseur={null}
                    initialesForcees="?"
                    libelle="Prochain contrat"
                    sous={recoOuverte.versions[0]?.reference_appel_offres ?? recoOuverte.titre}
                    titre="À venir — issu de la recommandation en cours"
                  />
                )}
                {prospects.map((p) => {
                  /* UNE BORNE INCONNUE SE FOND : sans début, la barre naît un an avant sa fin ; sans
                     fin, elle file jusqu'au bout de l'axe. Le fondu dit « on ne sait pas d'où / jusqu'où ». */
                  const debut = p.date_debut ?? (p.date_fin ? `${Number(p.date_fin.slice(0, 4)) - 1}${p.date_fin.slice(4, 10)}` : aujourdhui)
                  const a = pos(debut) + 0.4
                  const b = (p.date_fin ? pos(p.date_fin) : 100) - 0.4
                  const nom = p.fournisseur_nom ?? 'Fournisseur indéterminé'
                  return (
                    <BarreFrise
                      key={p.id}
                      nature={etatProspect(p, aujourdhui) === 'TERMINE' ? 'prospect-old' : 'prospect'}
                      fondu={!p.date_debut && !p.date_fin ? 'deux' : !p.date_debut ? 'gauche' : !p.date_fin ? 'droite' : undefined}
                      gauche={a}
                      largeur={Math.max(0.8, b - a)}
                      fournisseur={p.fournisseur_nom}
                      initialesForcees={p.fournisseur_nom ? undefined : '?'}
                      libelle={nom}
                      sous={`→ ${p.date_fin ? dateFr(p.date_fin) : 'Indéterminée'}`}
                      titre={`Contrat prospect — ${nom} · ${p.date_debut ? dateFr(p.date_debut) : 'début inconnu'} → ${p.date_fin ? dateFr(p.date_fin) : 'Indéterminée'}${modifiable ? ' · cliquer pour corriger' : ''}`}
                      onClick={modifiable ? () => onEditerEcheance(p) : undefined}
                    />
                  )
                })}
                <span title="Aujourd’hui" className="absolute -bottom-1 -top-1 z-[2] w-[2.5px] rounded-[2px] bg-km-red" style={{ left: `${maintenant}%` }} />
              </div>
              <div className="flex justify-between px-0.5 pt-[9px] font-mono text-[10.5px] text-km-faint">
                {annees.map((y) => <span key={y}>{y}</span>)}
              </div>
            </div>
          </div>
        <div className="mt-1 text-[10.5px] text-km-faint">← Faites défiler pour parcourir la chronologie →</div>
      </Carte>

      <Sourcil>Contrats couvrant ce compteur</Sourcil>
      <Carte className="overflow-hidden">
        {lignes.length === 0 && <div className="px-[18px] py-4 text-[12.5px] text-km-faint">Aucun contrat rattaché à ce compteur.</div>}
        {lignes.map(({ client: c, prospect: p }) => {
          if (p) {
            const etat = etatProspect(p, aujourdhui)
            const jours = etat === 'EN_COURS' && p.date_fin ? joursJusqua(p.date_fin) : null
            const nom = p.fournisseur_nom ?? 'Fournisseur indéterminé'
            const [bg, fg] = teinteDe(p.fournisseur_nom || '?')
            return (
              <div key={p.id} className="grid grid-cols-[76px_30px_minmax(0,1fr)_170px_92px_48px_104px] items-center gap-2.5 border-b border-km-line-soft px-[18px] py-3 last:border-b-0 hover:brightness-[.985]" style={{ background: PROSPECT.rangee }}>
                <span className="flex flex-col items-stretch gap-[3px]">
                  <span className="rounded-[6px] border px-2 py-[1px] text-center text-[10px] font-bold" style={{ color: PROSPECT.fg, background: PROSPECT.doux, borderColor: PROSPECT.bord }}>Prospect</span>
                  <span className="text-center text-[9.5px] font-semibold text-km-faint">{LIBELLE_ETAT[etat]}</span>
                </span>
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[8px] text-[9px] font-bold" style={{ background: bg, color: fg }}>
                  {initialesTuile(p.fournisseur_nom)}
                </span>
                <div className="min-w-0">
                  <div className={cn('truncate text-[13px] font-semibold', !p.fournisseur_nom && 'text-km-muted')}>{nom}</div>
                  <div className="mt-px truncate text-[11px] text-km-faint">
                    {[p.duree_mois ? `${p.duree_mois} mois` : 'Durée indéterminée', p.cree_par_nom ? `déclaré par ${p.cree_par_nom} le ${dateFr(p.date_creation)}` : `déclaré le ${dateFr(p.date_creation)}`].join(' · ')}
                  </div>
                </div>
                <span className="font-mono text-[11px] text-km-muted">{p.date_debut ? dateFr(p.date_debut) : '…'} → {p.date_fin ? dateFr(p.date_fin) : 'Indéterminée'}</span>
                <span />
                <span className={cn('text-right text-[11px] font-bold', jours != null && jours < 0 ? 'text-km-red' : 'text-km-amber')}>{jours != null ? libelleJours(jours) : ''}</span>
                <span className="flex items-center justify-end gap-1.5">
                  {modifiable && (
                    <>
                      <button type="button" onClick={() => onEditerEcheance(p)} className="text-[12px] font-semibold text-km-green hover:underline">Modifier</button>
                      <button
                        type="button"
                        onClick={() => onSupprimerProspect(p)}
                        aria-label="Supprimer ce contrat prospect"
                        title="Supprimer ce contrat prospect"
                        className="flex h-6 w-6 items-center justify-center rounded-[6px] text-km-faint transition-colors hover:bg-km-red-soft hover:text-km-red"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </span>
              </div>
            )
          }
          const k = c!
          const s = statut(k)
          const vivant = s === 'EN_COURS'
          const jours = vivant ? joursJusqua(k.date_fin) : null
          const [bg, fg] = teinteDe(k.fournisseur_nom || '?')
          const detail = vivant
            ? (compteur.type_energie === 'electricite'
              ? [k.type_prix, compteur.segment && compteur.tension ? `${compteur.segment} ${compteur.tension}` : compteur.segment].filter(Boolean).join(' · ')
              : [k.type_prix, compteur.tarif_distribution, compteur.profil_consommation].filter(Boolean).join(' · '))
            : [k.type_prix, k.duree_mois ? `${k.duree_mois} mois` : null].filter(Boolean).join(' · ')
          return (
            <div key={k.id} className="grid grid-cols-[76px_30px_minmax(0,1fr)_170px_92px_48px_104px] items-center gap-2.5 border-b border-km-line-soft px-[18px] py-3 last:border-b-0 hover:bg-km-bg">
              <span
                className="rounded-[6px] px-2 py-[3px] text-center text-[10px] font-bold"
                style={vivant ? { color: '#0D7A5F', background: '#E7F4EF' } : { color: '#69716C', background: '#F3F5F2' }}
              >
                {s === 'EN_COURS' ? 'En cours' : s === 'A_VENIR' ? 'À venir' : s === 'RESILIE' ? 'Résilié' : 'Terminé'}
              </span>
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[8px] text-[9px] font-bold" style={{ background: bg, color: fg }}>
                {initialesTuile(k.fournisseur_nom)}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold">{k.fournisseur_nom || 'Fournisseur inconnu'}{k.type_prix ? ` · ${k.type_prix.toLowerCase()}` : ''}</div>
                {detail && <div className="mt-px truncate text-[11px] text-km-faint">{detail}</div>}
              </div>
              <span className="font-mono text-[11px] text-km-muted">{dateFr(k.date_debut)} → {dateFr(k.date_fin)}</span>
              <span className="text-right font-mono text-[11.5px] text-km-text">{libellePrix(k)}</span>
              <span className={cn('text-right text-[11px] font-bold', jours != null && jours < 0 ? 'text-km-red' : 'text-km-amber')}>{jours != null ? libelleJours(jours) : ''}</span>
              <Link to={`/contrats/${k.id}`} className="text-right text-[12px] font-semibold text-km-green">Ouvrir →</Link>
            </div>
          )
        })}
      </Carte>
    </div>
  )
}

function BarreFrise({ nature, fondu, gauche, largeur, fournisseur, initialesForcees, libelle, sous, titre, onClick }: {
  nature: 'cur' | 'old' | 'fut' | 'prospect' | 'prospect-old'
  /** Une borne inconnue (contrat prospect) : la barre se fond de ce côté. */
  fondu?: 'gauche' | 'droite' | 'deux'
  gauche: number
  largeur: number
  fournisseur: string | null
  initialesForcees?: string
  libelle: string
  sous: string
  titre: string
  onClick?: () => void
}) {
  const prospect = nature === 'prospect' || nature === 'prospect-old'
  const masque = fondu === 'gauche'
    ? 'linear-gradient(90deg,transparent,#000 18%)'
    : fondu === 'droite'
      ? 'linear-gradient(90deg,#000 70%,transparent)'
      : fondu === 'deux' ? 'linear-gradient(90deg,transparent,#000 18%,#000 70%,transparent)' : undefined
  return (
    <span
      title={titre}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') { e.preventDefault(); onClick() } } : undefined}
      className={cn(
        'absolute bottom-[7px] top-[7px] flex items-center gap-[9px] overflow-hidden px-2.5',
        /* LA FORME DIT AUSSI LA FAMILLE : arrondi plein pour un contrat KiWee, angles serrés pour un
           contrat prospect — lisible même sans distinguer les couleurs. */
        prospect ? 'rounded-[6px]' : 'rounded-[13px]',
        onClick && 'cursor-pointer transition-[filter] hover:brightness-[.97]',
      )}
      style={{
        left: `${gauche}%`,
        width: `${largeur}%`,
        background: nature === 'cur' ? 'linear-gradient(90deg,#0D7A5F,#199B78)' : nature === 'fut' ? 'repeating-linear-gradient(135deg,#F3F5F2 0 7px,#E7F4EF 7px 14px)' : prospect ? PROSPECT.fond : '#DCE2DE',
        border: nature === 'fut' ? '1.5px dashed #0D7A5F' : prospect ? `2px solid ${PROSPECT.bord}` : 'none',
        color: nature === 'cur' ? '#fff' : nature === 'fut' ? '#0D7A5F' : prospect ? PROSPECT.fg : '#45473F',
        boxShadow: nature === 'cur' ? '0 3px 10px rgba(13,122,95,.3)' : 'none',
        opacity: nature === 'prospect-old' ? 0.6 : undefined,
        maskImage: masque,
        WebkitMaskImage: masque,
        paddingLeft: fondu === 'gauche' || fondu === 'deux' ? 28 : undefined,
      }}
    >
      {initialesForcees
        ? <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[8px] bg-white text-[10px] font-extrabold text-[#45473F]">{initialesForcees}</span>
        : <LogoFournisseur nom={fournisseur} taille={30} rayon={8} part={80} bordure={false} />}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 whitespace-nowrap text-[12px] font-bold">
          {prospect && (
            <span className="rounded-[4px] px-[5px] py-px text-[8.5px] font-extrabold uppercase tracking-[.08em] text-white" style={{ background: PROSPECT.fg }}>
              Prospect
            </span>
          )}
          {libelle}
        </span>
        <span className="whitespace-nowrap font-mono text-[10px] font-semibold opacity-90">{sous}</span>
      </span>
    </span>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// RECOMMANDATIONS — l'onglet créé par la v4
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ══ UNE RECOMMANDATION EST LIÉE SI UNE DE SES VERSIONS CONTIENT LE COMPTEUR ══
 * Jamais par le site : un compteur voisin du même immeuble ferait remonter une reco qui ne le couvre
 * pas — le piège déjà corrigé sur les mandats. Seule l'étape `CLOTUREE` ferme une recommandation.
 */
export function useRecommandationsDuCompteur(compteur: Compteur) {
  const { data } = useRecommandationsParCompte(compteur.compte_id ?? undefined)
  return useMemo(() => {
    const liees = (data ?? []).filter(
      (r) => r.versions.some((v) => v.compteur_ids.includes(compteur.id)) || (r.compteur_ids ?? []).includes(compteur.id),
    )
    const recentes = (a: Recommandation, b: Recommandation) => (b.date_creation ?? '').localeCompare(a.date_creation ?? '')
    return {
      ouvertes: liees.filter((r) => r.etape !== 'CLOTUREE').sort(recentes),
      passees: liees.filter((r) => r.etape === 'CLOTUREE').sort(recentes),
    }
  }, [data, compteur.id])
}

const FINALITE: Record<string, { libelle: string; fg: string; bg: string }> = {
  ACCEPTEE: { libelle: 'Acceptée', fg: '#0D7A5F', bg: '#E7F4EF' },
  REFUSEE: { libelle: 'Refusée', fg: '#B85145', bg: '#FBE9E6' },
  EXPIREE: { libelle: 'Expirée', fg: '#69716C', bg: '#F3F5F2' },
}

export function OngletRecommandations({ ouvertes, passees, contratEnCours, echeance, onLancer, opportunites }: {
  ouvertes: Recommandation[]
  passees: Recommandation[]
  contratEnCours: Contrat | null
  echeance: string | null
  onLancer: () => void
  opportunites: React.ReactNode
}) {
  const jours = joursJusqua(echeance)
  const limite = echeance ? (() => { const d = new Date(`${echeance.slice(0, 10)}T12:00:00`); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10) })() : null

  return (
    <div className={cn('flex flex-col gap-[14px]', ANIMATION)}>
      {ouvertes.map((r) => <RecoEnCours key={r.id} reco={r} />)}

      {ouvertes.length === 0 && (
        <div className="flex items-center gap-4 rounded-[16px] border-[1.5px] border-dashed border-[#C9D0CB] bg-white p-[22px]">
          <div className="flex-1">
            <div className="text-[14px] font-bold">Aucune recommandation en cours</div>
            <div className="mt-[3px] text-[12.5px] text-km-muted">
              {echeance
                ? <>Le contrat{contratEnCours?.fournisseur_nom ? ` ${contratEnCours.fournisseur_nom}` : ''} se termine le {dateFr(echeance)}{jours != null ? ` (${libelleJours(jours)})` : ''}.{limite && jours != null && jours > 0 ? ` Une consultation lancée avant le ${dateFr(limite)} laisse le temps de comparer et de voter.` : ''}</>
                : 'Aucune échéance connue sur ce compteur.'}
            </div>
          </div>
          <button type="button" onClick={onLancer} className="rounded-[10px] bg-km-green px-[14px] py-[9px] text-[13px] font-semibold text-white shadow-[0_4px_14px_rgba(13,122,95,.28)]">
            Lancer l’appel d’offres
          </button>
        </div>
      )}

      {opportunites}

      <Sourcil>Recommandations passées</Sourcil>
      {passees.length === 0 ? (
        <div className="text-[12.5px] text-km-faint">Aucune recommandation passée sur ce compteur.</div>
      ) : (
        <Carte className="overflow-hidden">
          {passees.map((r) => {
            const f = FINALITE[r.finalite_cloture ?? ''] ?? { libelle: 'Close', fg: '#69716C', bg: '#F3F5F2' }
            return (
              <div key={r.id} className="grid grid-cols-[80px_minmax(0,1fr)_200px_70px] items-center gap-3 border-b border-km-line-soft px-[18px] py-3 last:border-b-0">
                <span className="rounded-[6px] px-2 py-[3px] text-center text-[10px] font-bold" style={{ color: f.fg, background: f.bg }}>{f.libelle}</span>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold">{r.titre}</div>
                  {r.fournisseur_nom && <div className="truncate text-[11px] text-km-faint">Retenu : {r.fournisseur_nom}</div>}
                </div>
                <span className="font-mono text-[11px] text-km-muted">{dateFr((r.date_cloture ?? r.date_creation ?? '').slice(0, 10))}</span>
                <Link to={`/recommandations/${r.id}`} className="text-right text-[12px] font-semibold text-km-green">Ouvrir →</Link>
              </div>
            )
          })}
        </Carte>
      )}
    </div>
  )
}

function RecoEnCours({ reco }: { reco: Recommandation }) {
  const { data: statutsRef } = useReferenceTable('statuts_versions_recommandation')
  const statuts = [...(statutsRef && statutsRef.length > 0 ? statutsRef : FALLBACK_STATUTS_VERSIONS)].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
  const version = reco.versions.find((v) => v.version_actuelle) ?? reco.versions[0] ?? null
  const courant = Math.max(0, statuts.findIndex((s) => s.code === version?.statut))

  const offres = version ? offresDeLaVersion(version).map((x) => x.offre) : []
  const actuelle = offres.find((o) => o.nature_offre === 'EN_COURS') ?? null
  const proposees = offres
    .filter((o) => o.nature_offre !== 'EN_COURS' && o.montant_annuel_ht != null)
    .sort((a, b) => (a.montant_annuel_ht ?? 0) - (b.montant_annuel_ht ?? 0))
  const validites = offres.map((o) => o.date_validite).filter((d): d is string => Boolean(d)).sort()
  const validite = validites[0] ?? null
  const ecart = (montant: number | null | undefined, pct: number | null | undefined) => {
    const p = pct != null ? -Math.abs(pct) : actuelle?.montant_annuel_ht && montant != null ? ((montant - actuelle.montant_annuel_ht) / actuelle.montant_annuel_ht) * 100 : null
    return p == null ? '' : `${p < 0 ? '\u2212' : '+'}${nombreFr(Math.abs(Math.round(p * 10) / 10), 1)}\u202f%`
  }
  const euros = (n: number | null | undefined) => (n == null ? '—' : `${nombreFr(Math.round(n))}\u00a0€`)
  const grille = 'grid grid-cols-[30px_36px_minmax(0,1fr)_110px_140px_90px] gap-2.5'

  return (
    <Carte relief>
      <div className="flex items-center gap-3 border-b border-km-line-soft px-[18px] py-4">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-km-blue-soft text-km-blue">
          <Sparkles className="h-[15px] w-[15px]" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-bold">{reco.titre}</span>
            {version?.reference_appel_offres && <span className="font-mono text-[11px] text-km-muted">{version.reference_appel_offres}</span>}
          </div>
          {validite && (
            <div className="mt-0.5 text-[12px] text-km-muted">
              Offres valables jusqu’au <b className="font-mono text-km-text">{validite.length > 10 ? dateHeureFr(validite) : dateFr(validite)}</b>
            </div>
          )}
        </div>
        <Link to={`/recommandations/${reco.id}?onglet=comparatif`} className="flex h-8 items-center gap-1.5 rounded-[10px] bg-ink-800 px-3 text-[13px] font-semibold text-white no-underline hover:text-white hover:no-underline">
          Ouvrir la présentation
        </Link>
        <Link to={`/recommandations/${reco.id}`} className="flex h-8 items-center rounded-[10px] border border-km-line px-3 text-[13px] font-medium text-km-text no-underline hover:text-km-text hover:no-underline">
          Fiche reco
        </Link>
      </div>

      <div className="grid gap-0 px-[18px] pb-1.5 pt-[14px]" style={{ gridTemplateColumns: `repeat(${statuts.length},minmax(0,1fr))` }}>
        {statuts.map((s, i) => {
          const fait = i < courant
          const actuel = i === courant
          return (
            <div key={s.code} className="flex flex-col gap-1.5">
              <div className="flex items-center">
                <span
                  className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-[10px] font-bold"
                  style={{
                    background: fait ? '#0D7A5F' : actuel ? '#3F6E9C' : '#fff',
                    color: fait || actuel ? '#fff' : '#929A95',
                    border: !fait && !actuel ? '1.5px solid #E0E5E1' : 'none',
                    boxShadow: actuel ? '0 0 0 4px #EAF1F8' : 'none',
                  }}
                >
                  {fait ? '✓' : i + 1}
                </span>
                <span className="mx-2 h-0.5 flex-1 rounded-[1px]" style={{ background: fait ? '#0D7A5F' : '#E0E5E1', opacity: i === statuts.length - 1 ? 0 : 1 }} />
              </div>
              <span className="text-[11.5px]" style={{ fontWeight: actuel ? 700 : 500, color: actuel ? '#3F6E9C' : fait ? '#1F2421' : '#929A95' }}>{s.libelle}</span>
            </div>
          )
        })}
      </div>

      <div className="px-[18px] pb-4 pt-2">
        <div className={cn(grille, 'border-b border-km-line py-2 text-[10px] font-bold uppercase tracking-[.06em] text-km-faint')}>
          <span>Rang</span><span /><span>Fournisseur</span><span>Durée</span><span className="text-right">Budget HTVA / an</span><span className="text-right">Écart</span>
        </div>
        {actuelle && (
          <div className={cn(grille, 'items-center border-b-[1.5px] border-dashed border-[#C9D0CB] bg-km-soft py-[9px] text-[12.5px] text-km-muted')}>
            <span />
            <span className="opacity-60 grayscale"><LogoFournisseur nom={actuelle.fournisseur_nom} taille={24} rayon={4} part={100} bordure={false} /></span>
            <span className="font-semibold">{actuelle.fournisseur_nom} · <span className="text-[10px] font-bold uppercase tracking-[.06em]">offre actuelle</span></span>
            <span>—</span>
            <span className="text-right font-mono">{euros(actuelle.montant_annuel_ht)}</span>
            <span />
          </div>
        )}
        {proposees.length === 0 && !actuelle && (
          <div className="py-3 text-[12.5px] text-km-faint">Aucune offre reçue pour l’instant.</div>
        )}
        {proposees.map((o, i) => (
          <div key={o.id} className={cn(grille, 'items-center border-b border-km-line-soft py-[9px] text-[12.5px]')} style={{ background: i === 0 ? '#F4FAF7' : 'transparent' }}>
            <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold" style={i === 0 ? { background: '#0D7A5F', color: '#fff' } : { background: '#F3F5F2', color: '#69716C' }}>{i + 1}</span>
            <LogoFournisseur nom={o.fournisseur_nom} taille={24} rayon={4} part={100} bordure={false} />
            <span className="truncate font-semibold">{o.fournisseur_nom}</span>
            <span className="text-km-muted">{o.duree_mois ? `${o.duree_mois} mois` : '—'}</span>
            <span className="text-right font-mono font-semibold">{euros(o.montant_annuel_ht)}</span>
            <span className="text-right font-mono font-bold text-km-green">{ecart(o.montant_annuel_ht, o.economie_pourcentage)}</span>
          </div>
        ))}
      </div>
    </Carte>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// MANDATS
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export function OngletMandats({ compteur, mandats, onSynchroniser, synchroEnCours, synchroAutorisee, onPreparer, modifiable }: {
  compteur: Compteur
  mandats: { mandat: Mandat; caduc: boolean }[]
  onSynchroniser: () => void
  synchroEnCours: boolean
  /** Un mandat KiWee actif et valide couvre ce compteur — la même règle que le serveur. */
  synchroAutorisee: boolean
  onPreparer: () => void
  modifiable: boolean
}) {
  const estElec = compteur.type_energie === 'electricite'
  const grd = estElec ? 'Enedis' : 'GRDF'
  const actif = mandats.find((m) => !m.caduc && m.mandat.statut === 'ACTIF') ?? null
  const caduc = actif ? null : mandats.find((m) => m.caduc) ?? null
  const principal = actif ?? caduc
  const historique = mandats.filter((m) => m !== principal)

  return (
    <div className={cn('flex flex-col gap-[14px]', ANIMATION)}>
      {principal ? <CarteMandat m={principal.mandat} caduc={principal.caduc} /> : (
        <div className="flex items-center gap-4 rounded-[16px] border-[1.5px] border-dashed border-[#C9D0CB] bg-white p-[22px]">
          <div className="flex-1">
            <div className="text-[14px] font-bold">Aucun mandat actif ne couvre ce compteur</div>
            <div className="mt-[3px] text-[12.5px] text-km-muted">Impossible de lancer une consultation tant qu’un mandat signé ne couvre pas ce point.</div>
          </div>
          {modifiable && (
            <button type="button" onClick={onPreparer} className="rounded-[10px] bg-km-green px-[14px] py-[9px] text-[13px] font-semibold text-white shadow-[0_4px_14px_rgba(13,122,95,.28)]">
              Préparer un mandat
            </button>
          )}
        </div>
      )}

      <Carte className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-[18px] py-4">
        <Sourcil>Accès aux données {grd}</Sourcil>
        {modifiable ? (
          <button
            type="button"
            disabled={!synchroAutorisee}
            onClick={() => { if (!synchroEnCours && synchroAutorisee) onSynchroniser() }}
            title={synchroAutorisee ? undefined : 'Aucun mandat KiWee actif ne couvre ce compteur : synchronisation impossible.'}
            className={cn(
              'row-span-3 flex h-8 items-center gap-1.5 rounded-[10px] border border-km-line px-3 text-[13px] font-medium',
              synchroAutorisee ? 'hover:bg-km-soft' : 'cursor-not-allowed bg-km-soft text-km-faint',
              synchroEnCours && 'cursor-progress',
            )}
          >
            <span className={cn(synchroEnCours && 'inline-block animate-[spin_.8s_linear_infinite]')}>↻</span>
            {synchroEnCours ? 'Synchronisation…' : 'Synchroniser'}
          </button>
        ) : <span className="row-span-3" />}
        <span className="text-[13px]">
          <b>{estElec ? 'Courbe de charge Enedis' : 'Relevés GRDF'}</b> ·{' '}
          {synchroAutorisee
            ? <span className="font-semibold text-km-green">autorisé par le mandat</span>
            : <span className="font-semibold text-km-amber">aucun mandat KiWee actif — synchronisation impossible</span>}
        </span>
        <span className="text-[12px] text-km-muted">
          Dernière synchronisation{' '}
          <span className="font-mono text-km-text">{compteur.date_derniere_synchro_eneo ? dateHeureFr(compteur.date_derniere_synchro_eneo) : 'jamais'}</span>
        </span>
      </Carte>

      {historique.length > 0 && (
        <>
          <Sourcil>Historique des mandats sur ce compteur</Sourcil>
          {historique.map(({ mandat: m, caduc: c }) => (
            <Carte key={m.id} className="flex items-center gap-3 px-[18px] py-3">
              <span
                className="w-[72px] rounded-[6px] px-2 py-[3px] text-center text-[10px] font-bold"
                style={c ? { color: '#A06B19', background: '#FFF3D8' } : { color: '#69716C', background: '#F3F5F2' }}
              >
                {c ? 'CADUC' : (m.statut || '—').replace('_', ' ')}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold">Mandat · {m.compteur_ids.length} PDL / {m.nb_sites_couverts} site{m.nb_sites_couverts > 1 ? 's' : ''}</div>
                <div className="truncate text-[11px] text-km-faint">Signataire {m.contact_signataire_nom ?? 'non renseigné'}</div>
              </div>
              <span className="font-mono text-[11px] text-km-muted">{dateFr(m.date_debut_validite ?? m.date_signature?.slice(0, 10))} → {dateFr(m.date_fin_validite)}</span>
              <Link to={`/mandats/${m.id}`} className="text-[12px] font-semibold text-km-green">Ouvrir</Link>
            </Carte>
          ))}
        </>
      )}
    </div>
  )
}

function CarteMandat({ m, caduc }: { m: Mandat; caduc: boolean }) {
  const debut = (m.date_debut_validite ?? m.date_signature ?? '').slice(0, 10) || null
  const fin = m.date_fin_validite?.slice(0, 10) ?? null
  const jours = joursJusqua(fin)
  const total = debut && fin ? Date.parse(fin) - Date.parse(debut) : 0
  const part = total > 0 ? Math.max(0, Math.min(100, ((Date.now() - Date.parse(debut!)) / total) * 100)) : 0
  return (
    <Carte className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-km-line-soft px-[18px] py-4">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-km-green-soft text-km-green">
          <ShieldCheck className="h-[15px] w-[15px]" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-bold">Mandat {m.compte_nom}</span>
            {m.reference && <span className="font-mono text-[11px] text-km-muted">{m.reference}</span>}
            <span
              className="rounded-[6px] px-[7px] py-0.5 text-[10px] font-bold"
              style={caduc ? { color: '#A06B19', background: '#FFF3D8' } : { color: '#0D7A5F', background: '#E7F4EF' }}
            >
              {caduc ? 'CADUC' : 'ACTIF'}
            </span>
          </div>
          <div className="mt-0.5 text-[12px] text-km-muted">
            Signataire <b className="text-km-violet">{m.contact_signataire_nom ?? 'non renseigné'}</b>
            {' · '}{m.compteur_ids.length} PDL sur {m.nb_sites_couverts} site{m.nb_sites_couverts > 1 ? 's' : ''}{' · '}
            {caduc
              ? <span className="font-semibold text-km-amber">ne couvre plus ce compteur</span>
              : <span className="font-semibold text-km-green">✓ couvre ce compteur</span>}
          </div>
        </div>
        <Link to={`/mandats/${m.id}`} className="flex h-8 items-center rounded-[10px] border border-km-line px-3 text-[13px] font-medium text-km-text no-underline hover:bg-km-soft hover:text-km-text hover:no-underline">
          Document PDF
        </Link>
      </div>
      {fin && (
        <div className="px-[18px] py-4">
          <div className="mb-2 flex items-baseline">
            <Sourcil>Validité</Sourcil>
            <span className="flex-1" />
            {jours != null && (
              <span className={cn('text-[12px] font-bold', jours < 0 ? 'text-km-red' : 'text-km-amber')}>
                {jours < 0 ? `expiré depuis ${Math.abs(jours)} jours` : `expire dans ${jours} jour${jours > 1 ? 's' : ''}`}
              </span>
            )}
          </div>
          <div className="relative h-2.5 rounded-[5px] bg-km-line-soft">
            <div className="absolute bottom-0 left-0 top-0 rounded-[5px] bg-[linear-gradient(90deg,#0D7A5F,#199B78)]" style={{ width: `${part}%` }} />
            <div className="absolute -top-[3px] h-4 w-0.5 rounded-[1px] bg-km-red" style={{ left: `${part}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[10.5px] text-km-faint">
            <span>signé {dateFr(debut)}</span>
            <span className="font-bold text-km-red">aujourd’hui</span>
            <span>fin {dateFr(fin)}</span>
          </div>
        </div>
      )}
    </Carte>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// FICHIERS
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const TEINTE_CATEGORIE: Record<string, [string, string]> = {
  CONTRAT: ['#0D7A5F', '#E7F4EF'],
  FACTURE: ['#3F6E9C', '#EAF1F8'],
  MANDAT: ['#7C5BB0', '#F2ECFB'],
  RELEVE: ['#A06B19', '#FFF3D8'],
}
const TEINTE_AUTRE: [string, string] = ['#69716C', '#F3F5F2']

function pluriel(libelle: string) {
  return /s$/i.test(libelle) ? libelle : `${libelle}s`
}

export function OngletFichiers({ documents, types, onDeposer }: {
  documents: DocumentItem[]
  types: { id: string; code?: string | null; libelle: string }[]
  onDeposer: (fichiers: File[], typeDocumentId: string | null) => Promise<void>
}) {
  const [filtre, setFiltre] = useState<string>('tous')
  const [apercu, setApercu] = useState<DocumentItem | null>(null)
  const ouvrir = useRef<(() => void) | null>(null)
  const codeDe = (d: DocumentItem) => types.find((t) => t.libelle === d.type_document)?.code ?? 'AUTRE'
  const visibles = documents.filter((d) => filtre === 'tous' || codeDe(d) === filtre)

  return (
    <div className={cn('flex flex-col gap-3', ANIMATION)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {[{ code: 'tous', libelle: 'Tous' }, ...types.map((t) => ({ code: t.code ?? t.id, libelle: pluriel(t.libelle) }))].map((c) => (
          <button
            key={c.code}
            type="button"
            onClick={() => setFiltre(c.code)}
            className="select-none rounded-full border px-3 py-[5px] text-[12px] font-semibold"
            style={filtre === c.code ? { background: '#1C1E24', color: '#fff', borderColor: '#1C1E24' } : { background: '#fff', color: '#69716C', borderColor: '#E0E5E1' }}
          >
            {c.libelle}
          </button>
        ))}
        <span className="flex-1" />
        <button type="button" onClick={() => ouvrir.current?.()} className="flex h-8 items-center rounded-[10px] bg-ink-800 px-3 text-[13px] font-semibold text-white">
          ＋ Ajouter un fichier
        </button>
      </div>
      <ZoneDepotFichiers types={types} onDeposer={onDeposer} apparence="compacte" ouvrirDepuis={ouvrir} />
      {visibles.length > 0 ? (
        <Carte className="overflow-hidden">
          {visibles.map((d) => {
            const code = codeDe(d)
            const [fg, bg] = TEINTE_CATEGORIE[code] ?? TEINTE_AUTRE
            const ext = ((d.nom_fichier || d.nom).split('.').pop() ?? '').toUpperCase().slice(0, 4) || 'DOC'
            return (
              <div key={d.id} className="grid grid-cols-[34px_minmax(0,1fr)_90px_110px_70px] items-center gap-3 border-b border-km-line-soft px-[18px] py-2.5 last:border-b-0 hover:bg-km-bg">
                <span className="flex h-8 w-8 items-center justify-center rounded-[9px] text-[8.5px] font-extrabold" style={{ color: fg, background: bg }}>{ext}</span>
                <div className="min-w-0">
                  <Link to={`/documents/${d.id}`} className="block truncate text-[13px] font-semibold text-km-text">{d.nom}</Link>
                  {d.auteur && <div className="truncate text-[11px] text-km-faint">{d.auteur}</div>}
                </div>
                <span className="justify-self-start rounded-[6px] px-2 py-[3px] text-[10px] font-bold" style={{ color: fg, background: bg }}>{d.type_document || 'Autre'}</span>
                <span className="font-mono text-[11px] text-km-muted">{dateFr(d.date_creation?.slice(0, 10))}</span>
                <button type="button" onClick={() => setApercu(d)} className="text-right text-[12px] font-semibold text-km-green">Ouvrir</button>
              </div>
            )
          })}
        </Carte>
      ) : (
        <div className="text-[12.5px] text-km-faint">{documents.length === 0 ? 'Aucun fichier pour ce compteur.' : 'Aucun fichier dans cette catégorie.'}</div>
      )}
      {apercu && <FenetreApercu document={{ id: apercu.id, nom: apercu.nom, nom_fichier: apercu.nom_fichier, url: apercu.url }} onFermer={() => setApercu(null)} />}
    </div>
  )
}
