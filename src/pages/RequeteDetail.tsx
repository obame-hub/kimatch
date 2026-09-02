import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, LifeBuoy } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EntityLink } from '@/components/ui/entity-link'
import { InlineField } from '@/components/ui/inline-field'
import { MenuChoix } from '@/components/ui/menu-choix'
import { HistoriqueDiscret } from '@/components/ui/historique-discret'
import { OngletFichiers } from '@/components/compte/OngletFichiers'
import { FluxActualite } from '@/components/opportunite/FluxActualite'
import { useCanManage } from '@/lib/data/roles'
import { useDocumentsParEntites, useTeleverserDocuments } from '@/lib/data/documents'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { dateRelative, tonDate } from '@/lib/dateRelative'
import {
  useRequetes,
  useStatutsRequetes,
  useMajRequete,
  useTypesRequetes,
  CATEGORIES_REQUETE,
} from '@/lib/data/requetes'
import { cn } from '@/lib/utils'

/**
 * ══ FICHE REQUÊTE, SUR LE GABARIT DE LA FICHE OPPORTUNITÉ ══
 *
 * Naoëlle, 01/09/2026 : « on n'arrive pas à ouvrir une requête, quand on clique dessus rien ne se
 * passe », puis « donne la possibilité d'ajouter un document sur cet objet », puis « la page quand
 * on ouvre la requête ressemble à celle de l'opportunité ». La vue kanban de la liste, elle, ne
 * change pas — c'est la fiche seule qui s'aligne.
 *
 * LE DIAGNOSTIC DU CLIC : IL N'Y AVAIT RIEN À OUVRIR. Ni route `/requetes/:id`, ni page. La liste
 * portait des cartes qui se modifient en ligne, mais avec une ombre au survol — une promesse de clic
 * qui ne menait nulle part.
 *
 * ══ CE QUE « COMME L'OPPORTUNITÉ » VEUT DIRE, CONCRÈTEMENT ══
 *
 *   bandeau        flèche de retour, pastille de 40 px, la RÉFÉRENCE en gros chiffres tabulaires,
 *                  les pastilles d'état à côté, le compte en seconde ligne
 *   quatre onglets Requête · Rattachements · Fichiers · Historique
 *   deux colonnes  le contenu à gauche, le flux d'actualité à droite en 300 px
 *   édition        `InlineField` — on clique la valeur, on la corrige, elle s'enregistre. Pas de
 *                  formulaire à valider, pas de bouton « Enregistrer ».
 *
 * L'ÉDITION EN LIGNE REMPLACE MON PREMIER JET. J'avais mis une zone de texte et un bouton
 * « Enregistrer » pour la résolution : ça marchait, mais c'était le seul endroit de l'application
 * qui demandait de valider un champ à la main. Le geste doit être le même partout, sinon on hésite.
 *
 * ══ LES RATTACHEMENTS RESTENT EN LECTURE ══
 *
 * La liste garde son éditeur en cascade — compte → site → compteur → contact — où changer de site
 * libère le compteur, parce qu'un compteur d'un autre site ferait une paire incohérente. Recopier ce
 * comportement ici aurait donné deux versions d'une même règle, et la première divergence serait
 * passée inaperçue. L'onglet dit donc où aller les modifier, plutôt que de proposer un second
 * formulaire qui ne se comporterait pas pareil.
 */

type CleOnglet = 'requete' | 'rattachements' | 'fichiers' | 'historique'

/**
 * LES TONS DES QUATRE STATUTS DE `statuts_requetes`.
 *
 * Mes codes du premier jet étaient inventés — `EN_COURS`, `EN_ATTENTE` — et donc muets : la pastille
 * retombait sur le ton neutre pour deux des quatre états. Naoëlle a envoyé la capture de la table, et
 * les vrais codes sont ceux-ci, avec leur ordre : NOUVELLE 10, EN_TRAITEMENT 20, RESOLUE 30,
 * ABANDONNEE 40. La leçon est de lire la table de référence plutôt que de deviner ses codes.
 *
 * ABANDONNÉE N'EST PAS RÉSOLUE, et le ton le dit : une requête abandonnée est sortie du plan de
 * travail sans que le problème du client soit réglé. La peindre en vert, comme « résolue », ferait
 * lire un succès là où il n'y en a pas.
 */
