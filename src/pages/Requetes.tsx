import { useMemo, useState } from 'react'
import { Plus, LifeBuoy, Check } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select, Textarea } from '@/components/ui/form'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { EntityLink } from '@/components/ui/entity-link'
import {
  useRequetes,
  useStatutsRequetes,
  useCreerRequete,
  useMajRequete,
  CATEGORIES_REQUETE,
} from '@/lib/data/requetes'
import { useComptes } from '@/lib/data/comptes'
import { cn } from '@/lib/utils'
import type { Requete } from '@/types/domain'

/**
 * Les requêtes : « Requête → Traitement → Résolution ».
 *
 * Mémo de Michel, 23/08/2026 : « La Requête est un autre objet actif mais parallèle à la chaîne
 * commerciale. Elle sert à traiter et résoudre un problème ou une demande : facturation, contrat,
 * compteur, fournisseur, document, réclamation, etc. »
 *
 * PARALLÈLE, ET C'EST TOUT L'ENJEU. Une requête ne fait pas avancer une affaire, elle débloque un
 * client. On ne la met donc pas dans l'entonnoir commercial, et son écran ne parle ni de conversion
 * ni de maturité : il parle de ce qui bloque et de ce qui l'a résolu.
 *
 * PAS DE MAQUETTE pour cet écran : il s'en tient au mémo.
 */

const TON_STATUT: Record<string, 'kiwi' | 'amber' | 'neutral'> = {
  NOUVELLE: 'amber',
  EN_TRAITEMENT: 'amber',
  RESOLUE: 'kiwi',
  ABANDONNEE: 'neutral',
}

