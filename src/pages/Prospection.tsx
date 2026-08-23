import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ArrowRight, Check, Users } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select, Textarea } from '@/components/ui/form'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { ChoixParRecherche } from '@/components/ui/choix-recherche'
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
import { useContacts } from '@/lib/data/contacts'
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
export default function Prospection() {
  const [onglet, setOnglet] = useState<'listes' | 'pistes'>('listes')
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
          actions={
            <Button size="sm" onClick={() => setCreation(onglet === 'listes' ? 'liste' : 'piste')}>
              <Plus className="h-3.5 w-3.5" />
              {onglet === 'listes' ? 'Nouvelle ligne' : 'Nouvelle piste'}
            </Button>
          }
        />

        {/* LES DEUX MOITIÉS DE L'ENTONNOIR, dans leur ordre. Le troisième jalon n'est pas un onglet :
            il dit où mène le travail, sans prétendre qu'on le fait ici. */}
        <div className="mb-4 flex flex-wrap items-center gap-1 rounded-xl bg-navy-100/70 p-1">
          {([
            { cle: 'listes' as const, titre: 'Listes', compte: nonConverties.length },
            { cle: 'pistes' as const, titre: 'Pistes', compte: pistesOuvertes.length },
          ]).map((o) => (
            <button
              key={o.cle}
              type="button"
              onClick={() => setOnglet(o.cle)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                onglet === o.cle ? 'bg-white text-navy-800 shadow-sm' : 'text-navy-500 hover:text-navy-700',
              )}
            >
              {o.titre}
              <span className={cn(
                'rounded-full px-1.5 py-px text-[10px] font-bold',
                onglet === o.cle ? 'bg-kiwi-50 text-kiwi-700' : 'bg-white text-navy-400',
              )}>
                {o.compte}
              </span>
            </button>
          ))}
          <span className="ml-1 flex items-center gap-1 px-2 text-[10.5px] text-navy-400">
            <ArrowRight className="h-3 w-3" /> puis Opportunités
          </span>
        </div>

        {onglet === 'listes'
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
              <Card key={p.id} className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-navy-800">{p.societe || 'Société inconnue'}</p>
                    <p className="truncate text-xs text-navy-500">{p.contact_nom || 'Contact inconnu'}</p>
                    <p className="truncate text-[10.5px] text-navy-400">
                      {[p.email, p.telephone].filter(Boolean).join(' · ') || 'Ni email ni téléphone'}
                    </p>
                  </div>
                  {p.opportunite_id ? (
                    <Badge tone="kiwi">Convertie</Badge>
                  ) : (
                    <Badge tone={mure ? 'kiwi' : 'amber'}>{faites}/5 vérifié{faites > 1 ? 's' : ''}</Badge>
                  )}
                </div>

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
              </Card>
            )
          })}
        </div>
      )}

      {signalPour && (
        <DialogSignal
          piste={signalPour}
          onFermer={() => setSignalPour(null)}
          onValide={async (signal, contactId, compteId) => {
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
 * Le signal qui fait basculer la piste.
 *
 * « La Piste devient une Opportunité lorsqu'un signal positif est identifié, par exemple : échéance
 * connue à moins de 2 ans, demande explicite du client, marché favorable, potentiel d'optimisation
 * TURPE, autre besoin commercial concret. » On le demande donc, en clair : c'est le premier des six
 * prérequis de conversion, et l'opportunité s'ouvrira avec.
 */
function DialogSignal({ piste, onFermer, onValide }: {
  piste: Piste
  onFermer: () => void
  onValide: (signal: string, contactId: string | null, compteId: string | null) => void
}) {
  const { data: contacts } = useContacts()
  const [signal, setSignal] = useState('')
  const [contactId, setContactId] = useState(piste.contact_id ?? '')
  const [compteId, setCompteId] = useState(piste.compte_id ?? '')
  const exemples = [
    'Échéance de contrat à moins de 2 ans',
    'Demande explicite du client',
    'Marché favorable',
    "Potentiel d'optimisation TURPE",
    'Autre besoin commercial',
  ]

  // LE MINIMUM DE MICHEL S'APPLIQUE ICI AUSSI. « Pour lancer une opportunité il nous faut au minimum
  // un signal et un contact » (23/08/2026). La conversion ne demandait que le signal : on obtenait
  // donc une opportunité sans contact, qui affichait « contact manquant » juste après qu'on ait
  // validé que la piste EST un contact joignable. Constaté à l'écran le 23/08.
  //
  // ON RATTACHE, ON NE CRÉE PAS. Une piste porte le contact en texte libre (nom, courriel,
  // téléphone) ; en faire un contact et un compte du patrimoine est une décision qui ne m'appartient
  // pas — Michel tient à la traçabilité de ces objets. Le dialogue propose donc de rattacher un
  // contact EXISTANT, et dit quoi faire quand il n'existe pas encore.
  const pret = signal.trim().length > 0 && Boolean(contactId)

  return (
    <Dialog
      open
      onClose={onFermer}
      title="Quel signal fait de cette piste une opportunité ?"
      description={piste.societe ?? undefined}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {exemples.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setSignal(e)}
              className={cn(
                'rounded-lg border px-2.5 py-1 text-xs transition-colors',
                signal === e ? 'border-kiwi-500 bg-kiwi-50 text-kiwi-800' : 'border-navy-200 text-navy-600 hover:bg-navy-50',
              )}
            >
              {e}
            </button>
          ))}
        </div>
        <FormField label="Le signal, en une phrase">
          <Textarea value={signal} onChange={(e) => setSignal(e.target.value)} rows={2} placeholder="Ce qui justifie d'ouvrir une affaire maintenant…" />
        </FormField>

        <FormField label="Le contact dans Kimatch">
          <ChoixParRecherche
            items={contacts ?? []}
            valeur={contactId}
            onChoisir={(c) => { setContactId(c?.id ?? ''); setCompteId(c?.compte_id ?? '') }}
            placeholder={piste.contact_nom ? `Chercher « ${piste.contact_nom} »…` : 'Nom, compte ou courriel…'}
            principal={(c) => `${c.prenom} ${c.nom}`}
            secondaire={(c) => c.compte_nom || null}
            filtre={(c, q) => [c.prenom, c.nom, c.compte_nom, c.email].some((v) => (v ?? '').toLowerCase().includes(q))}
            aucun="Aucun contact. Créez-le depuis Contacts, puis revenez ici."
            totalLibelle={`${(contacts ?? []).length} contacts`}
          />
        </FormField>

        {!pret && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Il manque {!signal.trim() && 'le signal'}
            {!signal.trim() && !contactId && ' et '}
            {!contactId && 'le contact'} : c'est le minimum pour lancer une opportunité.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onFermer}>Annuler</Button>
          <Button type="button" onClick={() => onValide(signal.trim(), contactId || null, compteId || null)} disabled={!pret}>
            Créer l'opportunité
          </Button>
        </div>
      </div>
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
