import { useState } from 'react'
import { Copy, FilePlus2 } from 'lucide-react'
import { EnTeteEtape, FenetreParcours, PanneauParcours, RailParcours, useSortieParcours, type EtapeParcours, type ResumeEtape } from '@/components/parcours/Parcours'
import { EtapeDurees, EtapeFournisseurs, usePremiereVersion } from '@/components/opportunite/PremiereVersion'
import { useCompte, useFournisseursConsultables } from '@/lib/data/comptes'
import { useCompteursParIds } from '@/lib/data/compteurs'
import { useMandatsParCompte } from '@/lib/data/mandats'
import { useEcheancesRetenues } from '@/lib/data/echeancesRetenues'
import { useHistoriqueConsultations } from '@/lib/data/recommandations'
import { useEligibilityRules } from '@/lib/data/eligibilityRules'
import { useMappingRules } from '@/lib/data/mappingRules'
import { dateFr } from '@/components/recommandation/cloture/commun'
import type { Recommandation } from '@/types/domain'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * UNE NOUVELLE VERSION DEPUIS LA FICHE — les étapes 3 et 4 de la création, seules
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 06/10/2026 : les étapes « Fournisseurs » et « Durées » de la création remplacent aussi la
 * « Nouvelle version » de la fiche recommandation, avec ce que les versions précédentes apprennent :
 *   · un fournisseur déjà consulté sur le dossier se juge sur son délai d'ACTUALISATION ;
 *   · un fournisseur qui a refusé de répondre (dernier statut de consultation « Refusée ») n'est plus
 *     éligible — « Le fournisseur n'a pas souhaité répondre préalablement » ;
 *   · DUPLIQUER clone la version précédente à une nouvelle date : mêmes fournisseurs, mêmes durées,
 *     mêmes types de prix, et la date proposée est le premier jour ouvré où tous ont le temps de
 *     répondre.
 * L'assistant de l'Assistant prix Tradéo (`CotationWizard`) reste tel quel.
 */
type Etape = 'depart' | 'fournisseurs' | 'durees'

/**
 * ══ PRÉCHARGER AU SURVOL — William, 07/10/2026 : « fluidité et réactivité maximales » ══
 * Monté par la fiche dès que la souris approche « Nouvelle version » (ou que le bouton prend le
 * focus) : les lectures du parcours partent avant le clic, sous les mêmes clés, et la fenêtre s'ouvre
 * sur des données déjà là. Le compte et les compteurs du périmètre sont déjà lus par la fiche.
 */
export function PrechargeNouvelleVersion({ reco }: { reco: Recommandation }) {
  useMandatsParCompte(reco.compte_id)
  useEcheancesRetenues(reco.compteur_ids ?? [])
  useHistoriqueConsultations(reco.id)
  useFournisseursConsultables()
  useEligibilityRules()
  useMappingRules()
  return null
}

/**
 * ══ LE POINT DE DÉPART, PREMIÈRE ÉTAPE — William, 06/10/2026 ══ « Quand je clique sur nouvelle version,
 * je suis sous l'ancien modèle de process. » Le choix « Dupliquer / Créer vierge », qui s'ouvrait sous
 * le bouton de la fiche, devient l'étape 1 du parcours quand le dossier a déjà une version. Un choix
 * unique : la carte cliquée fait avancer (règle « économiser les clics »).
 */
