import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Building2, Check, Filter, Mail, Phone, Plus, User } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EntityLink } from '@/components/ui/entity-link'
import { InlineField } from '@/components/ui/inline-field'
import { OngletFichiers } from '@/components/compte/OngletFichiers'
import { DialogConversionPiste } from '@/components/prospection/DialogConversionPiste'
import { DialogNouvelleTache } from '@/components/tache/DialogNouvelleTache'
import { FluxActualite } from '@/components/opportunite/FluxActualite'
import { useGoBack } from '@/lib/useGoBack'
import { useCanManage } from '@/lib/data/roles'
import { useActionsParPiste, useCompleteAction } from '@/lib/data/actions'
import { useDocumentsParEntites, useTeleverserDocuments } from '@/lib/data/documents'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useStatutsOpportunites } from '@/lib/data/opportunites'
import {
  usePiste, useMajPiste, useConvertirPisteEnOpportunite, useStatutsPistes,
  VALIDATIONS_PISTE, pisteQualifiee,
} from '@/lib/data/prospection'
import { MenuChoix } from '@/components/ui/menu-choix'
import { Dialog } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/form'
import { echeanceLisible } from '@/lib/heureTache'
import { cn } from '@/lib/utils'

/**
 * LES TONS DES QUATRE STATUTS DE `statuts_pistes`.
 *
 * DISQUALIFIÉE N'EST PAS ROUGE. Écarter une piste est un travail fait, pas un échec : sur cinq mille
 * pistes importées, en écarter est l'issue normale de la majorité. Le rouge est réservé à ce qui
 * appelle une action ; ici il n'y a plus rien à faire. Convertie est verte parce qu'elle a produit
 * une affaire.
 */
