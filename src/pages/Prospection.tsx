import { useMemo, useState } from 'react'
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
import { Indicateurs } from '@/components/ui/page-header'
import { useTriKanban, SelecteurTri } from '@/lib/triKanban'
import {
  useListes,
  usePistes,
  useCreerLigneListe,
  useCreerPiste,
  useConvertirEnPiste,
  pisteQualifiee,
  VALIDATIONS_PISTE,
} from '@/lib/data/prospection'
import { cn } from '@/lib/utils'
import { TableauKanban } from '@/components/dashboard/TableauKanban'
import type { LigneListe, Piste } from '@/types/domain'
import { useOuvrirCreation } from '@/lib/ouvrirCreation'

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
  /* `?creer=1` ouvre le formulaire de PISTE et non celui de liste : l'onglet des listes est
     désactivé (AFFICHER_LES_LISTES), et le menu « Créer » ne propose que la piste. */
  useOuvrirCreation(() => setCreation('piste'))
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
        <div className="mb-4 flex flex-wrap items-center gap-0.5 border-b border-km-line">
          {([
            ...(AFFICHER_LES_LISTES ? [{ cle: 'listes' as const, titre: 'Listes', compte: nonConverties.length }] : []),
            { cle: 'pistes' as const, titre: 'Pistes', compte: pistesOuvertes.length },
          ]).map((o) => (
            <button
              key={o.cle}
              type="button"
              onClick={() => setOnglet(o.cle)}
              className={cn(
                'flex items-center gap-1.5 border-b-2 px-3 pb-2 pt-1 text-km-body transition-colors',
                onglet === o.cle
                  ? 'border-indigo-500 font-bold text-km-text'
                  : 'border-transparent font-medium text-km-muted hover:text-km-text',
              )}
            >
              {o.titre}
              <span className={cn(
                'rounded-md px-1.5 py-0.5 text-km-tiny font-extrabold',
                onglet === o.cle ? 'bg-indigo-50 text-indigo-600' : 'bg-km-bg text-km-faint',
              )}>
                {o.compte}
              </span>
            </button>
          ))}
          <span className="ml-auto hidden items-center gap-1 px-2 pb-2 text-km-xs text-km-faint sm:flex">
            <ArrowRight className="h-3 w-3" /> puis Opportunités
          </span>
        </div>

        {onglet === 'listes' && AFFICHER_LES_LISTES
          ? <OngletListes lignes={listes ?? []} signaler={signaler} />
          : <OngletPistes pistes={pistes ?? []} />}
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
          <Users className="h-6 w-6 text-km-faint" />
          <p className="text-sm font-medium text-km-text">Aucune ligne</p>
          <p className="max-w-md text-xs text-km-faint">
            Une ligne de liste, c'est le minimum : une société, un contact, un email, un téléphone.
            La vérification vient après.
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-km-line bg-white">
          {filtrees.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-3 border-b border-navy-50 px-4 py-3 last:border-b-0">
              <div className="min-w-[180px] flex-1">
                <p className="truncate text-sm font-medium text-km-text">{l.societe || 'Société inconnue'}</p>
                <p className="truncate text-xs text-km-muted">{l.contact_nom || 'Contact inconnu'}</p>
              </div>
              <div className="min-w-[200px] flex-1 text-xs text-km-muted">
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
/* L'onglet ne garde plus que le tableau : conversion, fichiers et vérifications sont passés sur la
   fiche de la piste (Michel, 01/09/2026). Il n'a donc plus besoin de `signaler` — plus rien ne
   s'enregistre depuis ici. */
function OngletPistes({ pistes }: { pistes: Piste[] }) {
  const [recherche, setRecherche] = useState('')
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
  /**
   * LES QUATRE MESURES DE L'ECRAN PISTES.
   *
   * Elles comptent les VALIDATIONS, parce que c'est ce qui fait avancer une piste : son dossier
   * demande cinq validations avant conversion, dont le motif commercial. Une piste ne progresse pas
   * par une decision mais par une information qu'on acquiert — le bandeau doit donc dire combien il
   * en manque, pas combien de pistes existent.
   *
   * Michel a tranche le 31/08 a 11 h 45 : les pistes passent « sur le meme modele que
   * l'opportunite », donc des etapes derivees des objets presents. Les quatre validations
   * actuelles (societe, contact, e-mail, portable) ne sont pas les cinq de son dossier : c'est un
   * chantier a part, et ces mesures comptent ce qui existe aujourd'hui, sans l'annoncer autrement.
   */
  const toutes = pistes
  const mesures = [
    {
      libelle: 'A completer',
      valeur: String(toutes.filter((p) => !p.opportunite_id && !pisteQualifiee(p)).length),
      precision: 'Validations manquantes',
    },
    {
      libelle: 'Pretes a convertir',
      valeur: String(toutes.filter((p) => !p.opportunite_id && pisteQualifiee(p)).length),
      precision: 'Toutes les validations',
    },
    {
      libelle: 'Converties',
      valeur: String(toutes.filter((p) => p.opportunite_id).length),
      precision: 'Une opportunite a suivi',
    },
    {
      libelle: 'Sans contact',
      valeur: String(toutes.filter((p) => !p.opportunite_id && !p.contact_id).length),
      precision: 'Prerequis de conversion',
    },
  ]
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
      <Indicateurs mesures={mesures} />

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
                  /* ══ LA CARTE MÈNE À LA FICHE DE LA PISTE ══
                     Michel, 01/09/2026 : « une page dédiée à la piste, pas un volet à droite ».
                     Elle menait auparavant à l'opportunité issue de la piste, ou nulle part —
                     `/prospection`, donc la page qu'on quitte. Une piste convertie garde son
                     histoire : on ouvre SA fiche, qui porte le lien vers l'opportunité.
                     `to` et non `onCarte` : une carte qui mène à une fiche doit être un LIEN, pour
                     répondre au clic du milieu, au Ctrl+clic et au « ouvrir dans un nouvel onglet ».
                     `onCarte` ouvrait un panneau et privait la carte de tout ça. */
                  to: `/pistes/${p.id}`,
                }
              }),
            ]),
          )}
          siVide="Aucune piste ne correspond."
        />

      {/* ══ TOUT LE TRAVAIL D'UNE PISTE A DÉMÉNAGÉ SUR SA FICHE ══
          Michel, 01/09/2026 : « une page dédiée à la piste ». Les cinq vérifications, la conversion
          en opportunité, les fichiers et les tâches vivent maintenant sur `PisteDetail`.

          Les deux dialogues qui restaient montés ici ont été retirés : plus rien ne les ouvrait
          depuis que la carte est un lien. Les garder aurait laissé du code mort derrière un
          commentaire qui promettait un chemin inexistant. */
      }
    </>
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
