import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, Flame, Mail, PenLine, Phone, Plus, ShieldCheck, UserPlus, Zap } from 'lucide-react'
import type { Contact } from '@/types/domain'
import { cn } from '@/lib/utils'
import { appelerNumero } from '@/lib/telephonie'
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

/** Au-delà, on compte en pied de zone plutôt que d'allonger la liste. */
const COMPTEURS_VISIBLES = 8

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
  /** Nombre de compteurs dont ce contact est le responsable — le chiffre qui dit qui tient le portefeuille. */
  compteursTenus: number
  fraicheur: Fraicheur | undefined
}) {
  const navigate = useNavigate()
  const ouvrirEmail = useOuvrirEmail()
  const tel = contact.telephone || contact.telephone_mobile

  return (
    <div className="flex flex-col gap-2 rounded-[16px] border border-km-line bg-km-surface p-2.5">
      <div className="flex items-start gap-2.5">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] text-km-name font-bold', TEINTES[teinte].pastille)}>
          {initiales(contact)}
        </div>
        <div className="min-w-0 flex-1">
          <Link to={`/contacts/${contact.id}`} className="block truncate text-km-body font-bold text-km-text hover:underline">
            {contact.prenom} {contact.nom}
          </Link>
          {/* LA FONCTION RESTE VISIBLE SOUS LE RÔLE. Le rôle dit ce que la personne peut faire, la
              fonction dit ce qu'elle est — et c'est elle qu'on reconnaît au téléphone. */}
          <p className="truncate text-km-label text-km-muted">{contact.fonction || '—'}</p>
          {/* Un contact peut être rattaché à plusieurs comptes : sans cette mention on croirait
              qu'il appartient au compte affiché, et on ne saurait pas où le modifier. */}
          {contact.compte_id !== compteId && (
            <button
              type="button"
              onClick={() => navigate(`/comptes/${contact.compte_id}`)}
              title={`Rattaché à ${contact.compte_nom} — ouvrir cette fiche`}
              className="mt-0.5 inline-flex max-w-full items-center rounded bg-km-blue-soft px-1.5 py-px text-km-tiny font-semibold text-km-blue hover:bg-km-blue/20"
            >
              <span className="truncate">via {contact.compte_nom}</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
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

      {/* ══ LA FRAÎCHEUR DU LIEN ══
          Rien ne distinguait le contact qu'on vient d'avoir au téléphone de celui dont personne ne
          sait s'il travaille encore là. 3 206 contacts sur 3 416 n'ont jamais été touchés : afficher
          le silence est ce qui le fait cesser. */}
      <p className="flex items-center gap-1.5 text-km-label">
        <i className={cn('h-1.5 w-1.5 shrink-0 rounded-full', {
          vive: 'bg-km-green', tiede: 'bg-km-amber', froide: 'bg-km-red', jamais: 'bg-km-faint',
        }[fraicheur?.temperature ?? 'jamais'])} />
        <span className={cn('truncate', fraicheur?.temperature === 'froide' ? 'font-semibold text-km-red' : 'text-km-muted')}>
          {libelleFraicheur(fraicheur)}
        </span>
      </p>

      <div className="mt-auto flex gap-1.5 border-t border-km-line-soft pt-2">
        <button
          type="button"
          onClick={() => tel && void appelerNumero(tel)}
          disabled={!tel}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-km border border-km-line bg-km-surface py-1 text-km-label font-semibold text-km-muted transition-colors',
            tel ? 'hover:border-km-green-line hover:bg-km-green-soft hover:text-km-green' : 'pointer-events-none opacity-40',
          )}
        >
          <Phone className="h-3 w-3" /> Appeler
        </button>
        {/* ══ LE MAIL S'ÉCRIT DANS KIMATCH ══
            William, 13/09/2026 : « il faudrait que ça ouvre le volet latéral d'envoi mail intégré
            dans Kimatch et non une application de l'ordinateur ».

            `mailto:` sortait de l'outil — il ouvrait le client de messagerie du poste, et l'échange
            n'était consigné nulle part. Le volet, lui, rattache l'interaction au contact et au
            compte, ce qui est précisément ce que la pastille de fraîcheur au-dessus mesure : sans
            ce changement, elle resterait grise même après trois mails envoyés.

            Le repli sur `mailto:` est conservé si le volet n'est pas monté : mieux vaut un client
            externe qu'un bouton mort. */}
        <button
          type="button"
          onClick={() => {
            if (!contact.email) return
            if (ouvrirEmail) ouvrirEmail({ a: contact.email, nom: `${contact.prenom} ${contact.nom}`, contactId: contact.id, compteId })
            else window.location.href = `mailto:${contact.email}`
          }}
          disabled={!contact.email}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-km border border-km-line bg-km-surface py-1 text-km-label font-semibold text-km-muted transition-colors',
            contact.email ? 'hover:border-km-blue-soft hover:bg-km-blue-soft hover:text-km-blue' : 'pointer-events-none opacity-40',
          )}
        >
          <Mail className="h-3 w-3" /> E-mail
        </button>
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