export default function Requetes() {
  const { data: requetes } = useRequetes()
  const { data: statuts } = useStatutsRequetes()
  const maj = useMajRequete()
  const [recherche, setRecherche] = useState('')
  const [creation, setCreation] = useState(false)
  const [ouvertes, setOuvertes] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  function signaler(m: string) {
    setToast(m)
    setTimeout(() => setToast(null), 2600)
  }

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return (requetes ?? [])
      // Par défaut on ne montre que ce qui reste à traiter : une liste de requêtes résolues n'appelle
      // aucune action, et c'est l'action qu'on vient chercher ici.
      .filter((r) => (ouvertes ? !['RESOLUE', 'ABANDONNEE'].includes(r.statut) : true))
      .filter((r) => !q || [r.objet, r.description, r.compte_nom, r.categorie].filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)))
  }, [requetes, recherche, ouvertes])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Topbar title="Requêtes" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
        <PageHeader
          title="Requêtes"
          description="Ce qui bloque un client, et ce qu'on fait pour le débloquer. Parallèle à la chaîne commerciale."
          actions={
            <Button size="sm" onClick={() => setCreation(true)}>
              <Plus className="h-3.5 w-3.5" /> Nouvelle requête
            </Button>
          }
        />

        <ListToolbar query={recherche} onQueryChange={setRecherche} placeholder="Objet, compte, catégorie…" count={filtrees.length}>
          <Button size="sm" variant={ouvertes ? 'default' : 'outline'} onClick={() => setOuvertes((v) => !v)}>
            {ouvertes ? 'À traiter seulement' : 'Toutes'}
          </Button>
        </ListToolbar>

        {filtrees.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 p-8 text-center">
            <LifeBuoy className="h-6 w-6 text-navy-300" />
            <p className="text-sm font-medium text-navy-700">
              {ouvertes ? 'Rien à traiter' : 'Aucune requête'}
            </p>
            <p className="max-w-md text-xs text-navy-400">
              Une requête naît d'un problème : une facture contestée, un contrat introuvable, un
              compteur qui ne remonte rien.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {filtrees.map((r) => (
              <CarteRequete
                key={r.id}
                requete={r}
                statuts={statuts ?? []}
                onStatut={async (statutId, code) => {
                  try {
                    await maj.mutateAsync({
                      id: r.id,
                      patch: {
                        statut_id: statutId,
                        ...(code === 'RESOLUE' ? { date_resolution: new Date().toISOString() } : {}),
                      },
                    })
                    signaler('✓ Statut mis à jour')
                  } catch (e) {
                    signaler(e instanceof Error ? e.message : 'Enregistrement impossible')
                  }
                }}
                onResolution={async (texte) => {
                  try {
                    await maj.mutateAsync({ id: r.id, patch: { resolution: texte } })
                    signaler('✓ Résolution enregistrée')
                  } catch (e) {
                    signaler(e instanceof Error ? e.message : 'Enregistrement impossible')
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {creation && <DialogCreation onFermer={() => setCreation(false)} signaler={signaler} />}

      {toast && (
        <div className="fixed bottom-[70px] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-800 px-4 py-2.5 text-xs font-semibold text-white shadow-lg lg:bottom-6">
          {toast}
        </div>
      )}
    </div>
  )
}

function CarteRequete({ requete, statuts, onStatut, onResolution }: {
  requete: Requete
  statuts: { id: string; code: string; libelle: string }[]
  onStatut: (statutId: string, code: string) => void
  onResolution: (texte: string) => void
}) {
  const [resolution, setResolution] = useState(requete.resolution ?? '')
  const categorie = CATEGORIES_REQUETE.find((c) => c.code === requete.categorie)
  const resolue = requete.statut === 'RESOLUE'
  const enRetard = requete.date_echeance && !resolue && new Date(requete.date_echeance) < new Date()

  return (
    <Card className="p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-navy-800">{requete.objet || 'Sans objet'}</p>
          <p className="truncate text-xs text-navy-500">
            {[categorie?.libelle, requete.compte_id ? undefined : 'compte non rattaché'].filter(Boolean).join(' · ')}
            {requete.compte_id && (
              <> · <EntityLink to={`/comptes/${requete.compte_id}`}>{requete.compte_nom}</EntityLink></>
            )}
          </p>
        </div>
        <Badge tone={TON_STATUT[requete.statut] ?? 'neutral'}>{requete.statut_libelle}</Badge>
      </div>

      {requete.description && (
        <p className="mt-2 line-clamp-3 text-xs text-navy-500">{requete.description}</p>
      )}

      {requete.date_echeance && (
        <p className={cn('mt-1.5 text-[10.5px]', enRetard ? 'font-semibold text-red-600' : 'text-navy-400')}>
          Échéance : {new Date(requete.date_echeance).toLocaleDateString('fr-FR')}
          {enRetard && ' — dépassée'}
        </p>
      )}

      {/* LA RÉSOLUTION SE SAISIT ICI. « Requête → Traitement → Résolution » : le troisième temps est
          un texte, pas un statut. Fermer une requête sans dire comment on l'a résolue perd
          l'information qui servira la prochaine fois. */}
      <div className="mt-2.5">
        <Textarea
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          onBlur={() => { if (resolution !== (requete.resolution ?? '')) onResolution(resolution.trim() || '') }}
          rows={2}
          placeholder="Comment la requête a-t-elle été résolue ?"
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {statuts.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onStatut(s.id, s.code)}
            className={cn(
              'rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors',
              requete.statut === s.code
                ? 'border-kiwi-500 bg-kiwi-50 text-kiwi-800'
                : 'border-navy-200 text-navy-500 hover:bg-navy-50',
            )}
          >
            {requete.statut === s.code && <Check className="mr-1 inline h-3 w-3" />}
            {s.libelle}
          </button>
        ))}
      </div>
    </Card>
  )
}

function DialogCreation({ onFermer, signaler }: { onFermer: () => void; signaler: (m: string) => void }) {
  const { data: comptes } = useComptes()
  const { data: statuts } = useStatutsRequetes()
  const creer = useCreerRequete()
  const [categorie, setCategorie] = useState('')
  const [objet, setObjet] = useState('')
  const [description, setDescription] = useState('')
  const [compteId, setCompteId] = useState('')
  const [echeance, setEcheance] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  return (
    <Dialog open onClose={onFermer} title="Nouvelle requête" description="Un problème à traiter, indépendant de la chaîne commerciale.">
      <div className="space-y-3">
        <FormField label="Catégorie">
          <Select value={categorie} onChange={(e) => setCategorie(e.target.value)}>
            <option value="">Choisir…</option>
            {CATEGORIES_REQUETE.map((c) => <option key={c.code} value={c.code}>{c.libelle}</option>)}
          </Select>
        </FormField>
        <FormField label="Objet">
          <Input value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="Ex. Facture de juillet contestée" />
        </FormField>
        <FormField label="Compte">
          <Select value={compteId} onChange={(e) => setCompteId(e.target.value)}>
            <option value="">Non rattachée</option>
            {[...(comptes ?? [])].sort((a, b) => a.nom.localeCompare(b.nom))
              .map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </Select>
        </FormField>
        <FormField label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Ce qui bloque, et ce qu'on attend…" />
        </FormField>
        <FormField label="Échéance">
          <input
            type="date"
            value={echeance}
            onChange={(e) => setEcheance(e.target.value)}
            className="w-full rounded-lg border border-navy-200 bg-white px-3 py-2 text-sm outline-none focus:border-kiwi-500"
          />
        </FormField>

        {erreur && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{erreur}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onFermer}>Annuler</Button>
          <Button
            type="button"
            disabled={creer.isPending || !objet.trim()}
            onClick={async () => {
              setErreur(null)
              try {
                await creer.mutateAsync({
                  categorie: categorie || null,
                  objet: objet.trim(),
                  description: description.trim() || null,
                  compte_id: compteId || null,
                  statut_id: statuts?.find((s) => s.code === 'NOUVELLE')?.id ?? null,
                  date_echeance: echeance || null,
                })
                onFermer()
                signaler('✓ Requête créée')
              } catch (e) {
                setErreur(e instanceof Error ? e.message : 'Création impossible')
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
