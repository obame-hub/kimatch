import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ArrowRight, Check, Users, Filter, Paperclip } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { DialogConversionPiste } from '@/components/prospection/DialogConversionPiste'
import { OngletFichiers } from '@/components/compte/OngletFichiers'
import { useDocumentsParEntites, useTeleverserDocuments } from '@/lib/data/documents'
import { useReferenceTable } from '@/lib/data/referenceTables'
import {
  useListes,
  usePistes,
  useCreerLigneListe,
  useCreerPiste,
  useMajPiste,
  useConvertirEnPiste,
  useConvertirPisteEnOpportunite,
  pisteQualifiee,
  VALIDATIONS_PISTE,
} from '@/lib/data/prospection'
import { useStatutsOpportunites } from '@/lib/data/opportunites'
import { cn } from '@/lib/utils'
import type { LigneListe, Piste } from '@/types/domain'

/**
 * La prospection : Liste puis Piste, sur un seul écran à deux onglets.
 *
 * POURQUOI UN SEUL ÉCRAN. Mémo de Michel, 23/08/2026 : « La Liste devient une Piste uniquement
 * lorsque nous avons validé… » Les deux objets sont les deux moitiés d'un même entonnoir, et l'on
 * passe de l'un à l'autre en une action. Deux entrées de menu séparées feraient croire à deux
 * travaux distincts, alors qu'il n'y en a qu'un : rendre une ligne joignable, puis la qualifier.
 *
 * PAS DE MAQUETTE. Le zip du 23/08 ne contient que la fiche Opportunité. Cet écran s'en tient donc à
 * ce que le mémo décrit — les quatre informations d'une liste, les cinq validations d'une piste, et
 * les deux bascules — sans rien inventer autour.
 */
/**
 * LA LISTE DISPARAÎT DE L'AFFICHAGE, LA PISTE RESTE. Michel, 25/08/2026 : « on enlève liste, du coup
 * on ne garde que piste ».
 *
 * Un interrupteur et non une suppression : les lignes de liste existent en base, `useListes` et son
 * dialogue de création fonctionnent, et la conversion d'une ligne en piste reste le chemin d'entrée
 * du travail. Repasser à `true` fait revenir l'onglet tel quel.
 */
const AFFICHER_LES_LISTES = false

export default function Prospection() {
  const [onglet, setOnglet] = useState<'listes' | 'pistes'>(AFFICHER_LES_LISTES ? 'listes' : 'pistes')
  const { data: listes } = useListes()
  const { data: pistes } = usePistes()
  const [creation, setCreation] = useState<null | 'liste' | 'piste'>(null)
  const [toast, setToast] = useState<string | null>(null)

  function signaler(m: string) {
    setToast(m)
    setTimeout(() => setToast(null), 2600)
  }

  const nonConverties = (listes ?? []).filter((l) => !l.piste_id)
  const pistesOuvertes = (pistes ?? []).filter((p) => !p.opportunite_id)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar title="Prospection" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
        <PageHeader
          title="Prospection"
          description="Une ligne devient une piste quand on l'a vérifiée ; une piste devient une opportunité quand un signal apparaît."
          icone={<Filter className="h-[19px] w-[19px]" strokeWidth={2.1} />}
          teinte="from-indigo-700 to-indigo-500"
          actions={
            <Button size="sm" onClick={() => setCreation(onglet === 'listes' ? 'liste' : 'piste')}>
              <Plus className="h-3.5 w-3.5" />
              {onglet === 'listes' ? 'Nouvelle ligne' : 'Nouvelle piste'}
            </Button>
          }
        />

        {/* LES DEUX MOITIÉS DE L'ENTONNOIR, dans leur ordre. Le troisième jalon n'est pas un onglet :
            il dit où mène le travail, sans prétendre qu'on le fait ici. */}
        {/* LES DEUX MOITIÉS DE L'ENTONNOIR, avec le trait souligné des onglets de William plutôt
            qu'un fond gris : le même geste que la fiche opportunité, pour que les deux écrans se
            lisent pareil. Le troisième jalon n'est pas un onglet — il dit où mène le travail. */}
        <div className="mb-4 flex flex-wrap items-center gap-0.5 border-b border-kw-border">
          {([
            ...(AFFICHER_LES_LISTES ? [{ cle: 'listes' as const, titre: 'Listes', compte: nonConverties.length }] : []),
            { cle: 'pistes' as const, titre: 'Pistes', compte: pistesOuvertes.length },
          ]).map((o) => (
            <button
              key={o.cle}
              type="button"
              onClick={() => setOnglet(o.cle)}
              className={cn(
                'flex items-center gap-1.5 border-b-2 px-3 pb-2 pt-1 text-[12.5px] transition-colors',
                onglet === o.cle
                  ? 'border-indigo-500 font-bold text-navy-800'
                  : 'border-transparent font-medium text-navy-500 hover:text-navy-700',
              )}
            >
              {o.titre}
              <span className={cn(
                'rounded-md px-1.5 py-0.5 text-[9.5px] font-extrabold',
                onglet === o.cle ? 'bg-indigo-50 text-indigo-600' : 'bg-navy-50 text-navy-400',
              )}>
                {o.compte}
              </span>
            </button>
          ))}
          <span className="ml-auto hidden items-center gap-1 px-2 pb-2 text-[10.5px] text-navy-300 sm:flex">
            <ArrowRight className="h-3 w-3" /> puis Opportunités
          </span>
        </div>

        {onglet === 'listes' && AFFICHER_LES_LISTES
          ? <OngletListes lignes={listes ?? []} signaler={signaler} />
          : <OngletPistes pistes={pistes ?? []} signaler={signaler} />}
      </div>

      {creation === 'liste' && <DialogLigne onFermer={() => setCreation(null)} signaler={signaler} />}
      {creation === 'piste' && <DialogPiste onFermer={() => setCreation(null)} signaler={signaler} />}

      {toast && (
        <div className="fixed bottom-[70px] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-800 px-4 py-2.5 text-xs font-semibold text-white shadow-lg lg:bottom-6">
          {toast}
        </div>
      )}
    </div>
  )
}