function LigneCompteur({
  c,
  relais,
  onDesigner,
}: {
  c: CompteurRelais
  relais: Contact | undefined
  onDesigner: (c: CompteurRelais) => void
}) {
  const Icone = c.type_energie === 'gaz' ? Flame : Zap
  const couvert = !!c.relais_contact_id
  return (
    <div
      className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_56px_minmax(0,1.4fr)] items-center gap-2 border-b border-km-line-soft px-3 py-2 text-km-label last:border-b-0"
      // LE RAIL PORTE L'ÉTAT EN PERMANENCE, comme sur le tableau de bord : la couleur se lit avant
      // le texte, et le texte reste là pour qui ne distingue pas les deux teintes.
      style={{ boxShadow: `inset 3px 0 0 0 ${couvert ? 'rgb(28 107 122)' : 'rgb(184 81 69)'}` }}
    >
      <div className="min-w-0">
        <p className="truncate font-semibold text-km-text">
          <Icone className={cn('mr-1 inline h-3 w-3 shrink-0', c.type_energie === 'gaz' ? 'text-km-amber' : 'text-km-blue')} strokeWidth={2.3} />
          {c.libelle || c.adresse || 'Sans libellé'}
        </p>
        <p className="truncate text-km-tiny tabular-nums text-km-faint">{c.numero_pdl}</p>
      </div>
      <p className="truncate text-km-muted">
        {c.sous_contrat ? 'Sous contrat' : <span className="text-km-faint">Hors contrat</span>}
      </p>
      <p className="text-right tabular-nums text-km-muted">{c.mwh == null ? '—' : Math.round(c.mwh).toLocaleString('fr-FR')}</p>
      <div className="flex min-w-0 items-center gap-1.5">
        {relais ? (
          <>
            <Link to={`/contacts/${relais.id}`} className="truncate font-semibold text-km-piste hover:underline">
              {relais.prenom} {relais.nom}
            </Link>
            <button
              type="button"
              onClick={() => onDesigner(c)}
              className="shrink-0 rounded border border-transparent px-1 text-km-tiny font-semibold text-km-faint hover:border-km-line hover:text-km-piste"
            >
              Changer
            </button>
          </>
        ) : (
          <>
            <span className="truncate font-semibold text-km-red">Aucun relais</span>
            {/* « DÉSIGNER » ET NON « AJOUTER » : on ne crée pas un membre de conseil syndical dans
                l'absolu, on désigne quelqu'un comme relais DE CE COMPTEUR. Le mot suit le modèle. */}
            <button
              type="button"
              onClick={() => onDesigner(c)}
              className="shrink-0 rounded-km-sm border border-km-piste/40 bg-km-piste-soft px-1.5 py-px text-km-tiny font-bold text-km-piste hover:bg-km-piste/15"
            >
              Désigner
            </button>
          </>
        )}
      </div>
    </div>
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

  const parId = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts])

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
    const parNom = (a: Contact, b: Contact) => `${a.nom}${a.prenom}`.localeCompare(`${b.nom}${b.prenom}`, 'fr')
    return {
      decident: decident.sort(parNom),
      administrent: administrent.sort(parNom),
      relais: relais.sort(parNom),
      aQualifier: aQualifier.sort(parNom),
    }
  }, [contacts, zoneRelais])

  const signataires = decident.filter((c) => c.roles.includes('SIGNATAIRE')).length
  const compteursVisibles = (couverture?.compteurs ?? []).slice(0, COMPTEURS_VISIBLES)
  const resteCompteurs = (couverture?.compteurs.length ?? 0) - compteursVisibles.length

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
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
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
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
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
          synthese={
            couverture.sousContrat === 0
              ? `${relais.length} relais · aucun compteur sous contrat sur ce compte`
              : `${relais.length} relais · ${couverture.couverts} compteur${couverture.couverts > 1 ? 's' : ''} couvert${couverture.couverts > 1 ? 's' : ''} sur ${couverture.sousContrat} sous contrat`
          }
        >
          <div className="grid gap-2 lg:grid-cols-[190px_minmax(0,1fr)]">
            {/* ══ LA COUVERTURE AVANT LES PERSONNES ══
                Trois relais affichés en cartes donneraient l'impression que le sujet est réglé.
                « 3 sur 33 » dit la vérité en un chiffre, et « 30 sans filet » la rend actionnable. */}
            <div className="flex flex-col justify-center rounded-[16px] bg-km-surface px-4 py-3">
              <p className="text-km-label font-bold uppercase tracking-[0.06em] text-km-faint">Couverture</p>
              <p className="mt-1.5 text-[28px] font-bold leading-none tracking-[-.04em] tabular-nums text-km-piste">
                {couverture.taux}<span className="ml-0.5 text-km-lead text-km-muted">%</span>
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-km-soft">
                <div className="h-full rounded-full bg-km-piste" style={{ width: `${couverture.taux}%` }} />
              </div>
              {couverture.sansFilet > 0 ? (
                <p className="mt-2 flex items-start gap-1 border-t border-km-line-soft pt-2 text-km-label font-semibold text-km-red">
                  <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                  {couverture.sansFilet} compteur{couverture.sansFilet > 1 ? 's' : ''} sans filet
                </p>
              ) : (
                <p className="mt-2 flex items-start gap-1 border-t border-km-line-soft pt-2 text-km-label font-semibold text-km-green">
                  <ShieldCheck className="mt-px h-3 w-3 shrink-0" /> Tout est couvert
                </p>
              )}
            </div>

            <div className="min-w-0 overflow-hidden rounded-[16px] bg-km-surface">
              {couverture.compteurs.length === 0 ? (
                <p className="px-4 py-6 text-center text-km-body text-km-muted">Aucun compteur sur ce compte.</p>
              ) : (
                <>
                  <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_56px_minmax(0,1.4fr)] gap-2 border-b border-km-line bg-km-soft px-3 py-1.5 text-km-tiny font-bold uppercase tracking-[0.06em] text-km-faint">
                    <span>Compteur</span><span>Contrat</span><span className="text-right">MWh</span><span>Relais CS</span>
                  </div>
                  {compteursVisibles.map((c) => (
                    <LigneCompteur key={c.id} c={c} relais={c.relais_contact_id ? parId.get(c.relais_contact_id) : undefined} onDesigner={setADesigner} />
                  ))}
                  {resteCompteurs > 0 && (
                    <p className="px-3 py-1.5 text-km-label text-km-faint">
                      et {resteCompteurs} autre{resteCompteurs > 1 ? 's' : ''} compteur{resteCompteurs > 1 ? 's' : ''} — le détail est dans l’onglet Compteurs
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </Bande>
      )}

      <DialogDesignerRelais
        compteur={aDesigner}
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
                <span className="max-w-[16ch] truncate">{c.prenom} {c.nom}</span>
                <UserPlus className="h-3 w-3 shrink-0 text-km-green" />
              </Link>
            ))}
          </div>
        </Bande>
      )}
    </div>
  )
}