const TON_STATUT: Record<string, 'kiwi' | 'amber' | 'neutral' | 'red'> = {
  NOUVELLE: 'amber',
  EN_TRAITEMENT: 'neutral',
  RESOLUE: 'kiwi',
  ABANDONNEE: 'neutral',
}


export default function RequeteDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const canManage = useCanManage()

  /* LA REQUÊTE EST PRISE DANS LA LISTE DÉJÀ CHARGÉE, et non relue seule. `useRequetes` porte la
     règle de visibilité — une requête sans compte reste visible, celles d'un compte qu'on ne voit
     pas sont retirées. Un second chemin de lecture aurait dupliqué cette règle, et deux copies d'une
     règle de visibilité finissent par diverger : l'une montrerait ce que l'autre cache. Le jour où
     l'objet comptera mille lignes, c'est `useRequete(id)` qu'il faudra écrire, en déplaçant la règle
     de visibilité avec lui. */
  const { data: requetes, isLoading } = useRequetes()
  const requete = requetes?.find((r) => r.id === id)

  const { data: statuts } = useStatutsRequetes()
  const { data: types } = useTypesRequetes()
  const { data: documents } = useDocumentsParEntites(id ? [id] : undefined)
  const { data: typesDocumentsRef } = useReferenceTable('types_documents')
  const maj = useMajRequete()
  const televerser = useTeleverserDocuments()

  const [onglet, setOnglet] = useState<CleOnglet>('requete')
  const [toast, setToast] = useState<string | null>(null)

  function signaler(m: string) {
    setToast(m)
    setTimeout(() => setToast(null), 2600)
  }
  const retourInline = {
    onSaved: () => signaler('✓ Enregistré'),
    onError: (e: Error) => signaler(e.message),
  }

  if (isLoading) return <div className="p-6 text-km-body text-km-faint">Chargement…</div>
  if (!requete) return <div className="p-6 text-km-body text-km-faint">Requête introuvable.</div>

  const majRequete = (patch: Parameters<typeof maj.mutateAsync>[0]['patch']) =>
    maj.mutateAsync({ id: requete.id, patch })

  const categorie = CATEGORIES_REQUETE.find((c) => c.code === requete.categorie)
  /* « CLOSE » SE LIT DANS LA TABLE, PAS DANS UNE LISTE ÉCRITE ICI. `statuts_requetes` porte une
     colonne `est_cloture` — vraie sur Résolue et Abandonnée, fausse sur les deux autres. J'avais
     d'abord recopié ces deux codes en dur : le jour où Michel ajoute un statut terminal, la liste
     écrite ici l'aurait ignoré et la requête aurait continué de s'annoncer en retard. */
  const close = Boolean(statuts?.find((s) => s.code === requete.statut)?.est_cloture)
  const enRetard = Boolean(
    requete.date_echeance && !close && new Date(requete.date_echeance) < new Date(),
  )
  const documentsDeLaRequete = (documents ?? []).filter((d) => d.entite_type === 'requete')

  const ONGLETS: { cle: CleOnglet; libelle: string; badge?: string }[] = [
    { cle: 'requete', libelle: 'Requête' },
    { cle: 'rattachements', libelle: 'Rattachements' },
    {
      cle: 'fichiers',
      libelle: 'Fichiers',
      badge: documentsDeLaRequete.length ? String(documentsDeLaRequete.length) : undefined,
    },
    { cle: 'historique', libelle: 'Historique' },
  ]

  const jour = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '—')

  const Champ = ({ libelle, children }: { libelle: string; children: React.ReactNode }) => (
    <div>
      <p className="text-km-micro font-bold uppercase tracking-[0.06em] text-km-faint">{libelle}</p>
      <p className="mt-0.5 text-km-body text-km-text">{children}</p>
    </div>
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar title="Requête" crumb={requete.objet || 'Requête'} />

      {/* ══ BANDEAU D'IDENTITÉ, le gabarit de l'opportunité ══
          La référence en gros chiffres tabulaires, les pastilles d'état à côté, le compte et la
          catégorie en seconde ligne. À droite, l'état et les dates. */}
      <div className="flex flex-none flex-wrap items-center gap-4 border-b border-km-line bg-white px-4 pb-3 pt-3.5 lg:px-6">
        <button
          type="button"
          onClick={() => navigate('/requetes')}
          className="rounded-lg p-1.5 text-km-faint hover:bg-km-soft hover:text-km-text"
          title="Retour aux requêtes"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-white',
            close
              ? 'bg-gradient-to-br from-km-green to-kiwi-400 shadow-[0_4px_12px_rgba(13,122,95,.25)]'
              : 'bg-gradient-to-br from-[#a8371f] to-[#d4694a] shadow-[0_4px_12px_rgba(168,55,31,.25)]',
          )}
        >
          <LifeBuoy className="h-[19px] w-[19px]" strokeWidth={2.1} />
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <span className="text-km-metric font-bold tabular-nums text-km-text">
              {requete.reference || 'Sans référence'}
            </span>
            <Badge tone={TON_STATUT[requete.statut] ?? 'neutral'}>{requete.statut_libelle}</Badge>
            {enRetard && <Badge tone="red">En retard</Badge>}
            {/* LA CATÉGORIE ET LE TYPE SE CORRIGENT DEPUIS LE BANDEAU, comme l'origine et le type
                d'une opportunité : ce sont deux étiquettes qu'on pose souvent de travers à la
                création, et qu'on relit ici. */}
            <InlineField
              variant="select"
              label=""
              emptyLabel="catégorie à préciser"
              value={requete.categorie ?? ''}
              options={CATEGORIES_REQUETE.map((c) => ({ value: c.code, label: c.libelle }))}
              onCommit={(v) => majRequete({ categorie: v || null })}
              disabled={!canManage}
              className="inline-flex rounded-lg border border-km-line bg-km-bg px-2 py-0.5 text-km-xs font-medium text-km-muted"
              {...retourInline}
            />
            <InlineField
              variant="select"
              label=""
              emptyLabel="type à préciser"
              value={requete.type_requete_id ?? ''}
              options={(types ?? []).map((t) => ({ value: t.id, label: t.libelle }))}
              onCommit={(v) => majRequete({ type_requete_id: v || null })}
              disabled={!canManage}
              className="inline-flex rounded-lg border border-km-line bg-km-bg px-2 py-0.5 text-km-xs font-medium text-km-muted"
              {...retourInline}
            />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 text-km-label text-km-muted">
            <span className="truncate font-semibold text-km-text">
              {requete.objet || 'Sans objet'}
            </span>
            <span className="text-km-faint">·</span>
            {requete.compte_id ? (
              <EntityLink to={`/comptes/${requete.compte_id}`}>{requete.compte_nom}</EntityLink>
            ) : (
              <span className="text-km-faint">compte non rattaché</span>
            )}
          </div>
        </div>

        {/* LE STATUT SE CHANGE DEPUIS LE BANDEAU : c'est le geste le plus fréquent sur cet objet, il
            n'a pas à se chercher dans un onglet. */}
        {canManage && (
          <MenuChoix
            valeur={statuts?.find((s) => s.code === requete.statut)?.id ?? ''}
            onChange={(statutId) => {
              const cible = statuts?.find((s) => s.id === statutId)
              if (!cible) return
              majRequete({
                statut_id: statutId,
                /* PASSER À « RÉSOLUE » DATE LA RÉSOLUTION, et en sortir l'effface. Sans ce second
                   geste, une requête rouverte garderait sa date de résolution et se lirait comme
                   réglée alors qu'elle est de nouveau ouverte — le défaut exact des recommandations
                   rouvertes qui gardent leur finalité.
                   ABANDONNÉE NE DATE RIEN : elle n'a pas été résolue, seulement close. */
                date_resolution: cible.code === 'RESOLUE' ? new Date().toISOString() : null,
              })
                .then(() => signaler('✓ Statut mis à jour'))
                .catch((e) => signaler(e instanceof Error ? e.message : 'Enregistrement impossible'))
            }}
            ariaLabel="Changer le statut de la requête"
            choix={(statuts ?? []).map((s) => ({ valeur: s.id, libelle: s.libelle }))}
          />
        )}
      </div>

      {/* ══ ONGLETS ══ Requête · Rattachements · Fichiers · Historique, comme l'opportunité. */}
      <div className="flex flex-none gap-1 border-b border-km-line bg-white px-4 sm:px-6">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            type="button"
            onClick={() => setOnglet(o.cle)}
            className={cn(
              'relative flex items-center gap-1.5 px-3 py-2.5 text-km-body font-semibold transition-colors',
              onglet === o.cle
                ? 'text-km-text after:absolute after:inset-x-2 after:bottom-0 after:h-[2px] after:rounded-t after:bg-km-green'
                : 'text-km-muted hover:text-km-text',
            )}
          >
            {o.libelle}
            {o.badge && (
              <span className="rounded-full bg-km-soft px-1.5 text-km-tiny font-bold text-km-muted">
                {o.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-h-0 overflow-y-auto bg-km-bg p-3.5 lg:px-5">
          {onglet === 'requete' && (
            <div className="flex max-w-[760px] flex-col gap-3.5 animate-km-fade-slide">
              <Card className="p-4">
                <p className="mb-2 text-km-xs font-bold uppercase tracking-[0.08em] text-km-faint">
                  Objet
                </p>
                <InlineField
                  variant="text"
                  label=""
                  emptyLabel="sans objet"
                  value={requete.objet ?? ''}
                  onCommit={(v) => majRequete({ objet: v.trim() || null })}
                  disabled={!canManage}
                  {...retourInline}
                />
                <p className="mb-2 mt-4 text-km-xs font-bold uppercase tracking-[0.08em] text-km-faint">
                  Le problème
                </p>
                <InlineField
                  variant="longtext"
                  label=""
                  emptyLabel="aucune description"
                  value={requete.description ?? ''}
                  onCommit={(v) => majRequete({ description: v.trim() || null })}
                  disabled={!canManage}
                  {...retourInline}
                />
              </Card>

              {/* ══ LA RÉSOLUTION ══
                  « Requête → Traitement → Résolution » : le troisième temps est un texte, pas un
                  statut. Fermer une requête sans dire comment on l'a résolue perd l'information qui
                  servira la prochaine fois. */}
              <Card className="p-4">
                <p className="mb-2 text-km-xs font-bold uppercase tracking-[0.08em] text-km-faint">
                  Ce qui l’a résolue
                </p>
                <InlineField
                  variant="longtext"
                  label=""
                  emptyLabel="pas encore renseignée"
                  value={requete.resolution ?? ''}
                  onCommit={(v) => majRequete({ resolution: v.trim() || null })}
                  disabled={!canManage}
                  {...retourInline}
                />
              </Card>

              <Card className={cn('p-4', enRetard && 'border-red-200 bg-km-red-soft/40')}>
                <p className="mb-2.5 text-km-xs font-bold uppercase tracking-[0.08em] text-km-faint">
                  Dates
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Champ libelle="Ouverte le">{jour(requete.date_creation)}</Champ>
                  <div>
                    <p className="text-km-micro font-bold uppercase tracking-[0.06em] text-km-faint">
                      Échéance
                    </p>
                    <InlineField
                      variant="date"
                      label=""
                      emptyLabel="ajouter une date"
                      value={requete.date_echeance ? requete.date_echeance.slice(0, 10) : ''}
                      onCommit={(v) => majRequete({ date_echeance: v || null })}
                      disabled={!canManage}
                      {...retourInline}
                    />
                    {/* LA DISTANCE EN INTERLIGNE, comme sur les recommandations et le pricing : une
                        date seule ne dit pas l'urgence. Rien sur une requête close — « il y a huit
                        jours » sur une requête résolue n'est pas une alerte, c'est de l'histoire. */}
                    {requete.date_echeance && !close && (
                      <p
                        className={cn(
                          'mt-0.5 text-km-tiny font-semibold',
                          tonDate(requete.date_echeance) === 'passe'
                            ? 'text-km-amber'
                            : 'text-km-faint',
                        )}
                      >
                        {dateRelative(requete.date_echeance)}
                      </p>
                    )}
                  </div>
                  <Champ libelle="Résolue le">{jour(requete.date_resolution)}</Champ>
                  <Champ libelle="Catégorie">{categorie?.libelle ?? '—'}</Champ>
                </div>
              </Card>
            </div>
          )}

          {onglet === 'rattachements' && (
            <div className="max-w-[760px] animate-km-fade-slide">
              <Card className="p-4">
                <p className="mb-2.5 text-km-xs font-bold uppercase tracking-[0.08em] text-km-faint">
                  Ce que la requête concerne
                </p>
                <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
                  <Champ libelle="Compte">
                    {requete.compte_id ? (
                      <EntityLink to={`/comptes/${requete.compte_id}`}>{requete.compte_nom}</EntityLink>
                    ) : '—'}
                  </Champ>
                  <Champ libelle="Site">
                    {requete.site_id ? (
                      <EntityLink to={`/sites/${requete.site_id}`}>{requete.site_nom}</EntityLink>
                    ) : '—'}
                  </Champ>
                  <Champ libelle="Compteur">
                    {requete.compteur_id ? (
                      <EntityLink to={`/compteurs/${requete.compteur_id}`}>{requete.compteur_numero}</EntityLink>
                    ) : '—'}
                  </Champ>
                  <Champ libelle="Contact">
                    {requete.contact_id ? (
                      <EntityLink to={`/contacts/${requete.contact_id}`}>{requete.contact_nom}</EntityLink>
                    ) : '—'}
                  </Champ>
                </div>
                {/* L'ÉDITEUR RESTE SUR LA LISTE, ET UN SEUL EXISTE. La cascade site → compteur y est
                    écrite : changer de site libère le compteur, sinon la paire devient incohérente.
                    Un second formulaire ici aurait été une seconde version de cette règle. */}
                <p className="mt-3.5 border-t border-km-line pt-2.5 text-km-label leading-relaxed text-km-faint">
                  Les rattachements se modifient depuis la liste des requêtes, sur la carte du
                  dossier — « Préciser le site, le compteur ou le contact ».
                </p>
              </Card>
            </div>
          )}

          {onglet === 'fichiers' && (
            <div className="max-w-[900px] animate-km-fade-slide">
              <OngletFichiers
                documents={documentsDeLaRequete}
                typesDocuments={typesDocumentsRef ?? []}
                onOuvrir={(d) => navigate(`/documents/${d.id}`)}
                onDeposer={async (fichiers, typeId) => {
                  await televerser.mutateAsync({
                    fichiers,
                    /* « requete » AU SINGULAIRE ET EN MINUSCULES : la convention des six valeurs déjà
                       en base — mandat, contrat, recommandation, site, compteur, piste. Un
                       « Requête » ou un « requetes » rendrait les fichiers invisibles, puisque la
                       page les relit sur cette chaîne exacte. */
                    entite_type: 'requete',
                    entite_id: requete.id,
                    type_document_id: typeId,
                    type_document_libelle:
                      (typesDocumentsRef ?? []).find((t) => t.id === typeId)?.libelle ?? '',
                  })
                  signaler('✓ Fichier déposé')
                }}
                nomEntite={requete.objet || 'cette requête'}
              />
            </div>
          )}

          {onglet === 'historique' && (
            <div className="animate-km-fade-slide">
              <Card className="p-4">
                <p className="mb-2 text-km-xs font-bold uppercase tracking-[0.08em] text-km-faint">
                  Historique des modifications
                </p>
                <HistoriqueDiscret tableNom="requetes" ligneId={requete.id} />
              </Card>
            </div>
          )}
        </div>

        <div className="hidden min-h-0 overflow-y-auto border-l border-km-line bg-white lg:block">
          <FluxActualite
            tableNom="requetes"
            ligneId={requete.id}
            dateCreation={requete.date_creation}
          />
        </div>
      </div>

      {toast && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-km bg-km-text px-3.5 py-2 text-km-label font-semibold text-white shadow-km-pop">
          {toast}
        </div>
      )}
    </div>
  )
}