/** Les lignes brutes : société, contact, email, téléphone — et le passage en piste. */
function OngletListes({ lignes, signaler }: { lignes: LigneListe[]; signaler: (m: string) => void }) {
  const [recherche, setRecherche] = useState('')
  // LE COMPTEUR DE L'ONGLET DOIT DIRE CE QUE LA LISTE MONTRE. L'onglet annonçait « Listes 0 » — il
  // comptait les lignes non converties — au-dessus d'une liste qui affichait « 1 résultat », lignes
  // converties comprises. Vu à l'écran le 23/08/2026. La liste s'ouvre donc sur ce qui reste à
  // qualifier, et un bouton montre tout : même idiome que l'écran Requêtes.
  const [aQualifier, setAQualifier] = useState(true)
  const convertir = useConvertirEnPiste()

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return lignes
      .filter((l) => (aQualifier ? !l.piste_id : true))
      .filter((l) => !q || [l.societe, l.contact_nom, l.email, l.telephone].filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)))
  }, [lignes, recherche, aQualifier])

  const converties = lignes.filter((l) => l.piste_id).length

  return (
    <>
      <ListToolbar query={recherche} onQueryChange={setRecherche} placeholder="Société, contact, email…" count={filtrees.length}>
        {converties > 0 && (
          <Button size="sm" variant={aQualifier ? 'default' : 'outline'} onClick={() => setAQualifier((v) => !v)}>
            {aQualifier ? 'À qualifier seulement' : 'Toutes'}
          </Button>
        )}
      </ListToolbar>
      {filtrees.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <Users className="h-6 w-6 text-navy-300" />
          <p className="text-sm font-medium text-navy-700">Aucune ligne</p>
          <p className="max-w-md text-xs text-navy-400">
            Une ligne de liste, c'est le minimum : une société, un contact, un email, un téléphone.
            La vérification vient après.
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-navy-100 bg-white">
          {filtrees.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-3 border-b border-navy-50 px-4 py-3 last:border-b-0">
              <div className="min-w-[180px] flex-1">
                <p className="truncate text-sm font-medium text-navy-800">{l.societe || 'Société inconnue'}</p>
                <p className="truncate text-xs text-navy-500">{l.contact_nom || 'Contact inconnu'}</p>
              </div>
              <div className="min-w-[200px] flex-1 text-xs text-navy-500">
                <p className="truncate">{l.email || '—'}</p>
                <p className="truncate font-mono">{l.telephone || '—'}</p>
              </div>
              {l.source && <Badge tone="neutral">{l.source}</Badge>}
              {l.piste_id ? (
                <Badge tone="kiwi">Déjà en piste</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await convertir.mutateAsync(l)
                      signaler('✓ Ligne passée en piste — reste à la vérifier')
                    } catch (e) {
                      signaler(e instanceof Error ? e.message : 'Conversion impossible')
                    }
                  }}
                >
                  Passer en piste
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/**
 * Les pistes, avec leurs cinq validations.
 *
 * LES CINQ CASES SONT L'ÉCRAN. C'est la seule chose qui distingue une piste d'une ligne de liste, et
 * la cinquième — « responsable des contrats d'énergie » — est celle que Michel souligne. Tant qu'elles
 * ne sont pas toutes cochées, la bascule en opportunité reste fermée : sans elle, on ouvrirait des
 * affaires sur des contacts qu'on ne sait pas joindre.
 */
function OngletPistes({ pistes, signaler }: { pistes: Piste[]; signaler: (m: string) => void }) {
  const navigate = useNavigate()
  const [recherche, setRecherche] = useState('')
  const maj = useMajPiste()
  const convertir = useConvertirPisteEnOpportunite()
  const { data: statuts } = useStatutsOpportunites()
  const [signalPour, setSignalPour] = useState<Piste | null>(null)
  // LES FICHIERS D'UNE PISTE. Une piste n'a pas de fiche à elle : le dialogue est donc le seul
  // endroit possible, et il porte le même onglet Fichiers que le compte et l'opportunité.
  const [fichiersPour, setFichiersPour] = useState<Piste | null>(null)
  // Même règle que pour les listes : l'onglet compte les pistes encore ouvertes, la liste montre
  // les mêmes.
  const [ouvertes, setOuvertes] = useState(true)

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return pistes
      .filter((p) => (ouvertes ? !p.opportunite_id : true))
      .filter((p) => !q || [p.societe, p.contact_nom, p.email].filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)))
  }, [pistes, recherche, ouvertes])

  const converties = pistes.filter((p) => p.opportunite_id).length

  return (
    <>
      <ListToolbar query={recherche} onQueryChange={setRecherche} placeholder="Société, contact, email…" count={filtrees.length}>
        {converties > 0 && (
          <Button size="sm" variant={ouvertes ? 'default' : 'outline'} onClick={() => setOuvertes((v) => !v)}>
            {ouvertes ? 'Ouvertes seulement' : 'Toutes'}
          </Button>
        )}
      </ListToolbar>
      {filtrees.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <Users className="h-6 w-6 text-navy-300" />
          <p className="text-sm font-medium text-navy-700">Aucune piste</p>
          <p className="max-w-md text-xs text-navy-400">
            Une piste est un contact fiable et joignable, identifié comme responsable des contrats
            d'énergie. Elle naît d'une ligne de liste vérifiée.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filtrees.map((p) => {
            const mure = pisteQualifiee(p)
            const faites = VALIDATIONS_PISTE.filter((v) => Boolean(p[v.cle])).length
            return (
              <div
                key={p.id}
                className={cn(
                  'rounded-[13px] border bg-white p-3.5 transition-shadow hover:shadow-[0_8px_22px_-14px_rgba(22,24,29,.28)]',
                  p.opportunite_id ? 'border-kiwi-200 bg-kiwi-50/30' : mure ? 'border-indigo-200' : 'border-kw-border',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span
                      className={cn(
                        'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                        p.opportunite_id ? 'bg-kiwi-50 text-kiwi-700' : 'bg-indigo-50 text-indigo-600',
                      )}
                    >
                      <Users className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-navy-800">{p.societe || 'Société inconnue'}</p>
                      <p className="truncate text-[11px] text-navy-500">
                        {p.reference && <span className="font-mono text-navy-400">{p.reference} · </span>}
                        {p.contact_nom || 'Contact inconnu'}
                      </p>
                      <p className="truncate text-[10.5px] text-navy-400">
                        {[p.email, p.telephone].filter(Boolean).join(' · ') || 'Ni email ni téléphone'}
                      </p>
                    </div>
                  </div>
                  {p.opportunite_id ? (
                    <Badge tone="kiwi">Convertie</Badge>
                  ) : (
                    <Badge tone={mure ? 'kiwi' : 'amber'}>{faites}/5 vérifié{faites > 1 ? 's' : ''}</Badge>
                  )}
                </div>

                {/* L'AVANCEMENT EN BARRE : cinq cases cochées se comptent mal du regard, une barre
                    se lit d'un coup. Même idée que l'anneau de la fiche opportunité. */}
                {!p.opportunite_id && (
                  <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-navy-100">
                    <div
                      className={cn('h-full rounded-full transition-[width] duration-500', mure ? 'bg-kiwi-600' : 'bg-indigo-500')}
                      style={{ width: `${(faites / VALIDATIONS_PISTE.length) * 100}%` }}
                    />
                  </div>
                )}

                <div className="mt-2.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {VALIDATIONS_PISTE.map((v) => {
                    const coche = Boolean(p[v.cle])
                    return (
                      <button
                        key={v.cle}
                        type="button"
                        disabled={Boolean(p.opportunite_id)}
                        onClick={async () => {
                          try {
                            await maj.mutateAsync({ id: p.id, patch: { [v.cle]: !coche } })
                          } catch (e) {
                            signaler(e instanceof Error ? e.message : 'Enregistrement impossible')
                          }
                        }}
                        className={cn(
                          'flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
                          coche ? 'text-navy-700' : 'text-navy-400',
                          !p.opportunite_id && 'hover:bg-navy-50',
                          p.opportunite_id && 'cursor-default',
                        )}
                      >
                        <span className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded',
                          coche ? 'bg-kiwi-600 text-white' : 'border border-navy-300 bg-white',
                        )}>
                          {coche && <Check className="h-2.5 w-2.5" />}
                        </span>
                        {v.libelle}
                      </button>
                    )
                  })}
                </div>

                {p.opportunite_id ? (
                  <Button size="sm" variant="outline" className="mt-2.5" onClick={() => navigate(`/opportunites/${p.opportunite_id}`)}>
                    Ouvrir l'opportunité
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <div className="mt-2.5">
                    <Button size="sm" disabled={!mure} onClick={() => setSignalPour(p)}>
                      Créer l'opportunité
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                    {!mure && (
                      <p className="mt-1.5 text-[10.5px] leading-snug text-navy-400">
                        Les cinq vérifications doivent être faites : sans elles on ouvrirait une affaire
                        sur un contact qu'on ne sait pas joindre.
                      </p>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setFichiersPour(p)}
                  className="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600 hover:underline"
                >
                  <Paperclip className="h-3 w-3" /> Fichiers de la piste
                </button>
              </div>
            )
          })}
        </div>
      )}

      {fichiersPour && (
        <DialogFichiersPiste piste={fichiersPour} onFermer={() => setFichiersPour(null)} signaler={signaler} />
      )}

      {signalPour && (
        <DialogConversionPiste
          piste={signalPour}
          onFermer={() => setSignalPour(null)}
          onValide={async (signal, contactId, compteId) => {
            // Le contact est desormais garanti : le dialogue l'a rattache ou cree.
            try {
              const id = await convertir.mutateAsync({
                piste: signalPour,
                statutNouvelleId: statuts?.find((s) => s.code === 'NOUVELLE')?.id ?? null,
                signal,
                contactId,
                compteId,
              })
              setSignalPour(null)
              navigate(`/opportunites/${id}`)
            } catch (e) {
              signaler(e instanceof Error ? e.message : 'Conversion impossible')
            }
          }}
        />
      )}
    </>
  )
}

