/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE SUIVI DOCUSIGN, LE MÊME SUR UN CONTRAT ET SUR UN MANDAT
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 08/09/2026 : « dans l'objet contrat il faudrait avoir le même système de suivi DocuSign
 * en bas comme dans l'objet mandat, il faudrait vérifier le statut via DocuSign, voir l'enveloppe
 * etc, ce qu'il y avait sur mandat que je ne vois plus je sais pas pourquoi. »
 *
 * ══ POURQUOI ELLE NE LE VOYAIT PLUS ══
 *
 * Il ne s'affichait QUE SI L'ÉTAT POUVAIT ENCORE CHANGER. Le raisonnement se tenait pour l'appel
 * automatique — redemander l'état d'une enveloppe signée est un appel DocuSign pour rien — mais il
 * avait été appliqué au BLOC ENTIER. Résultat : l'enveloppe, son lien, la date de signature et le
 * bouton de vérification disparaissaient à l'instant où ils devenaient une trace, c'est-à-dire au
 * moment où l'on vient les chercher. Un mandat actif — l'état de la quasi-totalité d'entre eux —
 * n'en montrait plus rien.
 *
 * ICI LES DEUX SONT SÉPARÉS : le bloc est là dès qu'une enveloppe existe, et c'est seulement
 * l'interrogation automatique qui s'arrête sur un état arrêté. Le bouton reste, parce qu'il ne coûte
 * qu'au moment où on le clique.
 *
 * ══ POURQUOI UN COMPOSANT PARTAGÉ ══
 *
 * Les deux fiches avaient chacune leur version. Celle du contrat avait la frise, les dates, le
 * signataire, le lien vers l'enveloppe ; celle du mandat n'avait qu'un bouton et l'identifiant
 * d'enveloppe posé dans un coin. Deux écrans pour la même chose, dont un moins bon : « le même
 * système » est une seule implémentation, pas une copie.
 *
 * LES DEUX OBJETS NE PORTENT PAS LES MÊMES COLONNES — le contrat a `statut_signature`, le mandat n'a
 * que son statut métier. La traduction se fait à l'entrée, dans `statutSignatureDuMandat`, plutôt que
 * par des `if` semés dans le rendu.
 */
import { useEffect, useState } from 'react'
import { ExternalLink, PenTool, Send, MailOpen, FileSignature } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  etatEnveloppeContrat,
  etatEnveloppeMandat,
  lienEnveloppeDocusign,
  DocusignNonConnecte,
  type EtatEnveloppe,
} from '@/lib/data/docusign'
import { cn } from '@/lib/utils'

/**
 * LE STATUT DE SIGNATURE D'UN MANDAT SE DÉDUIT DE SON STATUT MÉTIER.
 *
 * `mandats` ne porte pas de colonne `statut_signature` : la signature y est un jalon du cycle, pas
 * un état parallèle. Un mandat ACTIF est un mandat signé — c'est même la règle de Michel du
 * 21/08/2026 — et EXPIRE l'est aussi : il a bien été signé, il a seulement cessé de courir.
 */
function statutSignatureDuMandat(statutMandat: string | null): string | null {
  switch (statutMandat) {
    case 'A_PREPARER':
      return 'BROUILLON'
    case 'ENVOYE':
      return 'ENVOYE'
    case 'CONSULTE':
      return 'CONSULTE'
    case 'ACTIF':
    case 'EXPIRE':
      return 'SIGNE'
    case 'REFUSE':
      return 'REFUSE'
    case 'ANNULE':
      return 'ANNULE'
    default:
      return null
  }
}

