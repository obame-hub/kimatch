import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, LifeBuoy } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EntityLink } from '@/components/ui/entity-link'
import { Textarea } from '@/components/ui/form'
import { MenuChoix } from '@/components/ui/menu-choix'
import { OngletFichiers } from '@/components/compte/OngletFichiers'
import { FluxActualite } from '@/components/opportunite/FluxActualite'
import { useGoBack } from '@/lib/useGoBack'
import { useCanManage } from '@/lib/data/roles'
import { useDocumentsParEntites, useTeleverserDocuments } from '@/lib/data/documents'
import { useReferenceTable } from '@/lib/data/referenceTables'
import {
  useRequetes,
  useStatutsRequetes,
  useMajRequete,
  CATEGORIES_REQUETE,
} from '@/lib/data/requetes'
import { cn } from '@/lib/utils'

/**
 * ══ FICHE REQUÊTE ══
 *
 * Naoëlle, 01/09/2026 : « regarde pourquoi on n'arrive pas à ouvrir une requête, quand on clique
 * dessus rien ne se passe — et donne la possibilité d'ajouter un document sur cet objet ».
 *
 * LE DIAGNOSTIC : IL N'Y AVAIT RIEN À OUVRIR. La route `/requetes/:id` n'existait pas, et aucune
 * page non plus. L'écran des requêtes montrait des cartes qui se modifiaient EN LIGNE — statut,
 * résolution, rattachements — un dessin défendable pour quatre requêtes, mais la carte portait une
 * ombre au survol. Une ombre au survol est une promesse de clic ; le clic ne menait nulle part. Le
 * défaut n'était donc pas dans le code du clic, il était dans l'absence du reste.
 *
 * ET C'EST CETTE ABSENCE QUI BLOQUAIT LES DOCUMENTS. `documents` se rattache à n'importe quel objet
 * par le couple `entite_type` + `entite_id` — mandat, contrat, recommandation, site, compteur,
 * piste. Rien n'empêchait « requete » d'entrer dans cette liste ; ce qui manquait, c'était un endroit
 * où déposer le fichier. Une carte de liste n'en est pas un : on n'y glisse pas un PDF entre deux
 * lignes de tableau.
 *
 * ══ CE QUE LA PAGE REPREND, ET CE QU'ELLE AJOUTE ══
 *
 * Elle reprend ce que la carte savait faire — changer de statut, écrire la résolution, lire les
 * rattachements — et rien de plus, pour que le geste soit le même aux deux endroits. La liste garde
 * ses commandes en ligne : sur quatre requêtes, ouvrir une page pour cocher « résolue » serait un
 * détour.
 *
 * Elle ajoute les deux choses qu'une carte ne peut pas porter : l'onglet Fichiers, et le flux
 * d'actualité à droite, qui dit qui a touché quoi et quand. `FluxActualite` lit
 * `historique_modifications` par nom de table : « requetes » y fonctionne sans rien ajouter.
 */

type CleOnglet = 'requete' | 'fichiers'

const TON_STATUT: Record<string, 'kiwi' | 'amber' | 'neutral' | 'red'> = {
  NOUVELLE: 'amber',
  EN_COURS: 'neutral',
  EN_ATTENTE: 'neutral',
  RESOLUE: 'kiwi',
}

