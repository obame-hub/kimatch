import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, Loader2, Mail, PenLine, Pencil, Phone, Plus, ShieldCheck, UserPlus } from 'lucide-react'
import type { Contact } from '@/types/domain'
import { cn } from '@/lib/utils'
import { appelerNumero } from '@/lib/telephonie'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { isValidEmail } from '@/lib/textFormat'
/* Le nom complet et la liste des civilités viennent du module commun : deux implémentations
   finiraient par diverger, et c'est précisément le défaut qu'il a été écrit pour fermer. LA
   PASTILLE GARDE SES INITIALES sur prénom + nom — y glisser le « M. » donnerait « MF » au lieu de
   « FL », et on reconnaît quelqu'un à ses initiales, pas à son genre. */
import { CIVILITES, nomComplet } from '@/lib/civilite'
import { useUpdateContactField } from '@/lib/data/contacts'
import { useOuvrirEmail } from '@/lib/voletEmail'
import { LIBELLE_ROLE, SEGMENT_SYNDIC_BENEVOLE, estSyndic, type RoleContact } from '@/lib/contactRoles'
import { useCouvertureConseilSyndical, type CompteurRelais } from '@/lib/data/relaisConseilSyndical'
import { libelleFraicheur, useFraicheurContacts, type Fraicheur } from '@/lib/data/fraicheurContacts'
import { DialogDesignerRelais } from '@/components/compte/DialogDesignerRelais'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * L'ONGLET CONTACTS : TROIS ZONES CHEZ UN SYNDIC, DEUX CHEZ UNE ENTREPRISE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 13/09/2026 : « En réalité il y a 3 zones si le compte est un syndic de copropriété et
 * 2 zones si le compte est une entreprise. »
 *
 *   · QUI DÉCIDE     — les décisionnaires et les signataires
 *   · QUI ADMINISTRE — le technique, l'administratif, le juridique, l'assistanat, la comptabilité
 *   · QUI RESTE      — les membres du conseil syndical, chez les syndics uniquement
 *
 * ══ POURQUOI DES ZONES ET PAS UN FILTRE ══
 *
 * Une liste unique avec un filtre poserait la même question aux trois natures — « qui est-ce ? ».
 * Or on ne leur demande pas la même chose. Aux décideurs : à qui je parle pour faire signer. Aux
 * administratifs : qui tient réellement le portefeuille. Aux relais : quels compteurs sous contrat
 * sont couverts — et là, la personne compte moins que le PDL qu'elle protège. D'où une zone qui
 * s'ouvre sur un taux et non sur des cartes.
 *
 * ══ LA TROISIÈME ZONE NE SE RÈGLE PAS, ELLE SE DÉDUIT ══
 *
 * `comptes.segment` distingue déjà « Syndic professionnel » (533 comptes), « Syndic non
 * professionnel » (7) et « Entreprise » (2 174). Aucun champ nouveau, aucune bascule : 540 comptes
 * affichent trois zones, 2 174 en affichent deux. C'est aussi ce qui garantit qu'un conseil
 * syndical ne réapparaîtra jamais là où il n'a pas lieu d'être — 388 des 389 fausses désignations
 * nettoyées le 13/09/2026 étaient posées sur des entreprises.
 *
 * ══ ET UNE QUATRIÈME BANDE, QUI A VOCATION À DISPARAÎTRE ══
 *
 * 506 contacts sur 3 416 n'ont aucun rôle : ils n'appartiennent à aucune zone et seraient
 * purement et simplement invisibles. La bande « À qualifier » les rattrape, ne s'affiche que si le
 * compte en a, et se vide à mesure qu'on les range.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

const TEINTES = {
  decide:     { bande: 'bg-[#EAF2EE] ring-[#D8E8E1]', encre: 'text-[#0A5F4A]', pastille: 'bg-[#DFF3EA] text-[#0D7A5F] border-[#0D7A5F]/30' },
  administre: { bande: 'bg-[#EBF1F7] ring-[#D9E4EF]', encre: 'text-[#25496B]', pastille: 'bg-[#E1EDF8] text-[#2F5D87] border-[#2F5D87]/30' },
  reste:      { bande: 'bg-km-piste-soft ring-km-piste-line', encre: 'text-km-piste', pastille: 'bg-km-piste-soft text-km-piste border-km-piste/30' },
  qualifier:  { bande: 'bg-km-soft ring-km-line', encre: 'text-km-muted', pastille: 'bg-km-surface text-km-faint border-km-line' },
} as const

type Teinte = keyof typeof TEINTES

function initiales(c: Contact) {
  return `${c.prenom[0] ?? ''}${c.nom[0] ?? ''}`.toUpperCase()
}

