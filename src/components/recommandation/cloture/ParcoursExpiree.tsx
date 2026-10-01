import { useState } from 'react'
import { ArrowRight, BellOff, BellPlus, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Champ, EnTeteEtape, FenetreParcours, PanneauParcours, RailParcours, SAISIE, SAISIE_MONO, useSortieParcours,
  type EtapeParcours, type ResumeEtape,
} from '@/components/parcours/Parcours'
import { useCloturerRecommandationParcours } from '@/lib/data/clotureRecommandation'
import { cn } from '@/lib/utils'
import type { Recommandation } from '@/types/domain'
import { EtapeMotif, aujourdhui, dateFr, dateValide } from './commun'
import { phraseVersions } from './versionsOuvertes'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CLÔTURER EN « EXPIRÉE » — un rappel, puis le motif
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 01/10/2026 : « Étape 1 : proposition de créer une tâche permettant de rouvrir la
 * recommandation (libellé + date). Étape 2 : motif — pourquoi le client ne souhaite pas se
 * positionner pour le moment ? »
 *
 * ══ UNE PROPOSITION, PAS UNE OBLIGATION ══
 *
 * D'où deux cartes : programmer le rappel, ou s'en passer. « Pas de rappel » est un choix unique,
 * il fait donc avancer tout seul (règle « économiser les clics »).
 *
 * LA TÂCHE VA AU PROPRIÉTAIRE DE LA RECOMMANDATION et mène à sa fiche, où l'on rouvre d'un clic
 * (décision de William, 01/10/2026). Rien ne se rouvre tout seul : c'est au commercial de juger,
 * le jour venu, si le client est prêt. Sa date s'inscrit aussi sur la fiche : « à reprendre le … ».
 */

const ETAPES: EtapeParcours[] = [
  { cle: 'rappel', libelle: 'Le rappel' },
  { cle: 'motif', libelle: 'Le motif' },
]