export default function RequeteDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const goBack = useGoBack('/requetes')
  const canManage = useCanManage()

  /* LA REQUÊTE EST PRISE DANS LA LISTE DÉJÀ CHARGÉE, et non relue seule.
     `useRequetes` porte le filtrage de visibilité — une requête sans compte reste visible, celles
     d'un compte qu'on ne voit pas sont retirées. Écrire un second chemin de lecture pour cette page
     aurait dupliqué cette règle, et deux copies d'une règle de visibilité finissent par diverger :
     l'une montrerait ce que l'autre cache. Le coût est nul en pratique — la liste est en cache quand
     on arrive d'elle, et l'objet compte quatre lignes. Le jour où il en comptera mille, c'est
     `useRequete(id)` qu'il faudra écrire, en déplaçant la règle de visibilité avec lui. */
  const { data: requetes, isLoading } = useRequetes()
  const requete = requetes?.find((r) => r.id === id)

  const { data: statuts } = useStatutsRequetes()
  const { data: documents } = useDocumentsParEntites(id ? [id] : undefined)
  const { data: typesDocumentsRef } = useReferenceTable('types_documents')
  const maj = useMajRequete()
  const televerser = useTeleverserDocuments()

  const [onglet, setOnglet] = useState<CleOnglet>('requete')
  const [toast, setToast] = useState<string | null>(null)
  const [resolution, setResolution] = useState<string | null>(null)

  function signaler(m: string) {
    setToast(m)
    setTimeout(() => setToast(null), 2600)
  }

  if (isLoading) return <div className="p-6 text-km-body text-km-faint">Chargement…</div>
  if (!requete) return <div className="p-6 text-km-body text-km-faint">Requête introuvable.</div>

  const categorie = CATEGORIES_REQUETE.find((c) => c.code === requete.categorie)
  const resolue = requete.statut === 'RESOLUE'
  const enRetard = Boolean(
    requete.date_echeance && !resolue && new Date(requete.date_echeance) < new Date(),
  )
  const documentsDeLaRequete = (documents ?? []).filter((d) => d.entite_type === 'requete')

  const ONGLETS: { cle: CleOnglet; libelle: string; badge?: string }[] = [
    { cle: 'requete', libelle: 'Requête' },
    {
      cle: 'fichiers',
      libelle: 'Fichiers',
      badge: documentsDeLaRequete.length ? String(documentsDeLaRequete.length) : undefined,
    },
  ]

  const jour = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('fr-FR') : '—'

  /** Une ligne de rattachement : rien si l'objet n'est pas rattaché, plutôt qu'un tiret muet. */
  const Rattachement = ({ libelle, children }: { libelle: string; children: React.ReactNode }) => (
    <div>
      <p className="text-km-micro font-bold uppercase tracking-[0.06em] text-km-faint">{libelle}</p>
      <p className="mt-0.5 text-km-body text-km-text">{children}</p>
    </div>
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Topbar crumb="Requêtes" title={requete.objet || 'Requête'} />

      {/* ══ LE BANDEAU : CE QUI BLOQUE, ET OÙ ÇA EN EST ══ */}
      <div className="flex flex-none flex-wrap items-center gap-3 border-b border-km-line bg-white px-4 py-3 sm:px-6">
        <Button variant="ghost" size="icon" onClick={goBack} title="Retour aux requêtes">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]',
            resolue
              ? 'bg-kiwi-50 text-km-green'
              : enRetard
                ? 'bg-red-100 text-red-700'
                : 'bg-[#f7e6e2] text-[#a8371f]',
          )}
        >
          <LifeBuoy className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-km-title font-bold text-km-text">
              {requete.objet || 'Sans objet'}
            </p>
            <Badge tone={TON_STATUT[requete.statut] ?? 'neutral'}>{requete.statut_libelle}</Badge>
            {enRetard && <Badge tone="red">En retard</Badge>}
          </div>
          <p className="mt-0.5 truncate text-km-label text-km-muted">
            {requete.reference && <span className="font-mono text-km-faint">{requete.reference} · </span>}
            {[categorie?.libelle, requete.type_requete_libelle].filter(Boolean).join(' · ')}
            {requete.compte_id ? (
              <> · <EntityLink to={`/comptes/${requete.compte_id}`}>{requete.compte_nom}</EntityLink></>
            ) : (
              <> · compte non rattaché</>
            )}
          </p>
        </div>

        {/* LE STATUT SE CHANGE DEPUIS LE BANDEAU, comme sur la carte de la liste : c'est le geste le
            plus fréquent sur cet objet, il n'a pas à se chercher dans un onglet. */}
        {canManage && (
          <MenuChoix
            valeur={statuts?.find((s) => s.code === requete.statut)?.id ?? ''}
            onChange={(statutId) => {
              const cible = statuts?.find((s) => s.id === statutId)
              if (!cible) return
              maj
                .mutateAsync({
                  id: requete.id,
                  patch: {
                    statut_id: statutId,
                    /* PASSER À « RÉSOLUE » DATE LA RÉSOLUTION, et en sortir l'effface. Sans ce
                       second geste, une requête rouverte garderait sa date de résolution et se
                       lirait comme réglée alors qu'elle est de nouveau ouverte — le même défaut que
                       les recommandations rouvertes qui gardaient leur finalité. */
                    date_resolution: cible.code === 'RESOLUE' ? new Date().toISOString() : null,
                  },
                })
                .then(() => signaler('✓ Statut mis à jour'))
                .catch((e) => signaler(e instanceof Error ? e.message : 'Enregistrement impossible'))
            }}
            ariaLabel="Changer le statut de la requête"
            choix={(statuts ?? []).map((s) => ({ valeur: s.id, libelle: s.libelle }))}
          />
        )}
      </div>

      {/* ══ LES ONGLETS ══ */}
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

      {/* DEUX COLONNES, LE GABARIT DES AUTRES FICHES : le contenu à gauche, le flux d'actualité à
          droite. Sur une requête il répond à « qui s'en est occupé, et quand » — la question qu'on
          pose en reprenant un dossier laissé par un collègue. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-h-0 overflow-y-auto bg-km-bg p-4 sm:p-5">
          {onglet === 'requete' && (
            <div className="flex max-w-[760px] flex-col gap-3.5">
              <Card className="p-4">
                <p className="text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
                  Le problème
                </p>
                <p className="mt-2 whitespace-pre-wrap text-km-body text-km-text">
                  {requete.description || 'Aucune description.'}
                </p>
                <div className="mt-3.5 grid grid-cols-2 gap-3 border-t border-km-line pt-3 sm:grid-cols-4">
                  <Rattachement libelle="Ouverte le">{jour(requete.date_creation)}</Rattachement>
                  <Rattachement libelle="Échéance">
                    <span className={cn(enRetard && 'font-semibold text-km-amber')}>
                      {jour(requete.date_echeance)}
                    </span>
                  </Rattachement>
                  <Rattachement libelle="Résolue le">{jour(requete.date_resolution)}</Rattachement>
                  <Rattachement libelle="Catégorie">{categorie?.libelle ?? '—'}</Rattachement>
                </div>
              </Card>

              {/* ══ LA RÉSOLUTION ══
                  Elle s'écrit ici et non dans le bandeau : c'est le seul champ long de l'objet, et
                  c'est ce qu'on relira dans six mois pour savoir comment le cas s'est réglé. */}
              <Card className="p-4">
                <p className="text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
                  Ce qui l’a résolue
                </p>
                {canManage ? (
                  <>
                    <Textarea
                      value={resolution ?? requete.resolution ?? ''}
                      onChange={(e) => setResolution(e.target.value)}
                      rows={4}
                      placeholder="Ce qui a été fait, et avec qui — c’est ce qu’on relira dans six mois."
                      className="mt-2"
                    />
                    <div className="mt-2 flex justify-end">
                      <Button
                        size="sm"
                        disabled={resolution === null || resolution === (requete.resolution ?? '')}
                        onClick={() => {
                          maj
                            .mutateAsync({ id: requete.id, patch: { resolution: resolution } })
                            .then(() => { setResolution(null); signaler('✓ Résolution enregistrée') })
                            .catch((e) => signaler(e instanceof Error ? e.message : 'Enregistrement impossible'))
                        }}
                      >
                        <Check className="h-4 w-4" />Enregistrer
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="mt-2 whitespace-pre-wrap text-km-body text-km-text">
                    {requete.resolution || 'Pas encore renseignée.'}
                  </p>
                )}
              </Card>

              {/* ══ LES RATTACHEMENTS ══
                  En lecture seule ici : ils se modifient depuis la liste, où le choix en cascade
                  compte → site → compteur → contact est déjà écrit. Deux formulaires pour le même
                  rattachement finiraient par se comporter différemment. */}
              <Card className="p-4">
                <p className="text-km-label font-bold uppercase tracking-[0.08em] text-km-faint">
                  Rattachements
                </p>
                <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Rattachement libelle="Compte">
                    {requete.compte_id
                      ? <EntityLink to={`/comptes/${requete.compte_id}`}>{requete.compte_nom}</EntityLink>
                      : '—'}
                  </Rattachement>
                  <Rattachement libelle="Site">
                    {requete.site_id
                      ? <EntityLink to={`/sites/${requete.site_id}`}>{requete.site_nom}</EntityLink>
                      : '—'}
                  </Rattachement>
                  <Rattachement libelle="Compteur">
                    {requete.compteur_id
                      ? <EntityLink to={`/compteurs/${requete.compteur_id}`}>{requete.compteur_numero}</EntityLink>
                      : '—'}
                  </Rattachement>
                  <Rattachement libelle="Contact">
                    {requete.contact_id
                      ? <EntityLink to={`/contacts/${requete.contact_id}`}>{requete.contact_nom}</EntityLink>
                      : '—'}
                  </Rattachement>
                </div>
                <p className="mt-3 border-t border-km-line pt-2.5 text-km-label text-km-faint">
                  Les rattachements se modifient depuis la liste des requêtes.
                </p>
              </Card>
            </div>
          )}

          {onglet === 'fichiers' && (
            <div className="max-w-[900px]">
              <OngletFichiers
                documents={documentsDeLaRequete}
                typesDocuments={typesDocumentsRef ?? []}
                onOuvrir={(d) => navigate(`/documents/${d.id}`)}
                onDeposer={async (fichiers, typeId) => {
                  await televerser.mutateAsync({
                    fichiers,
                    /* « requete » AU SINGULAIRE ET EN MINUSCULES : c'est la convention des six
                       valeurs déjà en base — mandat, contrat, recommandation, site, compteur,
                       piste. Un « Requête » ou un « requetes » ici rendrait les fichiers
                       invisibles, puisque la page les relit sur cette chaîne exacte. */
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
