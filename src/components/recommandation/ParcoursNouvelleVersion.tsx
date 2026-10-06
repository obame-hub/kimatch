import { useState } from 'react'
import { FenetreParcours, PanneauParcours, RailParcours, useSortieParcours, type EtapeParcours, type ResumeEtape } from '@/components/parcours/Parcours'
import { EtapeDurees, EtapeFournisseurs, usePremiereVersion } from '@/components/opportunite/PremiereVersion'
import { useCompte } from '@/lib/data/comptes'
import { useCompteursParIds } from '@/lib/data/compteurs'
import { useMandatsParCompte } from '@/lib/data/mandats'
import { useEcheancesRetenues } from '@/lib/data/echeancesRetenues'
import { useHistoriqueConsultations } from '@/lib/data/recommandations'
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
const ETAPES: EtapeParcours[] = [
  { cle: 'fournisseurs', libelle: 'Fournisseurs' },
  { cle: 'durees', libelle: 'Durées' },
]

export function ParcoursNouvelleVersion({ reco, dupliquer, onClose, onCree }: {
  reco: Recommandation
  dupliquer: boolean
  onClose: () => void
  onCree: (versionId: string) => void
}) {
  const ids = reco.compteur_ids ?? []
  const { data: compte } = useCompte(reco.compte_id)
  const { data: compteurs } = useCompteursParIds(ids)
  const { data: mandats } = useMandatsParCompte(reco.compte_id)
  const { data: echeances } = useEcheancesRetenues(ids)
  const { data: historique } = useHistoriqueConsultations(reco.id)
  const [etape, setEtape] = useState<'fournisseurs' | 'durees'>('fournisseurs')
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
  const resumes: Record<string, ResumeEtape | undefined> = {
    fournisseurs: etape === 'durees' && pv.date ? {
      lignes: [`Offre souhaitée le ${dateFr(pv.date)}`, `${pv.choisis.length} fournisseur${pv.choisis.length > 1 ? 's' : ''} consulté${pv.choisis.length > 1 ? 's' : ''}`],
    } : undefined,
  }
  const enCours = reco.versions.some((v) => v.version_actuelle)

  return (
    <FenetreParcours sortie={sortie}>
      <RailParcours
        surtitre={dupliquer ? 'Duplication' : 'Nouvelle version'}
        titre={`Version ${numero}`}
        reference={reco.titre}
        etapes={ETAPES}
        courante={etape}
        sousTitre={etape === 'fournisseurs' ? 'Date souhaitée et consultation' : compteurs && compteurs.length > 1 ? 'Par fournisseur et par compteur' : 'Par fournisseur'}
        resumes={resumes}
        note={dupliquer
          ? { titre: 'Reprise de la version précédente', texte: 'Mêmes fournisseurs, mêmes durées : la date proposée laisse à chacun le temps de répondre. Ceux qui ont refusé ne sont pas repris.' }
          : enCours ? { titre: 'La version en cours se clôture', texte: 'Elle passera au statut Clôturée, résultat Expirée : la nouvelle devient la version active du dossier.' } : undefined}
        onFermer={sortie.demander}
      />
      <PanneauParcours>
        {etape === 'fournisseurs' ? (
          <EtapeFournisseurs pv={pv} numero={1} total={2} onSuivant={() => setEtape('durees')} onPlusTard={sortie.demander} libellePlusTard="Annuler" />
        ) : (
          <>
            {erreur && <p className="mb-2 rounded-[10px] border border-km-red-line bg-km-red-soft px-3 py-2 text-[12px] font-semibold text-km-red">{erreur}</p>}
            <EtapeDurees
              pv={pv}
              numero={2}
              total={2}
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