const TON_STATUT_PISTE: Record<string, 'kiwi' | 'amber' | 'neutral'> = {
  NOUVELLE: 'amber',
  EN_QUALIFICATION: 'amber',
  CONVERTIE: 'kiwi',
  DISQUALIFIEE: 'neutral',
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
  const navigate = useNavigate()
  const goBack = useGoBack('/prospection')
  const canManage = useCanManage()

  const { data: piste, isLoading } = usePiste(id)
  const { data: actions } = useActionsParPiste(id)
  const { data: documents } = useDocumentsParEntites(id ? [id] : undefined)
  const { data: typesDocumentsRef } = useReferenceTable('types_documents')
  const { data: statuts } = useStatutsOpportunites()
  const { data: statutsPistes } = useStatutsPistes()
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

  const mure = pisteQualifiee(piste)
  const faites = VALIDATIONS_PISTE.filter((v) => Boolean(piste[v.cle])).length
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
            {!piste.statut_clos && (
              <Badge tone={mure ? 'kiwi' : 'amber'}>{faites}/5 vérifications</Badge>
            )}
          </div>
          <p className="truncate text-km-body text-km-muted">
            {piste.reference && <span className="font-mono text-km-faint">{piste.reference} · </span>}
            {piste.contact_nom || 'Contact inconnu'}
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
          <Button variant="outline" onClick={() => navigate(`/opportunites/${piste.opportunite_id}`)}>
            Ouvrir l’opportunité
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        ) : (
          canManage && (
            <Button disabled={!mure} onClick={() => setConversionOuverte(true)}>
              Créer l’opportunité
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )
        )}
      </div>

      {/* ══ LES ONGLETS ══ */}
      <div className="flex flex-none items-center gap-0.5 overflow-x-auto border-b border-km-line bg-km-surface px-4 pt-2.5 sm:px-6">
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

      {/* DEUX COLONNES, LE GABARIT DE L'OPPORTUNITE.
          Naoelle, 01/09/2026 : « affiche-la dans le style de l'objet opportunite avec le flux
          d'actualite a droite ». Le flux mele l'historique des modifications et les taches dans
          l'ordre du temps : sur une piste, il raconte qui a verifie quoi et quand. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-h-0 overflow-y-auto bg-km-bg p-4 sm:p-5">
        {onglet === 'piste' && (
          <div className="flex flex-col gap-3.5">
            {/* ══ LES CINQ VÉRIFICATIONS ══
                Elles se figent après conversion : décocher une case après coup ne déferait rien et
                laisserait deux objets qui se contredisent. */}
            {/* ══ LES CINQ VÉRIFICATIONS, EN LISTE DE COCHES ══
                Naoëlle, 02/09/2026 : « les 5 points de vérification avant de lancer une opportunité,
                faut les transformer en une liste de coches, car en mode frise on dirait des
                statuts ».

                ELLE A RAISON, ET C'EST MOI QUI AVAIS MAL LU. Elle avait demandé le 01/09 « une frise
                de statut animée », puis corrigé le même jour : « qu'il puisse cocher dans n'importe
                quel ordre, pas forcément une frise chronologique, mais une ligne avec des coches ».
                J'ai gardé la frise en lui ajoutant un état par jalon — techniquement juste, visuellement
                faux. Une frise DESSINE un parcours : des pastilles alignées reliées par des segments
                se lisent comme des étapes qui se succèdent, et le lecteur cherche laquelle vient
                après. Ces cinq contrôles n'ont pas d'ordre : on vérifie l'e-mail avant ou après le
                portable, selon ce que le client dit au téléphone.

                UNE LISTE DE COCHES NE PROMET AUCUN ORDRE. Cinq lignes, cinq cases, chacune
                indépendante — c'est exactement ce que les données disent : cinq booléens sans
                relation entre eux. La coche s'anime au clic et la barre de progression donne
                l'élan qu'elle voulait, sans mentir sur la nature de la chose. */}
            <Card className="p-4">
              <div className="mb-2.5 flex items-center justify-between">
                <p className="text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
                  Avant de lancer l’opportunité
                </p>
                <span className={cn('text-km-label font-bold tabular-nums', mure ? 'text-km-green' : 'text-km-amber')}>
                  {faites}/5
                </span>
              </div>

              {/* LA BARRE PORTE L'ÉLAN, PAS LES COCHES. C'est ce que la frise apportait vraiment —
                  « ça rendra bien et ça motivera les commerciaux » — et une barre le fait sans
                  suggérer un ordre entre les cinq contrôles. */}
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-km-soft">
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-500 ease-out',
                    mure ? 'bg-km-green' : 'bg-km-amber',
                  )}
                  style={{ width: `${(faites / VALIDATIONS_PISTE.length) * 100}%` }}
                />
              </div>

              <div className="flex flex-col gap-0.5">
                {VALIDATIONS_PISTE.map((v) => {
                  const coche = Boolean(piste[v.cle])
                  const figee = convertie || !canManage
                  return (
                    <button
                      key={v.cle}
                      type="button"
                      disabled={figee}
                      onClick={() => {
                        maj
                          .mutateAsync({ id: piste.id, patch: { [v.cle]: !coche } })
                          .catch((e) => signaler(e instanceof Error ? e.message : 'Enregistrement impossible'))
                      }}
                      className={cn(
                        'flex items-center gap-2.5 rounded-km px-1.5 py-2 text-left transition-colors',
                        figee ? 'cursor-default' : 'hover:bg-km-soft',
                      )}
                    >
                      {/* LA CASE S'ANIME AU CLIC : le fond se remplit et la coche apparaît. C'est le
                          « coches animées » de sa demande du 01/09, qui vaut toujours. */}
                      <span
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border transition-all duration-200',
                          coche
                            ? 'scale-100 border-km-green bg-km-green text-white'
                            : 'border-km-line bg-km-surface text-transparent',
                        )}
                      >
                        <Check className={cn('h-3.5 w-3.5 transition-transform duration-200', coche ? 'scale-100' : 'scale-50')} />
                      </span>
                      <span
                        className={cn(
                          'text-km-body transition-colors',
                          coche ? 'font-medium text-km-text' : 'text-km-muted',
                        )}
                      >
                        {v.libelle}
                      </span>
                    </button>
                  )
                })}
              </div>

              {!mure && !convertie && (
                <p className="mt-2.5 border-t border-km-line pt-2.5 text-km-label leading-snug text-km-faint">
                  Cochez dans l’ordre que vous voulez : ces cinq points n’en ont pas. Les cinq doivent
                  être faits — sans eux, on ouvrirait une affaire sur un contact qu’on ne sait pas
                  joindre.
                </p>
              )}
              {convertie && (
                <p className="mt-2.5 border-t border-km-line pt-2.5 text-km-label text-km-faint">
                  Les vérifications sont figées : la piste a produit son opportunité.
                </p>
              )}
            </Card>

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
                <InlineField
                  variant="text" label="Contact" emptyLabel="ajouter"
                  value={piste.contact_nom ?? ''} disabled={!canManage}
                  onCommit={(v: string) => maj.mutateAsync({ id: piste.id, patch: { contact_nom: v.trim() || null } })}
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
              </div>
              {(piste.email || piste.telephone) && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-km-line pt-2.5">
                  {piste.telephone && (
                    <a
                      href={`tel:${piste.telephone}`}
                      className="inline-flex items-center gap-1.5 rounded-km border border-km-line bg-km-surface px-2.5 py-1.5 text-km-label font-semibold text-km-muted hover:bg-km-soft hover:text-km-text"
                    >
                      <Phone className="h-3 w-3" /> Appeler
                    </a>
                  )}
                  {piste.email && (
                    <a
                      href={`mailto:${piste.email}`}
                      className="inline-flex items-center gap-1.5 rounded-km border border-km-line bg-km-surface px-2.5 py-1.5 text-km-label font-semibold text-km-muted hover:bg-km-soft hover:text-km-text"
                    >
                      <Mail className="h-3 w-3" /> Écrire
                    </a>
                  )}
                </div>
              )}
            </Card>

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
                      !faite && t.echeance && t.echeance.slice(0, 10) < new Date().toISOString().slice(0, 10)
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

        {/* LE FLUX D'ACTUALITÉ, À DROITE — comme sur l'opportunité.
            Il mêle l'historique des modifications de la piste et ses tâches dans l'ordre du temps.
            Les INTERACTIONS n'y figurent pas : `interactions` n'a pas de colonne `piste_id`, une
            piste n'étant pas encore un contact au sens de la table. Passer une liste vide est
            honnête — le jour où le lien existera, il suffira de la remplir. */}
        <div className="hidden min-h-0 flex-col border-l border-km-line bg-white lg:flex">
          <div className="flex-none border-b border-km-line px-3.5 py-2.5">
            <p className="text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
              Flux d’actualité
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <FluxActualite
              tableNom="pistes"
              ligneId={piste.id}
              dateCreation={piste.date_creation}
              interactions={[]}
              actions={actions ?? []}
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
            libelle_cible: `la piste ${piste.societe || piste.contact_nom || ''}`.trim(),
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
