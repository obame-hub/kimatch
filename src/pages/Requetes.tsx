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
import { usePerimetreListe, BasculePerimetre } from '@/lib/perimetre'
import { EntityLink } from '@/components/ui/entity-link'
import {
  useRequetes,
  useStatutsRequetes,
  useCreerRequete,
  useMajRequete,
  useTypesRequetes,
  CATEGORIES_REQUETE,
  type PatchRequete,
} from '@/lib/data/requetes'
import { useComptes } from '@/lib/data/comptes'
import { useSitesParCompte } from '@/lib/data/sites'
import { useCompteursParSites } from '@/lib/data/compteurs'
import { useContactsParCompte } from '@/lib/data/contacts'
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

/**
 * LES TROIS COLONNES DE SA RÈGLE 8, et la correspondance avec nos quatre statuts.
 *
 * « Clôturé » regroupe Résolue et Abandonnée : les deux sortent du plan de travail, et ce qui les
 * distingue se lit sur la carte. C'est un regroupement d'AFFICHAGE — les statuts restent quatre en
 * base, parce que « résolue » et « abandonnée » ne racontent pas la même histoire et qu'on ne peut
 * pas la réécrire après coup.
 */
const COLONNES_REQUETE: { code: string; libelle: string; statuts: string[]; couleur: string }[] = [
  { code: 'NOUVEAU', libelle: 'Nouveau', statuts: ['NOUVELLE'], couleur: '#83868f' },
  { code: 'EN_COURS', libelle: 'En cours de traitement', statuts: ['EN_TRAITEMENT'], couleur: '#b57a24' },
  { code: 'CLOTURE', libelle: 'Clôturé', statuts: ['RESOLUE', 'ABANDONNEE'], couleur: '#0d7a5f' },
]

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

  const compteurs = useMemo(() => {
    const toutes = requetes ?? []
    const maintenant = Date.now()
    return {
      aTraiter: toutes.filter((r) => !['RESOLUE', 'ABANDONNEE'].includes(r.statut)).length,
      enRetard: toutes.filter(
        (r) => !['RESOLUE', 'ABANDONNEE'].includes(r.statut) && r.date_echeance && new Date(r.date_echeance).getTime() < maintenant,
      ).length,
      resolues: toutes.filter((r) => r.statut === 'RESOLUE').length,
    }
  }, [requetes])

  const { perimetre, setPerimetre, visibles: requetesDuPerimetre } = usePerimetreListe(
    'requetes', requetes,
    { proprietaireId: (r) => r.proprietaire_id, compteId: (r) => r.compte_id, siteId: (r) => r.site_id },
  )

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return (requetesDuPerimetre ?? [])
      // Par défaut on ne montre que ce qui reste à traiter : une liste de requêtes résolues n'appelle
      // aucune action, et c'est l'action qu'on vient chercher ici.
      .filter((r) => (ouvertes ? !['RESOLUE', 'ABANDONNEE'].includes(r.statut) : true))
      .filter((r) => !q || [r.objet, r.description, r.compte_nom, r.categorie].filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)))
  }, [requetesDuPerimetre, recherche, ouvertes])

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

        {/* TROIS TUILES AVANT LA LISTE, comme les écrans de William : ce qu'on vient vérifier d'un
            coup d'œil. « En retard » est la seule qui doit sauter aux yeux, donc la seule colorée. */}
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Tuile libelle="À traiter" valeur={String(compteurs.aTraiter)} />
          <Tuile libelle="En retard" valeur={String(compteurs.enRetard)} accent={compteurs.enRetard > 0 ? 'rouge' : undefined} />
          <Tuile libelle="Résolues" valeur={String(compteurs.resolues)} accent="kiwi" />
        </div>

        <ListToolbar query={recherche} onQueryChange={setRecherche} placeholder="Objet, compte, catégorie…" count={filtrees.length}>
            <BasculePerimetre
              valeur={perimetre}
              onChange={setPerimetre}
              libelleMien="Mes requêtes"
              libelleTous="Toutes les requêtes"
            />
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
          /* ══════ TROIS COLONNES, ET NON QUATRE STATUTS ══════
             Règle n° 8 du dossier UX du 26/08 : « les statuts sont Nouveau, En cours de traitement et
             Clôturé ». La base en porte quatre — Nouvelle, En traitement, Résolue, Abandonnée — dont
             les deux dernières sont clôturantes.

             LES DEUX FINS SE REGROUPENT SOUS « CLÔTURÉ », et c'est la lecture fidèle de sa règle
             plutôt qu'une simplification : une requête abandonnée et une requête résolue sont toutes
             deux hors du plan de travail, et ce qui les sépare — pourquoi elle s'est terminée — se lit
             sur la carte, pas dans un titre de colonne. Fusionner les statuts en base aurait en
             revanche détruit cette distinction pour toujours.

             LE KANBAN EST LA SEULE VUE, comme partout ailleurs depuis le 25/08. */
          <div className="flex gap-3 overflow-x-auto pb-2">
            {COLONNES_REQUETE.map((col) => {
              const dedans = filtrees.filter((r) => col.statuts.includes(r.statut))
              return (
                <div
                  key={col.code}
                  style={{ borderTopColor: col.couleur }}
                  className="flex w-[300px] shrink-0 flex-col gap-2 rounded-kw-lg border-t-[3px] bg-kw-subtle/70 p-2.5"
                >
                  <div className="mb-0.5 flex items-center gap-1.5 px-0.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: col.couleur }} />
                    <p className="truncate text-kw-xs font-bold uppercase tracking-[0.06em] text-kw-meta">
                      {col.libelle}
                    </p>
                    <span className="ml-auto shrink-0 rounded-kw-md bg-white px-1.5 py-px font-mono text-kw-micro font-extrabold text-kw-meta">
                      {dedans.length}
                    </span>
                  </div>
                  {dedans.length === 0 && (
                    <p className="px-0.5 text-kw-micro text-kw-faint">Vide</p>
                  )}
                  {dedans.map((r) => (
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
                onRattachement={async (patch) => {
                  try {
                    await maj.mutateAsync({ id: r.id, patch })
                    signaler('✓ Rattachement enregistré')
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
              )
            })}
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

function CarteRequete({ requete, statuts, onStatut, onResolution, onRattachement }: {
  requete: Requete
  statuts: { id: string; code: string; libelle: string }[]
  onStatut: (statutId: string, code: string) => void
  onResolution: (texte: string) => void
  onRattachement: (patch: PatchRequete) => void
}) {
  const [resolution, setResolution] = useState(requete.resolution ?? '')
  const [precise, setPrecise] = useState(false)
  const categorie = CATEGORIES_REQUETE.find((c) => c.code === requete.categorie)
  const resolue = requete.statut === 'RESOLUE'
  const enRetard = Boolean(requete.date_echeance && !resolue && new Date(requete.date_echeance) < new Date())

  return (
    <div className={cn(
      'rounded-[13px] border bg-white p-3.5 transition-shadow hover:shadow-[0_8px_22px_-14px_rgba(22,24,29,.28)]',
      enRetard ? 'border-red-200' : 'border-kw-border',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={cn(
              'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
              resolue ? 'bg-kiwi-50 text-kiwi-700' : enRetard ? 'bg-red-100 text-red-700' : 'bg-[#f7e6e2] text-[#a8371f]',
            )}
          >
            <LifeBuoy className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-navy-800">{requete.objet || 'Sans objet'}</p>
            <p className="truncate text-[11px] text-navy-500">
              {requete.reference && <span className="font-mono text-navy-400">{requete.reference} · </span>}
              {[categorie?.libelle, requete.compte_id ? undefined : 'compte non rattaché'].filter(Boolean).join(' · ')}
              {requete.compte_id && (
                <> · <EntityLink to={`/comptes/${requete.compte_id}`}>{requete.compte_nom}</EntityLink></>
              )}
            </p>
          </div>
        </div>
        <Badge tone={TON_STATUT[requete.statut] ?? 'neutral'}>{requete.statut_libelle}</Badge>
      </div>

      {requete.description && (
        <p className="mt-2 line-clamp-3 text-xs text-navy-500">{requete.description}</p>
      )}

      {/* ══ OÙ SE PASSE LE PROBLÈME ══
          Les trois rattachements se lisent d'un coup d'œil quand ils sont renseignés, et se posent
          ici quand ils ne le sont pas. C'est le second temps de la demande de la RH : une requête
          arrive souvent avant qu'on sache de quel compteur il s'agit — l'information se complète au
          téléphone, donc elle doit pouvoir se saisir sans repasser par une création. */}
      {(requete.site_nom || requete.compteur_numero || requete.contact_nom) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-navy-500">
          {requete.site_nom && (
            <span>
              <span className="text-navy-400">Site : </span>
              <EntityLink to={`/sites/${requete.site_id}`}>{requete.site_nom}</EntityLink>
            </span>
          )}
          {requete.compteur_numero && (
            <span>
              <span className="text-navy-400">Compteur : </span>
              <EntityLink to={`/compteurs/${requete.compteur_id}`}>
                <span className="font-mono">{requete.compteur_numero}</span>
              </EntityLink>
            </span>
          )}
          {requete.contact_nom && (
            <span>
              <span className="text-navy-400">Contact : </span>
              <EntityLink to={`/contacts/${requete.contact_id}`}>{requete.contact_nom}</EntityLink>
            </span>
          )}
        </div>
      )}

      {requete.compte_id && (
        <div className="mt-2">
          {precise ? (
            <div className="rounded-kw-md border border-kw-border bg-kw-bloc p-2.5">
              <ChampsRattachement
                compteId={requete.compte_id}
                siteId={requete.site_id ?? ''}
                setSiteId={(v) => onRattachement({ site_id: v || null, compteur_id: null })}
                compteurId={requete.compteur_id ?? ''}
                setCompteurId={(v) => onRattachement({ compteur_id: v || null })}
                contactId={requete.contact_id ?? ''}
                setContactId={(v) => onRattachement({ contact_id: v || null })}
              />
              <button
                type="button"
                onClick={() => setPrecise(false)}
                className="mt-2 text-[10.5px] font-semibold text-navy-500 hover:underline"
              >
                Terminé
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPrecise(true)}
              className="text-[10.5px] font-semibold text-kw-green hover:underline"
            >
              {requete.site_nom || requete.compteur_numero || requete.contact_nom
                ? 'Modifier le rattachement'
                : 'Préciser le site, le compteur ou le contact'}
            </button>
          )}
        </div>
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

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-kw-border-faint pt-2.5">
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
    </div>
  )
}

/** Une tuile de tête : un intitulé en petites capitales, un nombre en chiffres fixes. */
function Tuile({ libelle, valeur, accent }: { libelle: string; valeur: string; accent?: 'kiwi' | 'rouge' }) {
  return (
    <div className={cn(
      'rounded-[13px] border bg-white px-3.5 py-3',
      accent === 'kiwi' ? 'border-kiwi-200 bg-kiwi-50/50' : accent === 'rouge' ? 'border-red-200 bg-red-50' : 'border-kw-border',
    )}>
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-navy-400">{libelle}</p>
      <p className={cn(
        'mt-0.5 font-mono text-lg font-extrabold tabular-nums',
        accent === 'rouge' ? 'text-red-700' : accent === 'kiwi' ? 'text-kiwi-700' : 'text-navy-800',
      )}>
        {valeur}
      </p>
    </div>
  )
}

/**
 * OÙ SE PASSE LE PROBLÈME — le site, le compteur, le contact.
 *
 * Demandé par la RH le 26/08/2026 : « il faudrait qu'on puisse préciser de quel site ou num de
 * compteur ou contact, mais que ce soit facultatif ». Les colonnes existaient déjà en base ; c'était
 * un trou dans le formulaire.
 *
 * LES TROIS LISTES DÉCOULENT DU COMPTE, et c'est ce qui rend le bloc utilisable : proposer les
 * 17 000 sites de Kimatch dans un menu déroulant serait proposer de chercher une aiguille. Une fois
 * le compte choisi, il reste ses sites, ses compteurs et ses contacts — quelques lignes.
 *
 * ET LE COMPTEUR SE RESSERRE ENCORE SI UN SITE EST CHOISI : sur un syndic de trois cents compteurs,
 * le site est le seul filtre qui ramène la liste à une taille lisible. Sans site, on montre tous les
 * compteurs du compte, parce qu'on connaît parfois le PDL sans savoir de quel site il relève — c'est
 * même le cas le plus fréquent quand la réclamation vient d'une facture.
 *
 * TOUT EST FACULTATIF, jusqu'au compte : une réclamation peut arriver avant qu'on sache à qui elle se
 * rattache, et la refuser pour cette raison ferait perdre l'information.
 */
function ChampsRattachement({
  compteId,
  siteId,
  setSiteId,
  compteurId,
  setCompteurId,
  contactId,
  setContactId,
}: {
  compteId: string
  siteId: string
  setSiteId: (v: string) => void
  compteurId: string
  setCompteurId: (v: string) => void
  contactId: string
  setContactId: (v: string) => void
}) {
  const { data: sites } = useSitesParCompte(compteId || undefined)
  const { data: contacts } = useContactsParCompte(compteId || undefined)
  // Les compteurs du site choisi, ou de tout le compte à défaut.
  const idsSites = siteId ? [siteId] : (sites ?? []).map((x) => x.id)
  const { data: compteurs } = useCompteursParSites(compteId ? idsSites : undefined)

  if (!compteId) {
    return (
      <p className="rounded-kw-md border border-dashed border-kw-border-strong bg-kw-bloc px-3 py-2 text-kw-xs leading-relaxed text-kw-meta">
        Choisissez un compte pour pouvoir préciser le site, le compteur ou le contact concerné. Ces
        trois précisions restent facultatives, et peuvent être ajoutées plus tard depuis la fiche.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <FormField label="Site (facultatif)">
        <Select
          value={siteId}
          onChange={(e) => {
            setSiteId(e.target.value)
            // Le compteur choisi peut ne pas appartenir au nouveau site : on le libère plutôt que
            // de laisser une paire incohérente s'enregistrer.
            setCompteurId('')
          }}
        >
          <option value="">Non précisé</option>
          {[...(sites ?? [])]
            .sort((a, b) => a.nom.localeCompare(b.nom))
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.nom}
              </option>
            ))}
        </Select>
      </FormField>

      <FormField label="Compteur (facultatif)">
        <Select value={compteurId} onChange={(e) => setCompteurId(e.target.value)}>
          <option value="">Non précisé</option>
          {[...(compteurs ?? [])]
            .sort((a, b) => (a.numero_pdl ?? '').localeCompare(b.numero_pdl ?? ''))
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.numero_pdl}
                {x.site_nom ? ` — ${x.site_nom}` : ''}
              </option>
            ))}
        </Select>
      </FormField>

      <FormField label="Contact (facultatif)">
        <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
          <option value="">Non précisé</option>
          {[...(contacts ?? [])]
            .sort((a, b) => (a.nom ?? '').localeCompare(b.nom ?? ''))
            .map((x) => (
              <option key={x.id} value={x.id}>
                {[x.prenom, x.nom].filter(Boolean).join(' ')}
                {x.fonction ? ` — ${x.fonction}` : ''}
              </option>
            ))}
        </Select>
      </FormField>
    </div>
  )
}

function DialogCreation({ onFermer, signaler }: { onFermer: () => void; signaler: (m: string) => void }) {
  const { data: comptes } = useComptes()
  const { data: statuts } = useStatutsRequetes()
  const creer = useCreerRequete()
  const { data: types } = useTypesRequetes()
  const [typeRequeteId, setTypeRequeteId] = useState('')
  const [categorie, setCategorie] = useState('')
  const [objet, setObjet] = useState('')
  const [description, setDescription] = useState('')
  const [compteId, setCompteId] = useState('')
  const [siteId, setSiteId] = useState('')
  const [compteurId, setCompteurId] = useState('')
  const [contactId, setContactId] = useState('')
  const [echeance, setEcheance] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  return (
    <Dialog open onClose={onFermer} title="Nouvelle requête" description="Un problème à traiter, indépendant de la chaîne commerciale.">
      <div className="space-y-3">
        {/* LE TYPE D'ABORD, LE SUJET ENSUITE. Ses quatre types disent la NATURE de la requête — ce
            qui décide du traitement — la catégorie dit son sujet. On demande donc la nature en
            premier, et le sujet reste facultatif : deux grilles, deux usages, et aucune des deux
            n'est perdue. */}
        <FormField label="Type">
          <Select value={typeRequeteId} onChange={(e) => setTypeRequeteId(e.target.value)} required>
            <option value="">Choisir…</option>
            {(types ?? []).map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
          </Select>
        </FormField>
        <FormField label="Sujet (facultatif)">
          <Select value={categorie} onChange={(e) => setCategorie(e.target.value)}>
            <option value="">Non précisé</option>
            {CATEGORIES_REQUETE.map((c) => <option key={c.code} value={c.code}>{c.libelle}</option>)}
          </Select>
        </FormField>
        <FormField label="Objet">
          <Input value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="Ex. Facture de juillet contestée" />
        </FormField>
        <FormField label="Compte">
          {/* CHANGER DE COMPTE VIDE LES TROIS : les sites et compteurs du compte précédent
              n'appartiennent pas au nouveau, et un identifiant resté là s'enregistrerait sans que
              personne ne le voie. */}
          <Select
            value={compteId}
            onChange={(e) => {
              setCompteId(e.target.value)
              setSiteId('')
              setCompteurId('')
              setContactId('')
            }}
          >
            <option value="">Non rattachée</option>
            {[...(comptes ?? [])].sort((a, b) => a.nom.localeCompare(b.nom))
              .map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </Select>
        </FormField>
        <ChampsRattachement
          compteId={compteId}
          siteId={siteId}
          setSiteId={setSiteId}
          compteurId={compteurId}
          setCompteurId={setCompteurId}
          contactId={contactId}
          setContactId={setContactId}
        />

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
            disabled={creer.isPending || !objet.trim() || !typeRequeteId}
            onClick={async () => {
              setErreur(null)
              try {
                await creer.mutateAsync({
                  categorie: categorie || null,
                  type_requete_id: typeRequeteId || null,
                  objet: objet.trim(),
                  description: description.trim() || null,
                  compte_id: compteId || null,
                  site_id: siteId || null,
                  compteur_id: compteurId || null,
                  contact_id: contactId || null,
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