/**
 * La puce d'un rôle. Le libellé complet : « DÉC. » ferait gagner six pixels et perdre le sens.
 *
 * ══ SIGNATAIRE PORTE L'OR, PARTOUT ══
 *
 * William, 13/09/2026 : « Le signataire doit avoir une cartouche différente (gold). »
 *
 * Les autres rôles prennent la teinte de leur zone — ils disent dans quelle bande on est, ce que la
 * bande dit déjà. Signataire, lui, répond à une question qu'on se pose en traversant la page : QUI
 * PEUT SIGNER. Il doit donc se reconnaître sans lire, y compris quand la personne apparaît dans
 * « Qui administre » ou, en syndic bénévole, dans « Qui reste ». Une couleur qui change avec la
 * bande ne peut pas faire ça ; une couleur fixe, si.
 *
 * L'or est pris sur `km-amber` (#A06B19 sur #FFF3D8), le seul jeu doré du thème — celui qui
 * signalait déjà le signataire de mandat dans l'ancien panneau. Il ne sert à aucune des trois
 * teintes de zone : aucune collision possible.
 */
function PuceRole({ role, teinte }: { role: RoleContact; teinte: Teinte }) {
  const signataire = role === 'SIGNATAIRE'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-km-sm border px-1.5 py-px text-km-tiny font-bold uppercase tracking-[0.04em]',
        signataire
          ? 'border-km-amber/40 bg-km-amber-soft text-km-amber shadow-[inset_0_1px_0_rgb(255_255_255_/_.5)]'
          : TEINTES[teinte].pastille,
      )}
    >
      {signataire && <PenLine className="h-2.5 w-2.5 shrink-0" strokeWidth={2.6} />}
      {LIBELLE_ROLE[role]}
    </span>
  )
}

/**
 * Une LIGNE, pas une vignette.
 *
 * William, 14/09/2026 : « Je préférerais un affichage par liste dans les blocs (des cards
 * horizontales si tu préfères) plutôt qu'en mosaïque. »
 *
 * ══ POURQUOI LA LIGNE EST LE BON OBJET ICI ══
 *
 * La mosaïque range par pavés de même taille : elle convient quand chaque élément se regarde pour
 * lui-même. Or on ne contemple pas un contact, on le PARCOURT — « qui est signataire », « qui n'a
 * jamais été appelé ». L'œil descend une colonne, et en mosaïque il doit balayer en zigzag.
 *
 * Une ligne aligne aussi les mêmes informations à la même abscisse : les rôles sous les rôles, les
 * fraîcheurs sous les fraîcheurs. Comparer quinze contacts devient possible d'un coup d'œil, ce
 * qu'une grille de trois colonnes interdit par construction.
 *
 * ══ CE QUI SE REPLIE, ET DANS QUEL ORDRE ══
 *
 * En dessous de `sm`, les actions passent sous l'identité plutôt que de comprimer le nom : un nom
 * tronqué ne sert à rien, deux boutons décalés d'une ligne, si.
 */
