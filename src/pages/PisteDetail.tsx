import { useState } from 'react'
import { useOuvrirEmail } from '@/lib/voletEmail'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Building2, Check, Filter, Mail, Phone, Plus, User } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EntityLink } from '@/components/ui/entity-link'
import { appelerNumero } from '@/lib/telephonie'
import { InlineField } from '@/components/ui/inline-field'
import { OngletFichiers } from '@/components/compte/OngletFichiers'
import { DialogConversionPiste } from '@/components/prospection/DialogConversionPiste'
import { DialogNouvelleTache } from '@/components/tache/DialogNouvelleTache'
import { FriseStatut } from '@/components/opportunite/FriseStatut'
import { ActivityFeed } from '@/components/site/ActivityFeed'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { useGoBack } from '@/lib/useGoBack'
import { useCanManage, useProfilsAdmin } from '@/lib/data/roles'
import { DetailsPiste } from '@/components/prospection/DetailsPiste'
import { InlineIdentite } from '@/components/ui/inline-identite'
import { useActionsParPiste, useCompleteAction } from '@/lib/data/actions'
import { useInteractionsParPiste } from '@/lib/data/interactions'
import { useDocumentsParEntites, useTeleverserDocuments } from '@/lib/data/documents'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useStatutsOpportunites } from '@/lib/data/opportunites'
import {
  usePiste, useMajPiste, useConvertirPisteEnOpportunite, useStatutsPistes,
} from '@/lib/data/prospection'
import { MenuChoix } from '@/components/ui/menu-choix'
import { Dialog } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/form'
import { echeanceLisible, estEnRetard } from '@/lib/heureTache'
import { cn } from '@/lib/utils'

/**
 * LES TONS DES QUATRE STATUTS DE `statuts_pistes`.
 *
 * DISQUALIFIÉE EST ROUGE, ET CE N'EST PLUS MON CHOIX. Elle était grise, avec cet argument : écarter
 * une piste est un travail fait, pas un échec — sur cinq mille pistes importées, en écarter est
 * l'issue normale de la majorité, et le rouge devrait se réserver à ce qui appelle une action.
 *
 * William, 15/09/2026, a tranché l'inverse : « Convertie (vert) ou Disqualifiée (rouge) ». L'ancien
 * argument reste écrit ici pour qu'on sache ce qu'on a changé et pourquoi on pourrait y revenir,
 * mais la sémiotique du portefeuille lui appartient, pas à moi. Convertie reste verte : elle a
 * produit une affaire.
 */
const TON_STATUT_PISTE: Record<string, 'kiwi' | 'amber' | 'neutral' | 'red'> = {
  NOUVELLE: 'amber',
  EN_QUALIFICATION: 'amber',
  // Le temps d'attente du prospect : la piste est vivante, elle ne dort pas. Même ambre que les
  // deux étapes précédentes, parce que c'est la même nature — du travail en cours.
  EN_ATTENTE_FACTURE: 'amber',
  CONVERTIE: 'kiwi',
  DISQUALIFIEE: 'red',
}

/**
 * FICHE PISTE.
 *
 * Michel, 01/09/2026 : « que ce soit affiché comme les opportunités, que ce ne soit pas un volet à
 * droite qui s'affiche quand on clique dessus mais une page dédiée à la piste ».
 *
 * ══ CE QUE CETTE PAGE REMPLACE, ET POURQUOI LE PANNEAU NE SUFFISAIT PLUS ══
 *
 * Le panneau latéral avait été choisi en toute conscience : une piste vit quelques jours et son
 * travail consiste à cocher cinq cases avant de disparaître en opportunité. Le panneau gardait le
 * tableau visible derrière lui — on cochait, on fermait, on voyait la carte changer de colonne.
 *
 * Trois choses ont changé depuis, et elles rendent la page nécessaire :
 *
 *   · UNE PISTE PORTE MAINTENANT DES TÂCHES (`actions.piste_id`, 31/08/2026). Un objet qui porte du
 *     travail daté a besoin d'une adresse : on doit pouvoir y revenir depuis la page Tâches.
 *   · UN PANNEAU N'A PAS D'ADRESSE. Pas de lien à envoyer, pas de favori, pas de retour arrière du
 *     navigateur. On ne partage pas « la troisième carte de la deuxième colonne ».
 *   · LA COHÉRENCE. Signal, opportunité, recommandation, contrat, suivi : tous ont leur fiche. La
 *     piste était le seul objet du cycle à ne pas en avoir, et c'est ce que Michel remarque.
 *
 * ══ LA MISE EN PAGE SUIT LA RÈGLE DU 31/08 ══
 *
 * Plus de volet gauche : les objets liés — compte, contact, opportunité — vivent dans un onglet.
 * Le bandeau porte l'état et le geste qui suit, au-dessus de tout onglet.
 */