/** Ce que dit un statut de signature, en trois mots et une explication. */
function etatSignature(
  statutSignature: string | null,
  dateEnvoi: string | null,
  dateSignature: string | null,
): { libelle: string; detail: string } {
  const jour = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR') : null)
  const envoye = jour(dateEnvoi)
  const signe = jour(dateSignature)
  switch (statutSignature) {
    case 'BROUILLON':
      /* CETTE PHRASE AFFIRMAIT PLUS QU'ELLE NE SAVAIT. Elle disait « l'enveloppe n'a pas encore été
         envoyée » — ce que Michel a lu le 31/08/2026 sur le contrat gaz de SDC 77 Joffre, alors que
         Marie l'avait signé. Kimatch sait seulement qu'il n'a rien appris depuis la création de
         l'enveloppe : l'envoi se fait DANS DocuSign, et la notification qui nous en informe a déjà
         lâché deux fois. Elle dit maintenant ce qu'elle sait, et où trouver la réponse. */
      return {
        libelle: 'Signature préparée',
        detail:
          "L'enveloppe est prête dans DocuSign. Nous n'avons reçu aucune nouvelle depuis : elle " +
          "attend peut-être d'être envoyée, ou elle a bougé sans que la notification nous parvienne. " +
          '« Vérifier auprès de DocuSign » tranche.',
      }
    case 'ENVOYE':
      return { libelle: 'Envoyé à signer', detail: envoye ? `Envoyé le ${envoye}.` : 'Envoyé à la signature.' }
    case 'CONSULTE':
      return { libelle: 'Ouvert par le signataire', detail: envoye ? `Envoyé le ${envoye}.` : 'En attente de signature.' }
    case 'SIGNE':
      return { libelle: 'Signé', detail: signe ? `Signé le ${signe}.` : 'Signé.' }
    case 'REFUSE':
      return { libelle: 'Signature refusée', detail: 'Le signataire a refusé de signer.' }
    case 'ANNULE':
      return { libelle: 'Signature annulée', detail: "L'enveloppe a été annulée dans DocuSign." }
    default:
      return { libelle: statutSignature ?? '—', detail: '' }
  }
}

export interface BlocSuiviDocusignProps {
  /** Lequel des deux objets : décide de l'endpoint interrogé et du vocabulaire affiché. */
  objet: 'contrat' | 'mandat'
  id: string
  envelopeId: string | null | undefined
  /** Le `statut_signature` du contrat, ou le code de statut du mandat. */
  statut: string | null | undefined
  dateEnvoi: string | null | undefined
  dateSignature: string | null | undefined
  signataireNom?: string | null
  signaler: (message: string) => void
  /** Où envoyer quelqu'un qui doit reconnecter son compte DocuSign. */
  versProfil: () => void
}

