import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ArrowRight, Users } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select } from '@/components/ui/form'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { usePerimetreListe, BasculePerimetre } from '@/lib/perimetre'
import { useTriKanban, SelecteurTri } from '@/lib/triKanban'
import { DialogConversionPiste } from '@/components/prospection/DialogConversionPiste'
import { OngletFichiers } from '@/components/compte/OngletFichiers'
import { useDocumentsParEntites, useTeleverserDocuments } from '@/lib/data/documents'
import { useReferenceTable } from '@/lib/data/referenceTables'
import {
  useListes,
  usePistes,
  useCreerLigneListe,
  useCreerPiste,
  useConvertirEnPiste,
  useConvertirPisteEnOpportunite,
  pisteQualifiee,
  VALIDATIONS_PISTE,
} from '@/lib/data/prospection'
import { useStatutsOpportunites } from '@/lib/data/opportunites'
import { cn } from '@/lib/utils'
import { PanneauPiste } from '@/components/prospection/PanneauPiste'
import { TableauKanban } from '@/components/dashboard/TableauKanban'
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
      {/* « PISTES » ET NON « PROSPECTION ».

           Le menu annonce « Pistes », le commentaire de navItems.tsx affirmait meme que « la page
           s'appelle deja Pistes dans son titre » — ce qui etait faux. On cliquait sur Pistes et on
           arrivait sur Prospection, avec un unique onglet Pistes en dessous : trois occurrences du
           mot pour un seul objet, et une quatrieme qui n'en etait pas.

           L'onglet Listes est desactive (AFFICHER_LES_LISTES) : il ne reste que les pistes, donc le
           titre generique n'a plus rien a couvrir. */}
      <Topbar title="Pistes" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-6">
        <PageHeader
          title="Pistes"
          /* DEUX CHOSES DIFFÉRENTES S'APPELAIENT « UN SIGNAL ».

             Ici, c'est le signal positif que le dialogue de conversion réclame — une phrase qu'on
             écrit soi-même, « il a demandé un devis », et qui justifie d'ouvrir une opportunité.
             Sur l'écran Signaux, c'est tout autre chose : la détection automatique d'un contrat qui
             arrive à échéance. Les deux écrans racontaient donc deux chaînes contradictoires, l'une
             où le signal ouvre le cycle, l'autre où il le referme.

             La phrase reprend maintenant l'intitulé exact du champ — « Signal positif » — et le
             second prérequis que Michel a posé : le contact. Rien ne change au fonctionnement. */
          description="Une ligne devient une piste quand on l'a vérifiée ; une piste devient une opportunité quand on peut nommer un signal positif et un contact."
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
  const convertir = useConvertirPisteEnOpportunite()
  const { data: statuts } = useStatutsOpportunites()
  const [signalPour, setSignalPour] = useState<Piste | null>(null)
  const [panneauPour, setPanneauPour] = useState<Piste | null>(null)
  // LES FICHIERS D'UNE PISTE. Une piste n'a pas de fiche à elle : le dialogue est donc le seul
  // endroit possible, et il porte le même onglet Fichiers que le compte et l'opportunité.
  const [fichiersPour, setFichiersPour] = useState<Piste | null>(null)
  // Même règle que pour les listes : l'onglet compte les pistes encore ouvertes, la liste montre
  // les mêmes.

  /**
   * Ce que le tableau montre — donc ce que le compteur du bandeau doit annoncer. Plus de filtre
   * « ouvertes seulement » : les converties ont leur colonne, elles font partie du décompte.
   */
  /* UNE PISTE EST UN PROSPECT : elle n'a le plus souvent pas encore de compte, donc pas de
     portefeuille auquel se rattacher. « Mes pistes » veut dire celles que J'AI OUVERTES — c'est le
     propriétaire qui répond, et il est renseigné sur les quatre. */
  const { perimetre, setPerimetre, visibles: pistesDuPerimetre } = usePerimetreListe(
    'pistes', pistes, { proprietaireId: (p) => p.proprietaire_id, compteId: (p) => p.compte_id },
  )

  /* Une piste n'a que trois choses a trier : quand elle est arrivee, chez qui, et par qui.
     Le tri reste local — quatre pistes en base, et l'ecran les charge toutes. */
  const { tri, ascendant, setTri, options: optionsTri } = useTriKanban('pistes', [
    { cle: 'date_creation', libelle: 'date de création', ascendant: false },
    { cle: 'societe', libelle: 'société' },
    { cle: 'contact_nom', libelle: 'contact' },
  ])

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    const retenues = (pistesDuPerimetre ?? []).filter((p) => !q || [p.societe, p.contact_nom, p.email].filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q)))
    /* `localeCompare` et non `<` : « Élan » se range avant « Zenith » en français, et apres en
       ordre d'octets. Une liste de societes triee a l'octet met tous les accents a la fin. */
    const sens = ascendant ? 1 : -1
    return [...retenues].sort((a, b) => sens * String(a[tri as keyof typeof a] ?? '')
      .localeCompare(String(b[tri as keyof typeof b] ?? ''), 'fr'))
  }, [pistesDuPerimetre, recherche, tri, ascendant])


  /**
   * LES TROIS ÉTATS D'UNE PISTE — les colonnes de son tableau.
   *
   * Michel veut un kanban sur la page des pistes (appel du 25/08). Mais une piste n'a PAS de colonne
   * de statut : elle porte cinq validations — société, contact, e-mail, portable, décisionnaire — et
   * un lien vers l'opportunité qu'elle a produite. Son pipeline se déduit donc de ces deux choses,
   * exactement comme le palier d'une opportunité se déduit de ses objets.
   */
  const COLONNES_PISTE = [
    { code: 'A_COMPLETER', libelle: 'À compléter' },
    { code: 'PRETE', libelle: 'Prête à convertir' },
    { code: 'CONVERTIE', libelle: 'Convertie' },
  ] as const
  const colonneDe = (p: Piste) =>
    p.opportunite_id ? 'CONVERTIE' : pisteQualifiee(p) ? 'PRETE' : 'A_COMPLETER'
  const correspond = (p: Piste) => {
    const q = recherche.trim().toLowerCase()
    return !q || [p.societe, p.contact_nom, p.email].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
  }

  return (
    <>
      <ListToolbar query={recherche} onQueryChange={setRecherche} placeholder="Société, contact, email…" count={filtrees.length}>
        <BasculePerimetre
          valeur={perimetre}
          onChange={setPerimetre}
          libelleMien="Mes pistes"
          libelleTous="Toutes les pistes"
        />
        <SelecteurTri valeur={tri} onChange={setTri} options={optionsTri} />
        {/* PLUS DE BASCULEMENT, PLUS DE FILTRE « OUVERTES SEULEMENT ». Naoëlle, 25/08/2026 :
            « garde juste la vue kanban pour partout », puis « crée les actions sur les pistes, les
            listes ne servent à rien, on fera tout sur pistes ».

            Le filtre n'avait plus de sens : la troisième colonne du tableau EST celle des converties.
            Et les actions que portait la carte de liste — cocher, convertir, joindre un fichier —
            vivent désormais dans le panneau qui s'ouvre au clic sur une carte. */}
      </ListToolbar>
        {/* LE TABLEAU IGNORE LE FILTRE « OUVERTES SEULEMENT » : sa troisième colonne EST celle des
            converties, et la masquer laisserait une colonne toujours vide sans dire pourquoi.

            Les accolades manquaient. En JSX, un commentaire de style C posé nu dans le rendu n'est
            pas un commentaire : c'est du texte. Celui-ci s'affichait donc en production, entre la
            barre de recherche et le tableau — trouvé par l'audit du 28/08/2026 en ouvrant l'écran. */}
        <TableauKanban
          colonnes={COLONNES_PISTE.map((c) => ({ code: c.code, libelle: c.libelle }))}
          cartes={Object.fromEntries(
            COLONNES_PISTE.map((c) => [
              c.code,
              pistes.filter((p) => colonneDe(p) === c.code).filter(correspond).map((p) => {
                const validees = VALIDATIONS_PISTE.filter((v) => Boolean(p[v.cle]))
                const manquantes = VALIDATIONS_PISTE.filter((v) => !p[v.cle])
                return {
                  id: p.id,
                  titre: p.societe || p.contact_nom || 'Piste sans nom',
                  sousTitre: [p.contact_nom, p.telephone].filter(Boolean).join(' · ') || undefined,
                  /* PAS D'ÉTIQUETTE DE NATURE ICI, et pas de volume non plus. Sa maquette met un
                     volume en GWh sur ces cartes, mais une piste n'a ni compteur ni consommation en
                     base — c'est même sa définition : elle devient patrimoine LE JOUR où on lui
                     rattache un compteur. Le chiffre n'existe donc pas, et je ne l'invente pas.
                     Quant à la nature, `pistes` ne porte que l'identifiant de sa liste, pas son nom. */
                  /* LE MOTIF DIT CE QUI MANQUE POUR AVANCER, et non le commentaire libre : sur une
                     piste, la seule question est ce qu'il reste à vérifier avant de la convertir.
                     C'est aussi la seule chose que le commercial peut faire quelque chose. */
                  motif:
                    manquantes.length === 0
                      ? 'Les cinq vérifications sont faites : la piste peut être convertie.'
                      : 'À vérifier : ' + manquantes.map((v) => v.libelle.toLowerCase()).join(', '),
                  mention: `${validees.length}/5 vérifié`,
                  urgent: !p.opportunite_id && pisteQualifiee(p),
                  to: p.opportunite_id ? `/opportunites/${p.opportunite_id}` : '/prospection',
                }
              }),
            ]),
          )}
          onCarte={(id) => setPanneauPour(pistes.find((p) => p.id === id) ?? null)}
          siVide="Aucune piste ne correspond."
        />

      {/* LE PANNEAU D'UNE PISTE. Il DÉCLENCHE les deux dialogues ci-dessous plutôt que de les
          contenir : celui de conversion demande le signal et crée compte, contact et opportunité —
          il appartient à la page, pas au panneau. */}
      <PanneauPiste
        piste={panneauPour}
        onFermer={() => setPanneauPour(null)}
        onConvertir={(p) => { setPanneauPour(null); setSignalPour(p) }}
        onFichiers={(p) => { setPanneauPour(null); setFichiersPour(p) }}
        signaler={signaler}
      />

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