export function ParcoursExpiree({ reco, onFermer, onToast }: {
  reco: Recommandation
  onFermer: () => void
  onToast: (m: string) => void
}) {
  const cloturer = useCloturerRecommandationParcours()

  const [etape, setEtape] = useState<'rappel' | 'motif'>('rappel')
  const [avecRappel, setAvecRappel] = useState<boolean | null>(null)
  const [titre, setTitre] = useState(`Rouvrir la recommandation « ${reco.titre} »`)
  const [dateRappel, setDateRappel] = useState('')
  const [motif, setMotif] = useState('')
  const [date, setDate] = useState(aujourdhui())
  const [entame, setEntame] = useState(false)

  const rappelDansLePasse = dateValide(dateRappel) && dateRappel < aujourdhui()
  const rappelPret = avecRappel === false || (avecRappel === true && titre.trim() !== '' && dateValide(dateRappel) && !rappelDansLePasse)
  const pret = rappelPret && motif.trim() !== '' && dateValide(date)
  const pourQui = reco.conseiller || 'vous'

  const sortie = useSortieParcours({
    entame: entame && !cloturer.isPending,
    bloque: cloturer.isPending,
    onFermer,
    titre: 'Fermer sans clôturer la recommandation ?',
    lignes: [
      { perdu: true, texte: 'Le rappel et le motif saisis seront perdus.' },
      { texte: 'La recommandation reste ouverte, telle qu’elle était.' },
    ],
    libelleFermer: 'Fermer sans clôturer',
  })
  const toucher = (f: (v: string) => void) => (v: string) => { setEntame(true); f(v) }

  async function valider() {
    if (!pret) return
    try {
      const bilan = await cloturer.mutateAsync({
        id: reco.id,
        dateCloture: date,
        issue: { finalite: 'EXPIREE', motif, rappel: avecRappel ? { titre, date: dateRappel } : null },
      })
      onToast(`— Recommandation expirée${bilan.tacheCreee ? ` — rappel le ${dateFr(dateRappel)}` : ''}${bilan.erreurs.length ? ` — ${bilan.erreurs.join(' · ')}` : ''}`)
      onFermer()
    } catch (e) {
      onToast(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const resumes: Record<string, ResumeEtape | undefined> = {
    rappel: {
      lignes: avecRappel === false ? ['Pas de rappel'] : avecRappel && dateValide(dateRappel) ? [`Rappel le ${dateFr(dateRappel)}`, `pour ${pourQui}`] : [],
    },
    motif: { lignes: [] },
  }
  const versions = phraseVersions(reco.versions, 'Expirée')

  return (
    <FenetreParcours sortie={sortie}>
      <RailParcours
        surtitre="Clôture"
        titre="Recommandation expirée"
        reference={reco.titre}
        etapes={ETAPES}
        courante={etape}
        sousTitre={etape === 'rappel' ? 'Quand reprendre contact' : 'Pourquoi le client attend'}
        resumes={resumes}
        note={versions ? { titre: 'Les versions se ferment avec elle', texte: versions } : undefined}
        onFermer={sortie.demander}
      />

      <PanneauParcours>
        {etape === 'rappel' && (
          <>
            <EnTeteEtape numero={1} total={2} titre="Programmer un rappel ?" />
            <div className="flex min-h-0 flex-1 flex-col gap-[10px] overflow-y-auto pr-1">
              <button
                type="button"
                onClick={() => { setEntame(true); setAvecRappel(true) }}
                className={cn(
                  'flex items-center gap-3 rounded-[12px] border px-4 py-[14px] text-left transition-colors',
                  avecRappel ? 'border-km-green bg-km-green-soft' : 'border-dashed border-km-green/50 bg-km-green-soft/40 hover:border-km-green hover:bg-km-green-soft',
                )}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-km-green text-white"><BellPlus className="h-4 w-4" /></span>
                <span className="flex flex-col gap-[2px]">
                  <span className="text-[13.5px] font-semibold text-km-text">Programmer un rappel</span>
                  <span className="text-[11.5px] text-km-muted">Une tâche pour {pourQui}, qui mène à la recommandation pour la rouvrir.</span>
                </span>
              </button>

              {avecRappel && (
                <div className="flex flex-col gap-[16px] rounded-[12px] border border-km-line bg-white px-4 py-[14px]">
                  <Champ intitule="Libellé de la tâche" requis>
                    <input value={titre} onChange={(e) => toucher(setTitre)(e.target.value)} className={SAISIE} />
                  </Champ>
                  <Champ intitule="Date du rappel" requis>
                    <input
                      type="date"
                      autoFocus
                      min={aujourdhui()}
                      value={dateRappel}
                      onChange={(e) => toucher(setDateRappel)(e.target.value)}
                      className={cn(SAISIE_MONO, 'w-[170px]', rappelDansLePasse && 'border-km-red')}
                    />
                    {rappelDansLePasse && <span className="text-[11.5px] font-semibold text-km-red">Un rappel se programme à partir d’aujourd’hui.</span>}
                  </Champ>
                </div>
              )}

              {/* UN CHOIX UNIQUE FAIT AVANCER : sans rappel, il n'y a rien d'autre à remplir ici. */}
              <button
                type="button"
                onClick={() => { setEntame(true); setAvecRappel(false); setEtape('motif') }}
                className="flex items-center gap-3 rounded-[12px] border border-km-line bg-white px-4 py-[12px] text-left transition-colors hover:border-km-muted hover:bg-km-bg"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-km-soft text-km-muted"><BellOff className="h-4 w-4" /></span>
                <span className="flex flex-col gap-[2px]">
                  <span className="text-[13.5px] font-semibold text-km-text">Pas de rappel</span>
                  <span className="text-[11.5px] text-km-muted">La recommandation se ferme sans tâche.</span>
                </span>
              </button>
            </div>
            <div className="mt-auto flex items-center gap-3 border-t border-km-line-soft pt-4">
              <span className="flex-1" />
              <Button variant="ghost" onClick={sortie.demander}>Annuler</Button>
              {avecRappel && (
                <Button variant="primary" disabled={!rappelPret} onClick={() => setEtape('motif')}>
                  Suivant <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </>
        )}

        {etape === 'motif' && (
          <>
            <EnTeteEtape numero={2} total={2} titre="Pourquoi le client attend-il ?" />
            <EtapeMotif
              question="Pourquoi le client ne souhaite pas se positionner pour le moment ?"
              aide="Budget pas encore voté, attend la fin de son contrat, AG en attente…"
              motif={motif}
              onMotif={toucher(setMotif)}
              date={date}
              onDate={toucher(setDate)}
            />
            <p className="mt-3 text-[11.5px] text-km-faint">Le motif s’affichera en gris en haut de la recommandation.</p>
            <div className="mt-auto flex items-center gap-3 border-t border-km-line-soft pt-4">
              <span className="flex-1" />
              <Button variant="ghost" onClick={() => setEtape('rappel')}>Précédent</Button>
              <Button variant="ghost" onClick={sortie.demander}>Annuler</Button>
              <Button variant="primary" className="border-[#83868f] bg-[#83868f] hover:bg-[#6d7079]" disabled={!pret || cloturer.isPending} onClick={() => void valider()}>
                {cloturer.isPending ? 'Clôture…' : 'Clôturer en Expirée'}
                {!cloturer.isPending && <Minus className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </>
        )}
      </PanneauParcours>
    </FenetreParcours>
  )
}