export function BlocSuiviDocusign({
  objet,
  id,
  envelopeId,
  statut,
  dateEnvoi,
  dateSignature,
  signataireNom,
  signaler,
  versProfil,
}: BlocSuiviDocusignProps) {
  const [etat, setEtat] = useState<EtatEnveloppe | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [verification, setVerification] = useState<'non_connecte' | 'echec' | null>(null)

  /* LES DEUX FICHES PASSENT DES CHAMPS OPTIONNELS : on ramene `undefined` a `null` une seule
     fois ici, plutot que de le traiter a chaque endroit qui lit la valeur. */
  const statutSignature =
    objet === 'contrat' ? (statut ?? null) : statutSignatureDuMandat(statut ?? null)
  /* L'ÉTAT ARRÊTÉ NE CACHE PLUS LE BLOC — il coupe seulement l'appel automatique. Voir l'en-tête :
     c'est la confusion des deux qui faisait disparaître le suivi du mandat une fois actif. */
  const etatFige = ['SIGNE', 'REFUSE', 'ANNULE'].includes(statutSignature ?? '')

  useEffect(() => {
    if (!envelopeId || etatFige) return
    let vivant = true
    const demande = objet === 'contrat' ? etatEnveloppeContrat(id) : etatEnveloppeMandat(id)
    void demande
      .then((r) => {
        if (!vivant) return
        setEtat(r)
        if (r.corrige) signaler('Statut corrigé d’après DocuSign — la notification n’était pas arrivée.')
      })
      .catch((err) => {
        /* PAS D'ERREUR JETÉE AU VISAGE de quelqu'un qui vient lire une fiche — mais on note que
           l'état affiché vient de la base et n'a pas été confronté à DocuSign. Le compte non
           connecté se distingue du reste : c'est le seul cas réparable en une minute. */
        if (!vivant) return
        setVerification(err instanceof DocusignNonConnecte ? 'non_connecte' : 'echec')
      })
    return () => {
      vivant = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objet, id, envelopeId, etatFige])

  if (!envelopeId) return null

  const e = etatSignature(statutSignature, dateEnvoi ?? null, dateSignature ?? null)
  const envoyeLe = etat?.envoyeLe ?? dateEnvoi ?? null
  const signeLe = etat?.signeLe ?? dateSignature ?? null

  async function verifier() {
    setEnCours(true)
    try {
      const r = objet === 'contrat' ? await etatEnveloppeContrat(id) : await etatEnveloppeMandat(id)
      setEtat(r)
      setVerification(null)
      signaler(
        r.corrige
          ? 'Statut corrigé d’après DocuSign — la notification n’était pas arrivée.'
          : `DocuSign confirme : ${r.statutDocusign ?? 'état inconnu'}, rien n’a changé.`,
      )
    } catch (err) {
      if (err instanceof DocusignNonConnecte) {
        signaler('Aucun compte DocuSign de l’équipe n’est utilisable : reconnectez le vôtre depuis Mon profil.')
      } else {
        signaler(err instanceof Error ? err.message : 'Vérification impossible')
      }
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="rounded-xl border border-km-line bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-km-xs font-bold uppercase tracking-wide text-km-faint">
          Suivi DocuSign
        </p>
        <Badge tone={statutSignature === 'SIGNE' ? 'kiwi' : statutSignature === 'REFUSE' || statutSignature === 'ANNULE' ? 'red' : 'amber'}>
          {e.libelle}
        </Badge>
      </div>

      {/* La mention ne s'affiche QUE si la confrontation a échoué : quand elle réussit, le statut
          est à jour et l'écrire serait du bruit à chaque ouverture de fiche. */}
      {verification && !etat && (
        <p className="mb-2.5 rounded-km border border-km-amber-line bg-km-amber-soft px-2.5 py-1.5 text-km-label text-amber-800">
          {verification === 'non_connecte' ? (
            <>
              Ce statut vient de la dernière notification reçue : aucun compte DocuSign de l’équipe
              n’est utilisable en ce moment, il n’a donc pas pu être vérifié.{' '}
              <button
                type="button"
                onClick={versProfil}
                className="font-bold underline decoration-dotted"
              >
                Reconnecter DocuSign
              </button>
            </>
          ) : (
            <>
              Ce statut vient de la dernière notification reçue : DocuSign n’a pas répondu à
              l’ouverture de la fiche. « Vérifier auprès de DocuSign » ci-dessous dira pourquoi.
            </>
          )}
        </p>
      )}

      <FriseEnvoi statutSignature={statutSignature} etat={etat} />

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-0.5 text-km-xs uppercase tracking-wide text-km-faint">Envoyé le</p>
          <p className="text-xs font-semibold text-km-text">
            {envoyeLe ? new Date(envoyeLe).toLocaleString('fr-FR') : 'pas encore envoyé'}
          </p>
        </div>
        <div>
          <p className="mb-0.5 text-km-xs uppercase tracking-wide text-km-faint">Destinataire</p>
          <p className="truncate text-xs font-semibold text-km-text">
            {etat?.signataire?.nom
              ? `${etat.signataire.nom}${etat.signataire.email ? ` — ${etat.signataire.email}` : ''}`
              : signataireNom || '—'}
          </p>
        </div>
        {signeLe && (
          <div>
            <p className="mb-0.5 text-km-xs uppercase tracking-wide text-km-faint">Signé le</p>
            <p className="text-xs font-semibold text-km-text">{new Date(signeLe).toLocaleString('fr-FR')}</p>
          </div>
        )}
        {etat?.signataire?.recuLe && (
          <div>
            <p className="mb-0.5 text-km-xs uppercase tracking-wide text-km-faint">Ouvert par le signataire</p>
            <p className="text-xs font-semibold text-km-text">
              {new Date(etat.signataire.recuLe).toLocaleString('fr-FR')}
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* LE BOUTON RESTE SUR UN ÉTAT ARRÊTÉ. C'est précisément là qu'on doute — « il est signé
            chez DocuSign, pourquoi Kimatch dit autre chose ? » — et il ne coûte un appel qu'au
            moment du clic. C'est aussi lui qui a réparé les contrats signés avant le 31/08/2026. */}
        <Button type="button" size="sm" variant="outline" onClick={verifier} disabled={enCours}>
          {enCours ? 'Vérification…' : etat ? 'Revérifier auprès de DocuSign' : 'Vérifier auprès de DocuSign'}
        </Button>
        {/* LE LIEN EST LÀ D'EMBLÉE, sans attendre la vérification : c'est quand on doute qu'on le
            cherche, et douter n'est pas un clic de plus à mériter. */}
        <a
          href={etat?.lien ?? lienEnveloppeDocusign(envelopeId)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-km-green underline decoration-dotted hover:text-km-green"
        >
          Voir l’enveloppe dans DocuSign
          <ExternalLink className="h-3 w-3" />
        </a>
        <span className="font-mono text-km-xs text-km-faint">{envelopeId}</span>
      </div>
    </div>
  )
}

/**
 * L'avancement de l'envoi, en quatre temps.
 *
 * Naoëlle, 21/08/2026 : « il faudrait créer une frise de l'état de l'envoi ».
 *
 * QUATRE ÉTAPES ET NON TROIS : « Ouvert » s'ajoute entre l'envoi et la signature. C'est
 * l'information qui manque le plus quand on attend — le client a-t-il au moins ouvert le document ?
 * DocuSign la connaît, elle arrive avec « Vérifier auprès de DocuSign ».
 *
 * Un refus ou une annulation ne sont pas une étape de plus : ils arrêtent la frise là où elle en
 * était et la passent au rouge — ce n'est pas un avancement.
 */
function FriseEnvoi({ statutSignature, etat }: { statutSignature: string | null; etat: EtatEnveloppe | null }) {
  const statut = etat?.statut ?? statutSignature
  const arrete = statut === 'REFUSE' || statut === 'ANNULE'
  const ouvert = Boolean(etat?.signataire?.recuLe) || statut === 'CONSULTE'

  const atteinte = statut === 'SIGNE' ? 3 : ouvert ? 2 : statut === 'ENVOYE' ? 1 : 0

  const etapes = [
    { libelle: 'Préparé', icone: PenTool },
    { libelle: 'Envoyé', icone: Send },
    { libelle: 'Ouvert', icone: MailOpen },
    { libelle: 'Signé', icone: FileSignature },
  ]

  return (
    <div>
      <div className="flex items-center">
        {etapes.map((s, i) => {
          const faite = i <= atteinte
          return (
            <div key={s.libelle} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    !faite
                      ? 'bg-km-soft text-km-faint'
                      : arrete
                        ? 'bg-gradient-to-br from-red-600 to-red-500 text-white shadow-sm'
                        : 'bg-gradient-to-br from-kiwi-600 to-kiwi-500 text-white shadow-sm',
                  )}
                >
                  <s.icone className="h-3.5 w-3.5" />
                </span>
                <span
                  className={cn(
                    'whitespace-nowrap text-km-label font-bold',
                    faite ? (arrete ? 'text-red-700' : 'text-km-text') : 'text-km-faint',
                  )}
                >
                  {s.libelle}
                </span>
              </div>
              {i < etapes.length - 1 && (
                <div
                  /* LE SEGMENT EN COURS EST HACHURÉ ET DÉFILE. Naoëlle, 27/08/2026 : « il faut que
                     tous les statuts des objets aient cette animation ». Rien ne défile quand
                     l'envoi est ARRÊTÉ : une hachure derrière un refus annoncerait une progression
                     qui n'aura pas lieu. */
                  style={
                    !arrete && i === atteinte
                      ? {
                          backgroundImage:
                            'repeating-linear-gradient(90deg,#c3ddd4 0px,#c3ddd4 7px,#eef5f2 7px,#eef5f2 14px)',
                          backgroundSize: '36px 100%',
                        }
                      : undefined
                  }
                  className={cn(
                    'mx-1 h-1 flex-1 rounded',
                    i < atteinte
                      ? arrete
                        ? 'bg-gradient-to-r from-red-600 to-red-500'
                        : 'bg-gradient-to-r from-kiwi-600 to-kiwi-500'
                      : !arrete && i === atteinte
                        ? 'animate-km-stripe motion-reduce:animate-none'
                        : 'bg-km-soft',
                  )}
                />
              )}
            </div>
          )
        })}
      </div>

      {arrete && (
        <p className="mt-2 text-km-label font-semibold text-red-700">
          {statut === 'REFUSE'
            ? 'Le signataire a refusé de signer : la frise s’arrête là.'
            : 'L’enveloppe a été annulée dans DocuSign : la frise s’arrête là.'}
        </p>
      )}
      {!arrete && !etat && atteinte < 3 && (
        <p className="mt-2 text-km-xs leading-snug text-km-faint">
          « Ouvert » ne peut venir que de DocuSign : cliquez sur « Vérifier auprès de DocuSign » pour
          savoir si le signataire a ouvert le document.
        </p>
      )}
    </div>
  )
}