/**
 * Les fichiers d'une piste.
 *
 * POURQUOI UN DIALOGUE. Une piste n'a pas de fiche à elle — c'est un objet de travail, pas un objet
 * du patrimoine — et lui en fabriquer une pour trois fichiers serait disproportionné. Le dialogue
 * porte le composant `OngletFichiers`, celui du compte et de l'opportunité : dépôt par glisser ou
 * par parcours du poste, catégories, ouverture de la fiche document.
 *
 * La contrainte de la table `documents` accepte `piste` depuis la migration 20260823200000.
 */
function DialogFichiersPiste({ piste, onFermer, signaler }: {
  piste: Piste
  onFermer: () => void
  signaler: (m: string) => void
}) {
  const { data: documents } = useDocumentsParEntites([piste.id])
  const { data: typesDocumentsRef } = useReferenceTable('types_documents')
  const typesDocuments = typesDocumentsRef ?? []
  const televerser = useTeleverserDocuments()
  const navigate = useNavigate()

  // Filtré sur le type d'entité : deux objets de même identifiant ne se mélangent pas.
  const fichiers = (documents ?? []).filter((d) => d.entite_type === 'piste')

  return (
    <Dialog
      open
      onClose={onFermer}
      title="Fichiers de la piste"
      description={piste.societe ?? undefined}
      className="max-w-2xl"
    >
      <OngletFichiers
        documents={fichiers}
        onOuvrir={(d) => navigate(`/documents/${d.id}`)}
        typesDocuments={typesDocuments}
        nomEntite="cette piste"
        onDeposer={async (liste, typeDocumentId) => {
          await televerser.mutateAsync({
            fichiers: liste,
            entite_type: 'piste',
            entite_id: piste.id,
            type_document_id: typeDocumentId,
            type_document_libelle: typesDocuments.find((t) => t.id === typeDocumentId)?.libelle ?? '',
          })
          signaler(`✓ ${liste.length} fichier${liste.length > 1 ? 's' : ''} déposé${liste.length > 1 ? 's' : ''}`)
        }}
      />
    </Dialog>
  )
}