function FicheContact({
  contact,
  teinte,
  compteId,
  compteursTenus,
  fraicheur,
}: {
  contact: Contact
  teinte: Teinte
  compteId: string
  /** Compteurs tenus — ou couverts, dans la zone des relais. */
  compteursTenus: number
  fraicheur: Fraicheur | undefined
}) {
  const navigate = useNavigate()
  const ouvrirEmail = useOuvrirEmail()
  const [edition, setEdition] = useState(false)
  const tel = contact.telephone || contact.telephone_mobile

  /**
   * LES TROIS GESTES SONT DES ICÔNES, PAS DES BOUTONS LIBELLÉS.
   *
   * William, 14/09/2026 : « Si c'est trop serré, remplace les boutons appeler et mail par leurs
   * icônes respectives. »
   *
   * Puis, le même jour : « Sur un écran plus large, on pourrait garder les libellés Appeler, Email
   * ou Modifier. »
   *
   * LE SEUIL EST À 1536 px, ET PAS À 1280. J'avais essayé `xl` d'abord : à cette largeur, la zone
   * utile de la fiche fait environ 950 px une fois le rail de navigation déduit, et trois intitulés
   * y coûtent 180 px — pris au nom du contact, c'est-à-dire à l'information qu'on vient chercher.
   * À 1536 px la place existe pour de bon, et les libellés ne prennent rien à personne.
   *
   * En dessous, l'icône seule : le téléphone, l'enveloppe et le crayon n'ont pas besoin d'être
   * traduits. Chacun garde son `title` et son `aria-label`, qui donnent en prime le numéro et
   * l'adresse — ce que l'intitulé ne faisait pas.
   */
  const geste = 'inline-flex h-7 items-center justify-center gap-1.5 rounded-km border px-1.5 text-km-label font-semibold transition-colors 2xl:px-2.5'

  return (
    <div
      className={cn(
        'rounded-[14px] border bg-km-surface px-3 py-2',
        edition ? 'border-km-green ring-1 ring-km-green/20' : 'border-km-line',
      )}
    >
      {/* ══ TOUT SUR UNE SEULE LIGNE ══
          William, 14/09/2026. La ligne se repliait sous une certaine largeur, et une bande de quinze
          contacts devenait un empilement irrégulier — certaines lignes hautes de deux rangées,
          d'autres d'une seule, ce qui ruine l'alignement vertical qui faisait tout l'intérêt de la
          liste.

          Une seule zone élastique, l'identité : elle absorbe la place restante et se tronque. Tout
          ce qui est à droite garde sa largeur, donc s'aligne d'une ligne à l'autre. */}
      <div className="flex items-center gap-3">
        {/* ══ L'IDENTITÉ — la seule qui cède du terrain ══ */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[1.5px] text-km-label font-bold', TEINTES[teinte].pastille)}>
            {initiales(contact)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Link to={`/contacts/${contact.id}`} className="truncate text-km-body font-bold text-km-text hover:underline">
                {/* La civilité passe devant, en gris : elle précise sans disputer la place au nom,
                    qui reste ce que l'œil cherche en parcourant la liste. */}
                {contact.civilite && <span className="font-semibold text-km-faint">{contact.civilite} </span>}
                {contact.prenom} {contact.nom}
              </Link>
              {/* Un contact peut être rattaché à plusieurs comptes : sans cette mention on croirait
                  qu'il appartient au compte affiché, et on ne saurait pas où le modifier. */}
              {contact.compte_id !== compteId && (
                <button
                  type="button"
                  onClick={() => navigate(`/comptes/${contact.compte_id}`)}
                  title={`Rattaché à ${contact.compte_nom} — ouvrir cette fiche`}
                  className="hidden shrink-0 rounded bg-km-blue-soft px-1.5 py-px text-km-tiny font-semibold text-km-blue hover:bg-km-blue/20 md:inline"
                >
                  via {contact.compte_nom}
                </button>
              )}
            </div>
            {/* LA FONCTION RESTE SOUS LE NOM. Le rôle dit ce que la personne peut faire, la fonction
                dit ce qu'elle est — et c'est elle qu'on reconnaît au téléphone. */}
            <p className="truncate text-km-label text-km-muted">{contact.fonction || '—'}</p>
          </div>
        </div>

        {/* ══ LES RÔLES ══ */}
        <div className="flex shrink-0 items-center gap-1 whitespace-nowrap">
          {/* SIGNATAIRE EN TÊTE : la puce dorée est celle qu'on cherche, elle ne se met pas en
              troisième position derrière deux puces de la couleur de la bande. */}
          {[...contact.roles].sort((a, b) => Number(b === 'SIGNATAIRE') - Number(a === 'SIGNATAIRE'))
            .map((r) => <PuceRole key={r} role={r} teinte={teinte} />)}
          {compteursTenus > 0 && (
            <span className="rounded-km-sm bg-km-soft px-1.5 py-px text-km-tiny font-bold uppercase tracking-[0.04em] text-km-muted">
              {compteursTenus} compteur{compteursTenus > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* ══ LA FRAÎCHEUR ══
            Largeur fixe pour que les pastilles s'alignent d'une ligne à l'autre : c'est ce qui
            permet de repérer une colonne de rouge sans lire un seul mot. Le seuil est descendu à
            `md` depuis que les gestes sont en icônes : la place rendue lui revient. */}
        <p className="hidden w-[132px] shrink-0 items-center gap-1.5 text-km-label md:flex">
          <i className={cn('h-1.5 w-1.5 shrink-0 rounded-full', {
            vive: 'bg-km-green', tiede: 'bg-km-amber', froide: 'bg-km-red', jamais: 'bg-km-faint',
          }[fraicheur?.temperature ?? 'jamais'])} />
          <span className={cn('truncate', fraicheur?.temperature === 'froide' ? 'font-semibold text-km-red' : 'text-km-muted')}>
            {libelleFraicheur(fraicheur)}
          </span>
        </p>

        {/* ══ LES GESTES ══
            Les intitulés ne s'affichent qu'à partir de `xl` : en dessous, l'icône seule suffit et
            rend la place au nom, qui en a plus besoin. */}
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={() => tel && void appelerNumero(tel)}
            disabled={!tel}
            title={tel ?? 'Aucun numéro'}
            aria-label={tel ? `Appeler ${nomComplet(contact)}` : 'Aucun numéro'}
            className={cn(geste, tel
              ? 'border-km-line bg-km-surface text-km-muted hover:border-km-green-line hover:bg-km-green-soft hover:text-km-green'
              : 'pointer-events-none border-km-line bg-km-surface text-km-muted opacity-40')}
          >
            <Phone className="h-3.5 w-3.5" />
            <span className="hidden 2xl:inline">Appeler</span>
          </button>
          {/* Le mail s'écrit dans le volet de Kimatch, pas dans le client de messagerie du poste :
              sinon l'échange n'est consigné nulle part, et la pastille de fraîcheur à gauche
              resterait grise après trois envois. Repli sur `mailto:` si le volet n'est pas monté. */}
          <button
            type="button"
            onClick={() => {
              if (!contact.email) return
              if (ouvrirEmail) ouvrirEmail({ a: contact.email, nom: nomComplet(contact), contactId: contact.id, compteId })
              else window.location.href = `mailto:${contact.email}`
            }}
            disabled={!contact.email}
            title={contact.email ?? 'Aucune adresse'}
            aria-label={contact.email ? `Écrire à ${nomComplet(contact)}` : 'Aucune adresse'}
            className={cn(geste, contact.email
              ? 'border-km-line bg-km-surface text-km-muted hover:border-km-blue-soft hover:bg-km-blue-soft hover:text-km-blue'
              : 'pointer-events-none border-km-line bg-km-surface text-km-muted opacity-40')}
          >
            <Mail className="h-3.5 w-3.5" />
            <span className="hidden 2xl:inline">E-mail</span>
          </button>
          {/* LE CRAYON EST LE DERNIER, et c'est voulu : on lit une fiche pour appeler ou écrire dix
              fois plus souvent que pour la corriger. */}
          <button
            type="button"
            onClick={() => setEdition((v) => !v)}
            title={edition ? 'Fermer' : 'Modifier ce contact'}
            aria-expanded={edition}
            aria-label={edition ? 'Fermer la modification' : `Modifier ${nomComplet(contact)}`}
            className={cn(geste, edition
              ? 'border-km-green bg-km-green-soft text-km-green'
              : 'border-km-line bg-km-surface text-km-muted hover:border-km-green-line hover:bg-km-green-soft hover:text-km-green')}
          >
            <Pencil className="h-3.5 w-3.5" />
            <span className="hidden 2xl:inline">{edition ? 'Fermer' : 'Modifier'}</span>
          </button>
        </div>
      </div>

      {edition && <FormulaireContact contact={contact} onFerme={() => setEdition(false)} />}
    </div>
  )
}

/**
 * ══ MODIFIER SANS QUITTER LA LISTE ══
 *
 * William, 14/09/2026 : « Sur chaque card, ajoute un bouton modifier (petit crayon) permettant de
 * dérouler la card en affichant les champs modifiables. »
 *
 * LA CARTE SE DÉPLIE, ELLE NE S'OUVRE PAS AILLEURS. Corriger un numéro de téléphone demandait
 * d'aller sur la fiche du contact, de revenir, et de retrouver sa place dans la liste — trois
 * gestes pour un chiffre. Déplié sur place, on garde le contexte : les autres contacts restent
 * visibles au-dessus et en dessous.
 *
 * LES FORMATS SONT APPLIQUÉS À L'ENREGISTREMENT, PAS À LA FRAPPE. Mettre le nom en majuscules
 * pendant qu'on tape déplace le curseur et transforme une correction en bataille ; `useUpdateContactField`
 * s'en charge à l'écriture — prénom en capitale initiale, nom en majuscules, téléphones au format
 * international. La même règle qu'à la création, au même endroit, pour les deux chemins.
 */
function FormulaireContact({ contact, onFerme }: { contact: Contact; onFerme: () => void }) {
  const maj = useUpdateContactField()
  const [civilite, setCivilite] = useState(contact.civilite ?? '')
  const [prenom, setPrenom] = useState(contact.prenom ?? '')
  const [nom, setNom] = useState(contact.nom ?? '')
  const [fonction, setFonction] = useState(contact.fonction ?? '')
  const [email, setEmail] = useState(contact.email ?? '')
  const [telephone, setTelephone] = useState(contact.telephone ?? '')
  const [mobile, setMobile] = useState(contact.telephone_mobile ?? '')
  const [erreur, setErreur] = useState<string | null>(null)

  const emailInvalide = email.trim().length > 0 && !isValidEmail(email)

  async function enregistrer() {
    if (emailInvalide) return
    setErreur(null)
    try {
      await maj.mutateAsync({
        id: contact.id,
        patch: {
          civilite: civilite || null,
          prenom,
          nom,
          // La majuscule initiale de la fonction est posée ici : c'est le seul champ des sept que
          // la couche d'écriture ne formate pas, faute d'une règle unique côté création.
          fonction: fonction.trim() ? fonction.trim()[0].toUpperCase() + fonction.trim().slice(1) : null,
          email: email.trim() || null,
          telephone: telephone.trim() || null,
          telephone_mobile: mobile.trim() || null,
        },
      })
      onFerme()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible.')
    }
  }

  return (
    <div className="mt-2 w-full border-t border-km-line-soft pt-2.5">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {/* ══ LA CIVILITÉ EST UN INTERRUPTEUR, PAS UNE LISTE ══
            William, 14/09/2026. Deux valeurs possibles : une liste déroulante demandait trois
            gestes — ouvrir, viser, choisir — là où il n'y a qu'une alternative. Les deux options
            sont visibles d'emblée, et la réponse tient en un clic.

            RECLIQUER SUR L'OPTION ACTIVE L'EFFACE. Sans ça, une civilité posée par erreur ne se
            retirerait plus : le « — » de l'ancienne liste disparaît avec elle, et il servait. */}
        <div className="flex flex-col gap-1">
          <span className="text-km-tiny font-semibold uppercase tracking-[0.05em] text-km-faint">Civilité</span>
          <div className="flex gap-1.5">
            {CIVILITES.map((valeur) => {
              const actif = civilite === valeur
              return (
                <button
                  key={valeur}
                  type="button"
                  aria-pressed={actif}
                  onClick={() => setCivilite(actif ? '' : valeur)}
                  className={cn(
                    'h-9 flex-1 rounded-km border text-km-body font-semibold transition-colors',
                    actif
                      ? 'border-km-green bg-km-green-soft text-km-green'
                      : 'border-km-line bg-km-surface text-km-muted hover:border-km-green-line hover:bg-km-green-soft/50',
                  )}
                >
                  {valeur}
                </button>
              )
            })}
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-km-tiny font-semibold uppercase tracking-[0.05em] text-km-faint">Prénom</span>
          <Input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Prénom" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-km-tiny font-semibold uppercase tracking-[0.05em] text-km-faint">Nom</span>
          <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-km-tiny font-semibold uppercase tracking-[0.05em] text-km-faint">Fonction</span>
          <Input value={fonction} onChange={(e) => setFonction(e.target.value)} placeholder="Ex. Gestionnaire" />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-km-tiny font-semibold uppercase tracking-[0.05em] text-km-faint">E-mail</span>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="prenom.nom@exemple.fr"
            className={emailInvalide ? 'border-km-red' : undefined}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-km-tiny font-semibold uppercase tracking-[0.05em] text-km-faint">Téléphone</span>
          <Input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="+33…" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-km-tiny font-semibold uppercase tracking-[0.05em] text-km-faint">Mobile</span>
          <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+33…" />
        </label>
      </div>

      {emailInvalide && (
        <p className="mt-1.5 text-km-label text-km-red">Cette adresse n’a pas un format valide.</p>
      )}
      {erreur && <p className="mt-1.5 text-km-label text-km-red">{erreur}</p>}

      <div className="mt-2.5 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-km-label text-km-faint">
          Le prénom prendra sa capitale, le nom ses majuscules, les numéros leur format international.
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={onFerme} disabled={maj.isPending}>Annuler</Button>
        <Button type="button" size="sm" onClick={() => void enregistrer()} disabled={maj.isPending || emailInvalide}>
          {maj.isPending ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Enregistrement…</> : 'Enregistrer'}
        </Button>
      </div>
    </div>
  )
}

function Bande({
  titre,
  synthese,
  teinte,
  action,
  children,
}: {
  titre: string
  synthese: string
  teinte: Teinte
  action?: { libelle: string; onClick: () => void }
  children: React.ReactNode
}) {
  return (
    <section className={cn('rounded-[22px] p-2.5 ring-1 ring-inset sm:p-3', TEINTES[teinte].bande)}>
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 px-1.5">
        <h2 className={cn('text-km-name font-semibold', TEINTES[teinte].encre)}>{titre}</h2>
        <p className="min-w-0 flex-1 truncate text-km-body text-km-muted">{synthese}</p>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="shrink-0 rounded-km border border-km-line bg-km-surface px-2 py-0.5 text-km-label font-semibold text-km-green hover:bg-km-green-soft"
          >
            <Plus className="mr-0.5 inline h-3 w-3" />{action.libelle}
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

export function OngletContacts({
  contacts,
  compteId,
  compteNom,
  segment,
  onNouveauContact,
}: {
  contacts: Contact[]
  compteId: string
  compteNom: string
  /** `comptes.segment` : c'est lui, et lui seul, qui décide si la troisième zone existe. */
  segment: string | null
  onNouveauContact: () => void
}) {
  // ══ « QUI RESTE » N'A DE SENS QUE S'IL Y A UN CABINET À PERDRE ══
  //
  // William, 13/09/2026, question posée puis tranchée : en syndic bénévole, la copropriété EST son
  // propre syndic. Il n'y a aucun cabinet susceptible de perdre la résidence, donc rien dont le
  // relais serait la survivance — la zone y afficherait éternellement 0 %, ce qui ferait croire à
  // un manque là où il n'y a pas de besoin. Les membres du conseil syndical y sont de toute façon
  // décisionnaires et signataires : ils apparaissent dans « Qui décide », pas nulle part.
  const zoneRelais = estSyndic(segment) && segment !== SEGMENT_SYNDIC_BENEVOLE
  const { data: couverture } = useCouvertureConseilSyndical(compteId)
  const idsContacts = useMemo(() => contacts.map((c) => c.id), [contacts])
  const { data: fraicheurs } = useFraicheurContacts(idsContacts)
  const [aDesigner, setADesigner] = useState<CompteurRelais | null>(null)
  const [message, setMessage] = useState<string | null>(null)


  /** Combien de compteurs chaque contact COUVRE en tant que relais — le pendant, pour la zone CS,
   *  du nombre de compteurs tenus affiché dans les deux autres bandes. Sans lui, la carte d'un
   *  membre du conseil syndical serait la seule sans chiffre. */
  const couverts = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of couverture?.compteurs ?? []) {
      if (!c.relais_contact_id) continue
      m.set(c.relais_contact_id, (m.get(c.relais_contact_id) ?? 0) + 1)
    }
    return m
  }, [couverture])

  /** Combien de compteurs chaque contact tient — le chiffre qui dit qui porte réellement le compte. */
  const tenus = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of couverture?.compteurs ?? []) {
      if (!c.responsable_contact_id) continue
      m.set(c.responsable_contact_id, (m.get(c.responsable_contact_id) ?? 0) + 1)
    }
    return m
  }, [couverture])

  const { decident, administrent, relais, aQualifier } = useMemo(() => {
    const decident: Contact[] = []
    const administrent: Contact[] = []
    const relais: Contact[] = []
    const aQualifier: Contact[] = []
    for (const c of contacts) {
      const estRelais = c.roles.includes('CONSEIL_SYNDICAL')
      const decide = c.roles.includes('DECISIONNAIRE') || c.roles.includes('SIGNATAIRE')
      const administre = c.roles.includes('ADMINISTRATIF')
      // UN CONTACT PEUT TENIR DEUX ZONES, et c'est voulu : 526 contacts sont à la fois
      // décisionnaires et signataires, et en syndic bénévole le conseil syndical décide et signe.
      // Le masquer d'une des deux ferait mentir le décompte de l'autre.
      if (estRelais && zoneRelais) relais.push(c)
      if (decide) decident.push(c)
      if (administre) administrent.push(c)
      if (!decide && !administre && !(estRelais && zoneRelais)) aQualifier.push(c)
    }
    /**
     * ══ L'ORDRE DIT PAR OÙ COMMENCER ══
     *
     * William, 14/09/2026 : « Trie les contacts en premier par contact le plus récent, puis par
     * nombre de compteurs décroissant. Si aucun des 2, par ordre alphabétique. »
     *
     * TROIS CRITÈRES, ET CHACUN RATTRAPE LE PRÉCÉDENT QUAND IL EST MUET. Celui qu'on vient d'avoir
     * au téléphone remonte : c'est le fil chaud, celui qu'on rappelle sans se présenter. Quand
     * personne n'a été contacté — ce qui est le cas de 3 206 contacts sur 3 419 — c'est le volume
     * qui tranche : celui qui tient quatre-vingts compteurs pèse plus que celui qui en tient un.
     * Et quand les deux se taisent, l'alphabet, qui au moins ne ment pas.
     *
     * UNE FRAÎCHEUR ABSENTE N'EST PAS UNE FRAÎCHEUR ANCIENNE : elle passe après tous les contacts
     * datés, sans quoi « jamais contacté » se rangerait devant « vu hier ».
     */
    const ordre = (compteurs: Map<string, number>) => (a: Contact, b: Contact) => {
      const ja = fraicheurs?.get(a.id)?.jours ?? null
      const jb = fraicheurs?.get(b.id)?.jours ?? null
      if (ja !== jb) {
        if (ja === null) return 1
        if (jb === null) return -1
        return ja - jb
      }
      const ca = compteurs.get(a.id) ?? 0
      const cb = compteurs.get(b.id) ?? 0
      if (ca !== cb) return cb - ca
      return `${a.nom}${a.prenom}`.localeCompare(`${b.nom}${b.prenom}`, 'fr')
    }
    return {
      decident: decident.sort(ordre(tenus)),
      administrent: administrent.sort(ordre(tenus)),
      // Dans la zone des relais, le volume qui compte est celui qu'ils COUVRENT, pas qu'ils tiennent.
      relais: relais.sort(ordre(couverts)),
      aQualifier: aQualifier.sort(ordre(tenus)),
    }
  }, [contacts, zoneRelais, fraicheurs, tenus, couverts])

  /**
   * LE COMPTEUR SUR LEQUEL LA FENÊTRE S'OUVRE. Sans la liste, il faut bien en proposer un : c'est le
   * premier découvert dans l'ordre de tri de `useCouvertureConseilSyndical`, donc le plus urgent.
   * La fenêtre laisse ensuite changer de compteur.
   */
  const premierDecouvert =
    (couverture?.compteurs ?? []).find((c) => !c.relais_contact_id)
    // Tout couvert : on ouvre quand même, sur le premier compteur — on vient alors CHANGER un
    // relais, pas en poser un. Un bouton qui n'ouvre rien ressemble à une panne.
    ?? (couverture?.compteurs ?? [])[0]

  const signataires = decident.filter((c) => c.roles.includes('SIGNATAIRE')).length

  if (contacts.length === 0) {
    return (
      <p className="rounded-[22px] bg-km-soft px-6 py-11 text-center text-km-lead text-km-muted ring-1 ring-inset ring-km-line">
        Aucun contact enregistré pour ce compte.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Bande
        titre="Qui décide"
        teinte="decide"
        synthese={
          decident.length === 0
            ? 'Personne n’est identifié comme décisionnaire ou signataire'
            : `${decident.length} contact${decident.length > 1 ? 's' : ''} · ${signataires} signataire${signataires > 1 ? 's' : ''}`
        }
        action={{ libelle: 'Contact', onClick: onNouveauContact }}
      >
        {decident.length === 0 ? (
          <p className="rounded-[16px] bg-km-surface px-4 py-6 text-center text-km-body text-km-muted">
            Sans décisionnaire, on ne sait pas à qui faire signer. À renseigner sur une fiche contact.
          </p>
        ) : (
          <div className="flex max-h-[392px] flex-col gap-1.5 overflow-y-auto overscroll-contain pr-0.5">
            {decident.map((c) => (
              <FicheContact key={c.id} contact={c} teinte="decide" compteId={compteId} compteursTenus={tenus.get(c.id) ?? 0} fraicheur={fraicheurs?.get(c.id)} />
            ))}
          </div>
        )}
      </Bande>

      {administrent.length > 0 && (
        <Bande
          titre="Qui administre"
          teinte="administre"
          synthese={`${administrent.length} contact${administrent.length > 1 ? 's' : ''} · technique, juridique, comptabilité, assistanat`}
          action={{ libelle: 'Contact', onClick: onNouveauContact }}
        >
          <div className="flex max-h-[392px] flex-col gap-1.5 overflow-y-auto overscroll-contain pr-0.5">
            {administrent.map((c) => (
              <FicheContact key={c.id} contact={c} teinte="administre" compteId={compteId} compteursTenus={tenus.get(c.id) ?? 0} fraicheur={fraicheurs?.get(c.id)} />
            ))}
          </div>
        </Bande>
      )}

      {zoneRelais && couverture && (
        <Bande
          titre="Qui reste — conseil syndical"
          teinte="reste"
          action={{ libelle: 'Relais', onClick: () => setADesigner(premierDecouvert ?? null) }}
          synthese={
            couverture.sousContrat === 0
              ? `${relais.length} relais · aucun compteur sous contrat sur ce compte`
              : `${relais.length} relais · ${couverture.couverts} compteur${couverture.couverts > 1 ? 's' : ''} couvert${couverture.couverts > 1 ? 's' : ''} sur ${couverture.sousContrat} sous contrat`
          }
        >
          {/* ══ LES MEMBRES DU CONSEIL SYNDICAL SONT DES CONTACTS ══
              William, 14/09/2026 : « Les membres CS sont des contacts et ils doivent apparaître dans
              le bloc Qui reste au même titre que les autres. »

              J'avais ouvert cette zone sur la couverture seule, de peur que trois cartes donnent
              l'impression que le sujet était réglé. C'était escamoter la moitié de la réponse : on
              veut aussi savoir QUI appeler, avec son téléphone et sa fraîcheur, comme dans les deux
              autres bandes. La couverture reste en tête — elle dit l'ampleur — et les personnes
              viennent ensuite. */}
          {relais.length > 0 && (
            <div className="mb-2 flex max-h-[392px] flex-col gap-1.5 overflow-y-auto overscroll-contain pr-0.5">
              {relais.map((c) => (
                <FicheContact key={c.id} contact={c} teinte="reste" compteId={compteId} compteursTenus={couverts.get(c.id) ?? 0} fraicheur={fraicheurs?.get(c.id)} />
              ))}
            </div>
          )}

          {/* ══ LE TAUX SUFFIT ══
              William, 14/09/2026 : « N'affiche pas la liste de la couverture, l'indice en
              pourcentage est suffisant. »

              La liste répondait à « lesquels ne sont pas couverts » — une question d'inventaire, que
              l'onglet Compteurs traite mieux avec ses tris et ses filtres. Ici on demande « où j'en
              suis », et un pourcentage y répond en un coup d'œil.

              LA DÉSIGNATION REMONTE EN TÊTE DE ZONE, sinon elle partait avec la liste : c'était le
              seul endroit d'où l'on pouvait couvrir un compteur depuis cet onglet. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[16px] bg-km-surface px-4 py-3">
            <div className="flex shrink-0 items-baseline gap-1.5">
              <span className="text-[28px] font-bold leading-none tracking-[-.04em] tabular-nums text-km-piste">
                {couverture.taux}
              </span>
              <span className="text-km-lead text-km-muted">%</span>
              <span className="ml-1 text-km-label text-km-faint">de couverture</span>
            </div>
            <div className="h-1.5 min-w-[100px] flex-1 overflow-hidden rounded-full bg-km-soft">
              <div className="h-full rounded-full bg-km-piste" style={{ width: `${couverture.taux}%` }} />
            </div>
            {couverture.sansFilet > 0 ? (
              <p className="flex shrink-0 items-center gap-1 text-km-label font-semibold text-km-red">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {couverture.sansFilet} sans filet
                <span className="font-normal text-km-faint">sur {couverture.sousContrat} sous contrat</span>
              </p>
            ) : (
              <p className="flex shrink-0 items-center gap-1 text-km-label font-semibold text-km-green">
                <ShieldCheck className="h-3 w-3 shrink-0" /> Tout est couvert
              </p>
            )}
          </div>
        </Bande>
      )}

      <DialogDesignerRelais
        compteur={aDesigner}
        compteurs={couverture?.compteurs ?? []}
        onChangerCompteur={setADesigner}
        compteId={compteId}
        compteNom={compteNom}
        contacts={contacts}
        onClose={() => setADesigner(null)}
        onFait={(m) => setMessage(m)}
      />

      {/* Le retour de la désignation, discret et éphémère : la ligne du tableau s'est déjà mise à
          jour, le message ne fait que confirmer qu'on a bien touché ce compteur-là. */}
      {message && (
        <button
          type="button"
          onClick={() => setMessage(null)}
          className="rounded-km border border-km-green-line bg-km-green-soft px-3 py-1.5 text-left text-km-body font-semibold text-km-green"
        >
          {message}
        </button>
      )}

      {aQualifier.length > 0 && (
        <Bande
          titre="À qualifier"
          teinte="qualifier"
          synthese={`${aQualifier.length} contact${aQualifier.length > 1 ? 's' : ''} sans rôle — ${aQualifier.length > 1 ? 'ils n’apparaissent' : 'il n’apparaît'} dans aucune zone`}
        >
          <div className="flex flex-wrap gap-1.5">
            {aQualifier.map((c) => (
              <Link
                key={c.id}
                to={`/contacts/${c.id}`}
                className="inline-flex items-center gap-2 rounded-full border border-km-line bg-km-surface py-1 pl-1 pr-2.5 text-km-label font-semibold text-km-text hover:border-km-green-line hover:bg-km-green-soft"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-km-line bg-km-soft text-km-tiny font-bold text-km-faint">
                  {initiales(c)}
                </span>
                <span className="max-w-[18ch] truncate">{nomComplet(c)}</span>
                <UserPlus className="h-3 w-3 shrink-0 text-km-green" />
              </Link>
            ))}
          </div>
        </Bande>
      )}
    </div>
  )
}