type CleOnglet = 'piste' | 'rattachements' | 'fichiers'

export default function PisteDetail() {
  const { id } = useParams<{ id: string }>()
  const ouvrirEmail = useOuvrirEmail()
  const navigate = useNavigate()
  const goBack = useGoBack('/prospection')
  const canManage = useCanManage()

  const { data: piste, isLoading } = usePiste(id)
  const { data: actions } = useActionsParPiste(id)
  // 8 942 interactions sont rattachées à des pistes depuis l'import des leads du 01/09/2026,
  // et aucun écran ne les montrait : le flux recevait `interactions={[]}` en dur.
  const { data: interactions } = useInteractionsParPiste(id)
  const { data: documents } = useDocumentsParEntites(id ? [id] : undefined)
  const { data: typesDocumentsRef } = useReferenceTable('types_documents')
  const { data: statuts } = useStatutsOpportunites()
  const { data: statutsPistes } = useStatutsPistes()
  const { data: profils } = useProfilsAdmin()
  const maj = useMajPiste()
  const cocher = useCompleteAction()
  const televerser = useTeleverserDocuments()
  const convertir = useConvertirPisteEnOpportunite()

  const [onglet, setOnglet] = useState<CleOnglet>('piste')
  const [tacheOuverte, setTacheOuverte] = useState(false)
  const [conversionOuverte, setConversionOuverte] = useState(false)
  /* Le motif attend d'être saisi : `null` quand la boîte est fermée, une chaîne (même vide) quand
     elle est ouverte. Distinguer les deux évite de rouvrir la boîte à chaque rendu. */
  const [disqualification, setDisqualification] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  function signaler(m: string) {
    setToast(m)
    setTimeout(() => setToast(null), 2600)
  }

  if (isLoading) return <div className="p-6 text-km-body text-km-faint">Chargement…</div>
  if (!piste) return <div className="p-6 text-km-body text-km-faint">Piste introuvable.</div>

  const convertie = Boolean(piste.opportunite_id)
  const documentsDeLaPiste = (documents ?? []).filter((d) => d.entite_type === 'piste')

  const ONGLETS: { cle: CleOnglet; libelle: string; badge?: string }[] = [
    { cle: 'piste', libelle: 'Piste' },
    { cle: 'rattachements', libelle: 'Rattachements' },
    { cle: 'fichiers', libelle: 'Fichiers', badge: documentsDeLaPiste.length ? String(documentsDeLaPiste.length) : undefined },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar crumb="Pistes" title={piste.societe || piste.contact_nom || 'Piste'} />

      {/* ══ LE BANDEAU : L'ÉTAT ET LE GESTE QUI SUIT ══ */}
      <div className="flex flex-none flex-wrap items-center gap-3 border-b border-km-line bg-white px-4 py-3 sm:px-6">
        <Button variant="ghost" size="icon" onClick={goBack} title="Retour aux pistes">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-indigo-50 text-indigo-600">
          <Filter className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-km-title font-bold text-km-text">
              {piste.societe || 'Société inconnue'}
            </p>
            {/* LE STATUT D'ABORD, LES VÉRIFICATIONS ENSUITE. Naoëlle, 02/09/2026 : « pour les
                pistes, il faudrait leur mettre leur statut ». La pastille ne portait que le compte
                des cinq contrôles — utile, mais ce n'est pas un statut : une piste peut être
                disqualifiée avec cinq coches, ou nouvelle avec zéro. Les deux se lisent maintenant
                côte à côte, et ils ne disent pas la même chose. */}
            <Badge tone={TON_STATUT_PISTE[piste.statut_code ?? ''] ?? 'neutral'}>
              {piste.statut_libelle ?? 'Sans statut'}
            </Badge>
          </div>
          <p className="truncate text-km-body text-km-muted">
            {piste.reference && <span className="font-mono text-km-faint">{piste.reference} · </span>}
            {piste.contact_nom || 'Contact inconnu'}
          </p>
          {/* LE PROPRIÉTAIRE S'AFFICHE ENFIN. William, 14/09/2026 : « il faut que les pistes
              récupèrent leur propriétaire car actuellement il n'y en a pas ». Vérifié : les 5 131
              pistes reprises ont toutes le leur, à l'identique de Salesforce — aucun écran ne le
              montrait, voilà tout. Il se lit ici, et se reprend depuis l'onglet Piste. */}
          <p className="truncate text-km-xs text-km-faint">
            Propriétaire : {piste.proprietaire_nom || 'Aucun'}
          </p>
        </div>

        {/* ══ LE STATUT SE CHANGE ICI ══
            CONVERTIE NE S'OFFRE PAS DANS LA LISTE : elle se gagne en créant l'opportunité, et le
            déclencheur `trg_piste_convertie_statut` l'écrit alors tout seul. La proposer au menu
            laisserait marquer « convertie » une piste qui n'a produit aucune opportunité — un statut
            qui affirme un fait qui n'existe pas.
            DISQUALIFIÉE DEMANDE SON MOTIF, et c'est la demande de Naoëlle : « mettre un commentaire
            pour disqualifié ». Écarter une piste sans dire pourquoi perd l'information qui servira à
            ne pas la rappeler dans six mois. */}
        {canManage && !convertie && (
          <MenuChoix
            valeur={piste.statut_id ?? ''}
            onChange={(id) => {
              const cible = statutsPistes?.find((st) => st.id === id)
              if (!cible) return
              if (cible.code === 'DISQUALIFIEE') {
                setDisqualification(piste.motif_disqualification ?? '')
                return
              }
              maj
                .mutateAsync({
                  id: piste.id,
                  /* SORTIR DE DISQUALIFIÉE EFFACE LE MOTIF : il décrivait une mise à l'écart qui
                     n'a plus lieu. Le laisser ferait lire « disqualifiée pour… » sur une piste
                     redevenue à travailler — le défaut exact des recommandations rouvertes qui
                     gardaient leur finalité. */
                  patch: { statut_id: id, motif_disqualification: null },
                })
                .then(() => signaler(`✓ ${cible.libelle}`))
                .catch((e) => signaler(e instanceof Error ? e.message : 'Enregistrement impossible'))
            }}
            ariaLabel="Changer le statut de la piste"
            choix={(statutsPistes ?? [])
              .filter((st) => st.code !== 'CONVERTIE')
              .map((st) => ({ valeur: st.id, libelle: st.libelle }))}
          />
        )}

        {/* LE GESTE QUI SUIT, ET RIEN D'AUTRE. Une piste convertie mène à son opportunité ; une piste
            mûre se convertit ; une piste incomplète dit ce qui manque, plus bas. */}
        {convertie ? (
          <Link to={`/opportunites/${piste.opportunite_id}`}>
            <Button variant="outline">
              Ouvrir l’opportunité
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        ) : (
          canManage && (
            <Button onClick={() => setConversionOuverte(true)}>
              Créer l’opportunité
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )
        )}
      </div>

      {/* ══ LES ONGLETS ══ */}
      <div className="grid flex-none grid-cols-1 border-b border-km-line bg-km-surface lg:grid-cols-fiche-activite">
        <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto px-4 pt-2.5 sm:px-6">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            type="button"
            onClick={() => setOnglet(o.cle)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-km-body font-semibold transition-colors',
              onglet === o.cle
                ? 'border-km-green text-km-text'
                : 'border-transparent text-km-muted hover:text-km-text',
            )}
          >
            {o.libelle}
            {o.badge && (
              <span className="rounded-km-sm bg-km-soft px-1.5 py-px text-km-tiny font-bold tabular-nums text-km-muted">
                {o.badge}
              </span>
            )}
          </button>
        ))}
        </div>
        <div className="hidden items-center border-b-2 border-km-piste px-3 lg:flex">
          <span className="truncate text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
            Activité · piste
          </span>
        </div>
      </div>

      {/* DEUX COLONNES, LE GABARIT DE L'OPPORTUNITE.
          Naoelle, 01/09/2026 : « affiche-la dans le style de l'objet opportunite avec le flux
          d'actualite a droite ». Le flux mele l'historique des modifications et les taches dans
          l'ordre du temps : sur une piste, il raconte qui a verifie quoi et quand. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-fiche-activite">
        <div className="min-h-0 overflow-y-auto bg-km-bg p-4 sm:p-5">
        {onglet === 'piste' && (
          <div className="flex flex-col gap-3.5">
            {/* ══ LA FRISE DE STATUT ══════════════════════════════════════════════════════════════

                Naoëlle, 02/09/2026 : « où est la frise animée de statut dans la page piste, je
                t'avais dit de la mettre ».

                ELLE NE SE CONTREDIT PAS AVEC SA DEMANDE DU MATIN, et c'est moi qui avais confondu
                les deux objets. « Les 5 points de vérification, faut les transformer en une liste
                de coches, car en mode frise on dirait des statuts » : les cinq contrôles ne sont
                pas des statuts, donc pas de frise pour eux — ils sont devenus des coches, plus bas.
                Le STATUT de la piste, lui, en est un vrai, et c'est justement ce qu'une frise sait
                dire. J'avais retiré la frise sans la remettre là où elle avait sa place.

                TROIS JALONS, DEUX ISSUES. `statuts_pistes` porte cinq lignes dont deux clôturent.
                Les trois états de travail — Nouvelle, En cours de qualification, En attente de
                facture — font les jalons ; l'issue ferme la frise, verte si convertie, rouge si
                disqualifiée (William, 15/09/2026 — voir l'en-tête du fichier, il renverse un choix
                antérieur).

                LES JALONS NE SONT PAS ÉCRITS EN DUR : la frise lit `statuts_pistes` et prend tout ce
                qui ne clôture pas, dans l'ordre du référentiel. « En attente de facture » y est
                apparue sans qu'une ligne de ce fichier la nomme — c'est ce qui permettra d'en
                intercaler une autre sans repasser ici.

                CLIQUABLE, comme sur la fiche Requête. Mais « Convertie » ne s'atteint pas d'un
                clic — elle se gagne en créant l'opportunité, et le déclencheur l'écrit — et
                « Disqualifiée » passe par le menu, qui réclame son motif. La frise ne commande donc
                que les deux jalons de travail : ce qu'on peut décider seul. */}
            {statutsPistes && statutsPistes.length > 0 && (
              <Card className="px-4 pb-1 pt-1">
                <FriseStatut
                  teinte="piste"
                  jalons={statutsPistes
                    .filter((st) => !st.est_cloture)
                    .map((st) => ({ code: st.code, libelle: st.libelle }))}
                  courant={
                    piste.statut_clos
                      ? (statutsPistes.find((st) => !st.est_cloture)?.code ?? 'NOUVELLE')
                      : piste.statut_code ?? 'NOUVELLE'
                  }
                  /* L'ISSUE FERME LA FRISE : verte si convertie, ROUGE si disqualifiée — « perdue »
                     au sens de la frise. Elle était rendue neutre ; voir l'en-tête du fichier pour
                     l'argument d'origine et la décision de William du 15/09/2026 qui le renverse. */
                  finalite={
                    piste.statut_clos
                      ? {
                          libelle: piste.statut_libelle ?? 'Clôturée',
                          perdue: piste.statut_code === 'DISQUALIFIEE',
                          neutre: false,
                        }
                      : null
                  }
                  onJalon={
                    canManage && !convertie && !piste.statut_clos
                      ? (code) => {
                          const cible = statutsPistes.find((st) => st.code === code)
                          if (!cible || cible.code === piste.statut_code) return
                          maj
                            .mutateAsync({
                              id: piste.id,
                              patch: { statut_id: cible.id, motif_disqualification: null },
                            })
                            .then(() => signaler(`✓ ${cible.libelle}`))
                            .catch((e) =>
                              signaler(e instanceof Error ? e.message : 'Enregistrement impossible'),
                            )
                        }
                      : undefined
                  }
                />
              </Card>
            )}
            {/* ══ LES CINQ VÉRIFICATIONS SONT PARTIES, ET LE VERROU AVEC ══

                William, 15/09/2026 : « supprime le bloc "Avant de lancer l'opportunité" ». Puis, mis
                devant la conséquence — c'était le SEUL endroit où cocher les cinq contrôles, et le
                bouton « Créer l'opportunité » restait grisé tant qu'ils n'étaient pas faits :
                « supprimer le verrou aussi ».

                LES DEUX PARTENT ENSEMBLE OU AUCUN. Retirer la carte en laissant le verrou aurait
                rendu la conversion impossible depuis cette page, sans que rien ne dise pourquoi le
                bouton reste gris — la panne la plus coûteuse à diagnostiquer, celle qui ressemble à
                un écran normal.

                CE QUI SURVIT : les cinq colonnes restent en base, et la liste Prospection continue
                de les lire pour dire ce qui manque sur une piste. Ce n'est plus une barrière, c'est
                une information. */}
            {/* ══ LES COORDONNÉES, MODIFIABLES ══
                Le panneau ne les montrait qu'en lecture. Une piste se corrige pendant l'appel — un
                e-mail mal orthographié est justement ce que les cinq vérifications cherchent. */}
            <Card className="p-4">
              <p className="mb-2.5 text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
                Coordonnées
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InlineField
                  variant="text" label="Société" emptyLabel="ajouter"
                  value={piste.societe ?? ''} disabled={!canManage}
                  onCommit={(v: string) => maj.mutateAsync({ id: piste.id, patch: { societe: v.trim() || null } })}
                  onSaved={() => signaler('✓ enregistré')}
                  onError={(e: Error) => signaler(`Erreur : ${e.message}`)}
                />
                {/* LE NOM SE LIT ENTIER ET SE MODIFIE EN TROIS (Naoëlle, 14/09/2026). Un champ
                    unique redonnait « Evelyne Tixier » à corriger d'un seul tenant : on recollait
                    ce qu'on venait de séparer, et la civilité se perdait au passage.

                    `contact_nom` SUIT LES TROIS ET NE SE SAISIT PLUS. La colonne reste — elle porte
                    le `Name` de Salesforce sur les 5 139 pistes reprises, et la recherche, les
                    cartes du kanban et la conversion la lisent encore. La laisser diverger des trois
                    champs ferait afficher un nom ici et un autre dans la liste. */}
                <InlineIdentite
                  label="Contact"
                  valeur={{ civilite: piste.civilite, prenom: piste.prenom, nom: piste.nom }}
                  disabled={!canManage}
                  onCommit={(v) => maj.mutateAsync({
                    id: piste.id,
                    patch: {
                      civilite: v.civilite,
                      prenom: v.prenom,
                      nom: v.nom,
                      contact_nom: [v.prenom, v.nom].filter(Boolean).join(' ') || null,
                    },
                  })}
                  onSaved={() => signaler('✓ enregistré')}
                  onError={(e: Error) => signaler(`Erreur : ${e.message}`)}
                />
                <InlineField
                  variant="text" label="E-mail" emptyLabel="ajouter"
                  value={piste.email ?? ''} disabled={!canManage}
                  onCommit={(v: string) => maj.mutateAsync({ id: piste.id, patch: { email: v.trim() || null } })}
                  onSaved={() => signaler('✓ enregistré')}
                  onError={(e: Error) => signaler(`Erreur : ${e.message}`)}
                />
                <InlineField
                  variant="text" label="Téléphone" emptyLabel="ajouter"
                  value={piste.telephone ?? ''} disabled={!canManage}
                  onCommit={(v: string) => maj.mutateAsync({ id: piste.id, patch: { telephone: v.trim() || null } })}
                  onSaved={() => signaler('✓ enregistré')}
                  onError={(e: Error) => signaler(`Erreur : ${e.message}`)}
                />
                {/* LA PISTE SE REPREND, comme un compte ou un contrat : un commercial en vacances
                    ne doit pas immobiliser ses 1 688 pistes. Même geste que partout ailleurs. */}
                <InlineField
                  variant="select" label="Propriétaire" emptyLabel="aucun"
                  value={piste.proprietaire_id ?? ''} disabled={!canManage}
                  options={[
                    { value: '', label: 'Aucun' },
                    ...(profils ?? []).map((p) => ({ value: p.id, label: `${p.prenom} ${p.nom}` })),
                  ]}
                  onCommit={(v: string) => maj.mutateAsync({ id: piste.id, patch: { proprietaire_id: v || null } })}
                  onSaved={() => signaler('✓ enregistré')}
                  onError={(e: Error) => signaler(`Erreur : ${e.message}`)}
                />
              </div>
              {(piste.email || piste.telephone) && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-km-line pt-2.5">
                  {/* PLUS DE `href="tel:"` ICI. C'était le dernier de l'application, et il envoyait
                      le clic au système d'exploitation : sur un PC, Chrome ouvre « Sélectionner une
                      application » et n'a jamais entendu parler d'Allo. Naoëlle l'a revu le
                      08/09/2026 — « ça veut ouvrir une app sur mon PC alors que c'est pas du tout ce
                      qu'on a dit ». Le bouton passe désormais par l'entonnoir unique, qui dépose le
                      numéro dans la file d'appel Allo de la personne connectée et n'utilise `tel:`
                      que sur un appareil tactile, où il compose vraiment. */}
                  {piste.telephone && (
                    <button
                      type="button"
                      onClick={() => { void appelerNumero(piste.telephone, {
                        nom: piste.contact_nom ?? undefined,
                        societe: piste.societe ?? undefined,
                      }) }}
                      className="inline-flex items-center gap-1.5 rounded-km border border-km-line bg-km-surface px-2.5 py-1.5 text-km-label font-semibold text-km-muted hover:bg-km-soft hover:text-km-text"
                    >
                      <Phone className="h-3 w-3" /> Appeler
                    </button>
                  )}
                  {/* Le mail s'écrit dans le volet de Kimatch, pas dans le client de messagerie
                      du poste (William, 13/09/2026). Il notait ici que le volet ne connaissait pas
                      la piste : `ContexteEmail` n'avait pas de `pisteId`, et l'échange se consignait
                      donc sur la seule adresse — invisible depuis la fiche d'où on venait de
                      l'écrire. C'est comblé le 14/09 : la piste part avec le mail, et le fil Gmail
                      est enregistré au retour, si bien que l'envoi rejoint la conversation. */}
                  {piste.email && (
                    <button
                      type="button"
                      onClick={() => ouvrirEmail?.({
                        a: piste.email!,
                        nom: piste.contact_nom,
                        pisteId: piste.id,
                        compteId: piste.compte_id ?? undefined,
                      })}
                      className="inline-flex items-center gap-1.5 rounded-km border border-km-line bg-km-surface px-2.5 py-1.5 text-km-label font-semibold text-km-muted hover:bg-km-soft hover:text-km-text"
                    >
                      <Mail className="h-3 w-3" /> Écrire
                    </button>
                  )}
                </div>
              )}
            </Card>

            {/* TOUT CE QUE SALESFORCE SAIT, sous les coordonnées. William, 14/09/2026 : « récupérez
                tout sans exception, on fera le tri dans Kimatch ». La moitié de ces champs était
                déjà en base et invisible — segment, SIREN, SIRET, origine, activité — l'autre
                moitié est arrivée avec la migration 20260914170000. */}
            <DetailsPiste piste={piste} />

            <Card className="p-4">
              <p className="mb-2 text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
                Commentaire
              </p>
              <InlineField
                variant="longtext" label="" emptyLabel="aucun"
                value={piste.commentaire ?? ''} disabled={!canManage}
                onCommit={(v: string) => maj.mutateAsync({ id: piste.id, patch: { commentaire: v.trim() || null } })}
                onSaved={() => signaler('✓ enregistré')}
                onError={(e: Error) => signaler(`Erreur : ${e.message}`)}
              />
            </Card>

            {/* ══ LES TÂCHES ══
                Elles existent depuis le 31/08/2026 (`actions.piste_id`). C'est précisément ce qui
                justifiait de donner une adresse à la piste : une tâche renvoie ici. */}
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
                  Tâches{actions && actions.length > 0 ? ` (${actions.length})` : ''}
                </p>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setTacheOuverte(true)}
                    className="inline-flex items-center gap-1 text-km-label font-bold text-indigo-600 hover:underline"
                  >
                    <Plus className="h-3 w-3" /> Nouvelle tâche
                  </button>
                )}
              </div>
              {!actions || actions.length === 0 ? (
                <p className="text-km-label text-km-faint">
                  Aucune tâche. Un rappel à poser avant de relancer ce contact se note ici.
                </p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {actions.map((t) => {
                    /* « Faite » se lit sur `date_realisation` : cocher n'écrit que cette date, le
                       code de statut reste A_FAIRE en base. */
                    const faite = Boolean(t.date_realisation)
                    const enRetard =
                      !faite && t.echeance && estEnRetard(t.echeance)
                    return (
                      <div key={t.id} className="flex items-start gap-2 rounded-km px-1 py-1 hover:bg-km-soft">
                        <button
                          type="button"
                          disabled={faite || cocher.isPending || !canManage}
                          onClick={async () => {
                            try {
                              await cocher.mutateAsync(t.id)
                              signaler('✓ Tâche terminée')
                            } catch (e) {
                              signaler(e instanceof Error ? e.message : 'Enregistrement impossible')
                            }
                          }}
                          title={faite ? 'Tâche terminée' : 'Marquer comme faite'}
                          className={cn(
                            'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded',
                            faite ? 'bg-km-green text-white' : 'border border-km-line bg-white hover:border-km-green',
                          )}
                        >
                          {faite && <Check className="h-2.5 w-2.5" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={cn('truncate text-km-body', faite ? 'text-km-faint line-through' : 'text-km-text')}>
                            {t.titre}
                          </p>
                          <p className="truncate text-km-label text-km-faint">
                            {t.type_action}
                            {t.echeance && (
                              <span className={cn(enRetard && 'font-bold text-km-red')}>
                                {' · '}{echeanceLisible(t.echeance)}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
            {/* L'HISTORIQUE DES MODIFICATIONS REPREND SA PLACE ICI. Il vivait dans le flux
                d'actualité du volet, remplacé le 07/09/2026 par le fil d'activité — lequel montre
                les échanges, pas les changements de champs. Les fiches Compte, Site, Contact,
                Opportunité et Requête le proposent déjà sous cette forme discrète ; la piste était
                la seule à ne l'avoir nulle part ailleurs. */}
            <HistoriqueDiscret tableNom="pistes" ligneId={piste.id} />
          </div>
        )}

        {onglet === 'rattachements' && (
          <div className="flex max-w-[560px] flex-col gap-3.5">
            <Card className="p-4">
              <p className="mb-2 text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
                Ce à quoi cette piste est rattachée
              </p>
              {/* Une piste NAÎT sans rattachement : c'est un contact qu'on ne connaît pas encore.
                  Le compte et le contact apparaissent à la conversion, quand le dialogue les crée ou
                  les retrouve. Dire « pas encore » vaut mieux qu'une ligne vide. */}
              <div className="flex flex-col divide-y divide-km-line-soft">
                <Rattachement
                  icone={Building2} libelle="Compte"
                  valeur={piste.compte_id ? 'ouvrir le compte' : null}
                  to={piste.compte_id ? `/comptes/${piste.compte_id}` : undefined}
                />
                <Rattachement
                  icone={User} libelle="Contact"
                  valeur={piste.contact_id ? 'ouvrir le contact' : null}
                  to={piste.contact_id ? `/contacts/${piste.contact_id}` : undefined}
                />
                <Rattachement
                  icone={ArrowRight} libelle="Opportunité issue de cette piste"
                  valeur={piste.opportunite_id ? 'ouvrir l’opportunité' : null}
                  to={piste.opportunite_id ? `/opportunites/${piste.opportunite_id}` : undefined}
                />
              </div>
            </Card>
          </div>
        )}

        {onglet === 'fichiers' && (
          <div className="max-w-[900px]">
            <OngletFichiers
              documents={documentsDeLaPiste}
              typesDocuments={typesDocumentsRef ?? []}
              onOuvrir={(d) => navigate(`/documents/${d.id}`)}
              onDeposer={async (fichiers, typeId) => {
                await televerser.mutateAsync({
                  fichiers,
                  entite_type: 'piste',
                  entite_id: piste.id,
                  type_document_id: typeId,
                  type_document_libelle:
                    (typesDocumentsRef ?? []).find((t) => t.id === typeId)?.libelle ?? '',
                })
                signaler('✓ Fichier déposé')
              }}
              nomEntite={piste.societe || piste.contact_nom || 'cette piste'}
            />
          </div>
        )}
        </div>

        {/* ══ LE VOLET D'ACTIVITÉ, AU MODÈLE DE LA FICHE RECOMMANDATION ══
            William, 07/09/2026 : « les fiches Opportunité, Piste, Requête et Suivi de contrat
            doivent avoir exactement les mêmes fonctionnalités et la même logique ».

            `FluxActualite` montrait l'historique des modifications de la piste ; `ActivityFeed`
            montre ses ÉCHANGES, ses tâches et ses documents — et les 8 942 interactions rattachées
            aux pistes, qui n'apparaissaient nulle part. L'historique des modifications n'est pas
            perdu : il reprend sa place sous l'onglet Piste, par le contrôle discret. */}
        <div className="hidden min-h-0 flex-col border-l border-km-line bg-km-bg lg:flex">
          <div className="min-h-0 flex-1 overflow-hidden px-3 pb-3 pt-4 sm:pt-5">
            <ActivityFeed
              compteId={piste.compte_id ?? ''}
              compteNom={piste.societe ?? ''}
              interactions={interactions ?? []}
              actions={actions ?? []}
              documents={documentsDeLaPiste}
              pisteId={piste.id}
              rattachementTache={
                canManage
                  ? {
                      piste_id: piste.id,
                      contact_nom: piste.contact_nom ?? '',
                      compte_id: piste.compte_id ?? null,
                      objet_nom: (piste.societe || piste.contact_nom || '').trim(),
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </div>

      {tacheOuverte && (
        <DialogNouvelleTache
          open
          onClose={() => setTacheOuverte(false)}
          signaler={signaler}
          rattachement={{
            piste_id: piste.id,
            contact_nom: piste.contact_nom ?? '',
            objet_nom: (piste.societe || piste.contact_nom || '').trim(),
          }}
        />
      )}

      {/* ══ LE MOTIF DE DISQUALIFICATION ══
          Une seule zone de texte et deux boutons : le motif est obligatoire pour valider, parce que
          « disqualifiée » sans raison ne se relit pas. La colonne existe depuis l'import des leads
          (`motif_disqualification`, 01/09) et portait déjà les motifs venus de Salesforce. */}
      {disqualification !== null && (
        <Dialog
          open
          onClose={() => setDisqualification(null)}
          title="Disqualifier cette piste"
          description="Pourquoi l’écarter ? C’est ce qu’on relira si son nom revient dans une prochaine liste."
        >
          <Textarea
            value={disqualification}
            onChange={(e) => setDisqualification(e.target.value)}
            rows={3}
            placeholder="Ne gère pas l’énergie · déjà chez un courtier · injoignable après cinq appels…"
            autoFocus
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDisqualification(null)}>Annuler</Button>
            <Button
              disabled={!disqualification.trim()}
              onClick={() => {
                const cible = statutsPistes?.find((st) => st.code === 'DISQUALIFIEE')
                if (!cible) return
                maj
                  .mutateAsync({
                    id: piste.id,
                    patch: { statut_id: cible.id, motif_disqualification: disqualification.trim() },
                  })
                  .then(() => { setDisqualification(null); signaler('✓ Piste disqualifiée') })
                  .catch((e) => signaler(e instanceof Error ? e.message : 'Enregistrement impossible'))
              }}
            >
              Disqualifier
            </Button>
          </div>
        </Dialog>
      )}

      {conversionOuverte && (
        <DialogConversionPiste
          piste={piste}
          onFermer={() => setConversionOuverte(false)}
          onValide={async (signal, contactId, compteId) => {
            try {
              const nouvelleId = await convertir.mutateAsync({
                piste,
                statutNouvelleId: statuts?.find((s) => s.code === 'NOUVELLE')?.id ?? null,
                signal,
                contactId,
                compteId,
              })
              setConversionOuverte(false)
              navigate(`/opportunites/${nouvelleId}`)
            } catch (e) {
              signaler(e instanceof Error ? e.message : 'Conversion impossible')
            }
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-km bg-ink-800 px-3.5 py-2 text-km-body text-white shadow-km-pop">
          {toast}
        </div>
      )}
    </div>
  )
}

/** Une ligne de l'onglet Rattachements, avec navigation directe vers l'objet. */
function Rattachement({ icone: Icone, libelle, valeur, to }: {
  icone: typeof Building2
  libelle: string
  valeur: string | null
  to?: string
}) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-km-soft text-km-muted">
        <Icone className="h-3 w-3" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-km-label uppercase tracking-wide text-km-faint">{libelle}</p>
        {valeur && to ? (
          <EntityLink to={to}>{valeur}</EntityLink>
        ) : (
          <p className="text-km-body text-km-faint">pas encore rattaché</p>
        )}
      </div>
    </div>
  )
}