function DialogLigne({ onFermer, signaler }: { onFermer: () => void; signaler: (m: string) => void }) {
  const creer = useCreerLigneListe()
  const [societe, setSociete] = useState('')
  const [contact, setContact] = useState('')
  const [email, setEmail] = useState('')
  const [telephone, setTelephone] = useState('')
  const [source, setSource] = useState('')

  return (
    <Dialog open onClose={onFermer} title="Nouvelle ligne de liste" description="Société, contact, email, téléphone. Rien de plus n'est nécessaire à ce stade.">
      <div className="space-y-3">
        <FormField label="Société"><Input value={societe} onChange={(e) => setSociete(e.target.value)} /></FormField>
        <FormField label="Contact"><Input value={contact} onChange={(e) => setContact(e.target.value)} /></FormField>
        <FormField label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></FormField>
        <FormField label="Téléphone"><Input value={telephone} onChange={(e) => setTelephone(e.target.value)} /></FormField>
        <FormField label="Source">
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Non précisée</option>
            <option value="Achat de fichier">Achat de fichier</option>
            <option value="Salon">Salon</option>
            <option value="Site web">Site web</option>
            <option value="Recommandation">Recommandation</option>
            <option value="Partenaire">Partenaire</option>
          </Select>
        </FormField>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onFermer}>Annuler</Button>
          <Button
            type="button"
            disabled={creer.isPending}
            onClick={async () => {
              try {
                await creer.mutateAsync({
                  societe: societe.trim() || null,
                  contact_nom: contact.trim() || null,
                  email: email.trim() || null,
                  telephone: telephone.trim() || null,
                  source: source || null,
                })
                onFermer()
                signaler('✓ Ligne ajoutée')
              } catch (e) {
                signaler(e instanceof Error ? e.message : 'Création impossible')
              }
            }}
          >
            Ajouter
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function DialogPiste({ onFermer, signaler }: { onFermer: () => void; signaler: (m: string) => void }) {
  const creer = useCreerPiste()
  const [societe, setSociete] = useState('')
  const [contact, setContact] = useState('')
  const [email, setEmail] = useState('')
  const [telephone, setTelephone] = useState('')

  return (
    <Dialog open onClose={onFermer} title="Nouvelle piste" description="Les cinq vérifications se cochent ensuite, sur la carte.">
      <div className="space-y-3">
        <FormField label="Société"><Input value={societe} onChange={(e) => setSociete(e.target.value)} /></FormField>
        <FormField label="Contact"><Input value={contact} onChange={(e) => setContact(e.target.value)} /></FormField>
        <FormField label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></FormField>
        <FormField label="Téléphone"><Input value={telephone} onChange={(e) => setTelephone(e.target.value)} /></FormField>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onFermer}>Annuler</Button>
          <Button
            type="button"
            disabled={creer.isPending}
            onClick={async () => {
              try {
                await creer.mutateAsync({
                  societe: societe.trim() || null,
                  contact_nom: contact.trim() || null,
                  email: email.trim() || null,
                  telephone: telephone.trim() || null,
                })
                onFermer()
                signaler('✓ Piste créée')
              } catch (e) {
                signaler(e instanceof Error ? e.message : 'Création impossible')
              }
            }}
          >
            Créer
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