export function ParcoursNouvelleVersion({ reco, mode, onClose, onCree }: {
  reco: Recommandation
  /** `choisir` : le dossier a des versions, on demande d'abord le point de départ. */
  mode: 'choisir' | 'vierge' | 'dupliquer'
  onClose: () => void
  onCree: (versionId: string) => void
}) {
  const [dupliquer, setDupliquer] = useState(mode === 'dupliquer')
  const avecDepart = mode === 'choisir'
  const ids = reco.compteur_ids ?? []
  const { data: compte } = useCompte(reco.compte_id)
  const { data: compteurs } = useCompteursParIds(ids)
  const { data: mandats } = useMandatsParCompte(reco.compte_id)
  const { data: echeances } = useEcheancesRetenues(ids)
  const { data: historique } = useHistoriqueConsultations(reco.id)
  const [etape, setEtape] = useState<Etape>(avecDepart ? 'depart' : 'fournisseurs')
  const ETAPES: EtapeParcours[] = [
    ...(avecDepart ? [{ cle: 'depart', libelle: 'Point de départ' }] : []),
    { cle: 'fournisseurs', libelle: 'Fournisseurs' },
    { cle: 'durees', libelle: 'Durées' },
  ]
  const n = (e: Etape) => ETAPES.findIndex((x) => x.cle === e) + 1
  const [erreur, setErreur] = useState<string | null>(null)
  const pv = usePremiereVersion({ compte, compteurs: compteurs ?? [], mandats, echeances, historique, dupliquer })

  const sortie = useSortieParcours({
    entame: pv.choisis.length > 0,
    onFermer: onClose,
    titre: 'Fermer sans demander la version ?',
    lignes: [{ perdu: true, texte: 'Les fournisseurs et les durées choisis ici seront perdus.' }],
    libelleFermer: 'Fermer sans version',
  })
  const numero = Math.max(0, ...reco.versions.map((v) => v.numero_version ?? 0)) + 1
  const versionActive = reco.versions.find((v) => v.version_actuelle) ?? [...reco.versions].sort((a, b) => (b.numero_version ?? 0) - (a.numero_version ?? 0))[0]
  const nomActive = versionActive ? versionActive.nom || `V${versionActive.numero_version ?? ''}` : ''
  const resumes: Record<string, ResumeEtape | undefined> = {
    depart: etape !== 'depart' && avecDepart ? { lignes: [dupliquer ? `Duplication de ${nomActive}` : 'Version vierge'] } : undefined,
    fournisseurs: etape === 'durees' && pv.date ? {
      lignes: [`Offre souhaitée le ${dateFr(pv.date)}`, `${pv.choisis.length} fournisseur${pv.choisis.length > 1 ? 's' : ''} consulté${pv.choisis.length > 1 ? 's' : ''}`],
    } : undefined,
  }
  const enCours = reco.versions.some((v) => v.version_actuelle)

  return (
    <FenetreParcours sortie={sortie}>
      <RailParcours
        surtitre={dupliquer && etape !== 'depart' ? 'Duplication' : 'Nouvelle version'}
        titre={`Version ${numero}`}
        reference={reco.titre}
        etapes={ETAPES}
        courante={etape}
        sousTitre={etape === 'depart' ? 'Dupliquer ou repartir de zéro' : etape === 'fournisseurs' ? 'Date souhaitée et consultation' : compteurs && compteurs.length > 1 ? 'Par fournisseur et par compteur' : 'Par fournisseur'}
        resumes={resumes}
        note={dupliquer && etape !== 'depart'
          ? { titre: 'Reprise de la version précédente', texte: 'Mêmes fournisseurs, mêmes durées : la date proposée laisse à chacun le temps de répondre. Ceux qui ont refusé ne sont pas repris.' }
          : enCours ? { titre: 'La version en cours se clôture', texte: 'Elle passera au statut Clôturée, résultat Expirée : la nouvelle devient la version active du dossier.' } : undefined}
        onFermer={sortie.demander}
      />
      <PanneauParcours>
        {etape === 'depart' ? (
          <>
            <EnTeteEtape numero={1} total={ETAPES.length} titre="D'où repartir ?" />
            <div className="grid grid-cols-2 gap-3">
              {([
                [true, Copy, `Dupliquer ${nomActive}`, 'Mêmes fournisseurs, mêmes durées, à une nouvelle date : celle proposée laisse à chacun le temps de répondre. Ceux qui ont refusé ne sont pas repris.'],
                [false, FilePlus2, 'Créer vierge', 'Tout est à choisir : la date, les fournisseurs, les durées.'],
              ] as const).map(([d, Icone, titre, texte]) => (
                <button
                  key={titre}
                  type="button"
                  onClick={() => { pv.reinitialiser(); setDupliquer(d); setEtape('fournisseurs') }}
                  className="flex flex-col gap-2 rounded-[14px] border border-km-line bg-white p-5 text-left transition-colors hover:border-km-green hover:bg-km-green-tint"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-km-green-soft text-km-green"><Icone className="h-5 w-5" /></span>
                  <span className="text-[15px] font-semibold text-km-text">{titre}</span>
                  <span className="text-[12px] leading-[1.45] text-km-muted">{texte}</span>
                </button>
              ))}
            </div>
            {versionActive && (
              <p className="mt-4 text-[12px] text-km-muted">Dans les deux cas, <b className="text-km-text">{nomActive}</b> passe en <b className="text-km-text">Clôturée · Expirée</b>.</p>
            )}
            <div className="mt-auto flex items-center gap-3 border-t border-km-line-soft pt-4">
              <span className="flex-1" />
              <button type="button" onClick={sortie.demander} className="h-9 rounded-[10px] px-3.5 text-[13px] font-semibold text-km-muted hover:bg-km-soft">Annuler</button>
            </div>
          </>
        ) : etape === 'fournisseurs' ? (
          <EtapeFournisseurs pv={pv} numero={n('fournisseurs')} total={ETAPES.length} onSuivant={() => setEtape('durees')} onPlusTard={() => (avecDepart ? setEtape('depart') : sortie.demander())} libellePlusTard={avecDepart ? 'Précédent' : 'Annuler'} />
        ) : (
          <>
            {erreur && <p className="mb-2 rounded-[10px] border border-km-red-line bg-km-red-soft px-3 py-2 text-[12px] font-semibold text-km-red">{erreur}</p>}
            <EtapeDurees
              pv={pv}
              numero={n('durees')}
              total={ETAPES.length}
              recoId={reco.id}
              recoTitre={reco.titre}
              compteNom={reco.compte_nom ?? ''}
              compteurs={compteurs ?? []}
              onPrecedent={() => setEtape('fournisseurs')}
              onLance={(id) => { if (id) onCree(id); onClose() }}
              onErreur={setErreur}
            />
          </>
        )}
      </PanneauParcours>
    </FenetreParcours>
  )
}
