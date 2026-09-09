import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Compte, Contact, Mandat } from '@/types/domain'
import { PictoCompte, PictoContact, PictoEnveloppe, PictoLoupe, PictoMandat, PictoTelephone, PictoValidite } from './pictos'

/**
 * ══ LES TROIS CARTES D'IDENTITÉ DU MANDAT ══
 *
 * Maquette de William, 08/09/2026 : qui mandate, qui signe, sur quoi le mandat porte.
 *
 * ── LA RÈGLE DE COMPOSITION EST LA PLUS IMPORTANTE DU LOT ──
 *
 * Les trois cartes ont la même hauteur (`items-stretch`) et aucun contenu ne flotte : chacune est
 * une colonne flex — en-tête fixe en haut, corps `flex-1` qui centre son contenu sur la hauteur
 * restante. Sans ça, la carte la plus courte colle son texte en haut et laisse un vide en bas, et
 * les trois cartes cessent de se lire comme une rangée.
 *
 * ── LE LIEN « OUVRIR → » A DISPARU LE 09/09/2026 ──
 *
 * William : « supprime le bouton Ouvrir, les noms cliquables suffisent ». Deux chemins vers la même
 * fiche dans un en-tête de 19 px de haut, c'est une commande de trop : le nom du compte, en gras au
 * centre de la carte, est la cible que l'œil vise déjà.
 *
 * ── LE SÉLECTEUR ⇄ CHANGE, IL NE CRÉE PAS ──
 *
 * Le handoff prévoyait « ＋ Créer « X » » en pied de liste. William, 08/09/2026 : « uniquement
 * changer ». C'est le bon arbitrage — créer un compte depuis une fiche mandat, sans SIRET ni
 * adresse, produit un doublon plus souvent qu'un service, et Kimatch a déjà son menu « Créer ».
 */

/* 10 px et non 9 : William, 09/09/2026, « augmente la taille des textes secondaires ». Une
   étiquette de 9 px en majuscules espacées se devine plus qu'elle ne se lit. */
const ETIQUETTE = 'text-[10px] font-extrabold uppercase tracking-[.06em] text-[#a3a5a0]'
const TITRE_CARTE = 'text-[9.5px] font-extrabold uppercase tracking-[.08em] text-[#a3a5a0]'

function initiales(texte: string): string {
  return texte
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase() ?? '')
    .join('')
}

/** Le SIRET se lit par groupes, et se copie sans les espaces qu'on a ajoutés pour le lire. */
function siretLisible(siret: string): string {
  const brut = siret.replace(/\s/g, '')
  if (brut.length !== 14) return siret
  return `${brut.slice(0, 3)} ${brut.slice(3, 6)} ${brut.slice(6, 9)} ${brut.slice(9)}`
}

function EnteteCarte({
  picto,
  fondPicto,
  couleurPicto,
  titre,
  onChanger,
  titreChanger,
}: {
  picto: React.ReactNode
  fondPicto: string
  couleurPicto: string
  titre: string
  onChanger?: () => void
  titreChanger?: string
}) {
  return (
    <div className="mb-[9px] flex items-center gap-[7px]">
      <span
        className="inline-flex flex-none items-center justify-center"
        style={{ width: 19, height: 19, borderRadius: 6, background: fondPicto, color: couleurPicto }}
      >
        {picto}
      </span>
      <span className={TITRE_CARTE}>{titre}</span>
      <span className="flex-1" />
      {onChanger && (
        <button
          type="button"
          onClick={onChanger}
          title={titreChanger}
          className="inline-flex flex-none select-none items-center justify-center bg-white text-[9.5px] text-[#5c5f66] transition-colors hover:bg-[#f6f6f4] hover:text-[#16181d]"
          style={{ width: 19, height: 19, border: '1px solid #e0dfdb', borderRadius: 6 }}
        >
          ⇄
        </button>
      )}
    </div>
  )
}

/**
 * Le panneau de recherche du sélecteur ⇄.
 *
 * Cinq résultats au plus : au-delà, on ne choisit plus, on parcourt — et le bon geste devient la
 * recherche, pas la liste. `Échap` referme, le champ prend le focus à l'ouverture.
 */
function PanneauSelection<T extends { id: string }>({
  placeholder,
  elements,
  libelle,
  onChoisir,
  onFermer,
}: {
  placeholder: string
  elements: T[]
  libelle: (e: T) => string
  onChoisir: (e: T) => void
  onFermer: () => void
}) {
  const [recherche, setRecherche] = useState('')
  const champ = useRef<HTMLInputElement>(null)

  useEffect(() => {
    champ.current?.focus()
    const auClavier = (e: KeyboardEvent) => { if (e.key === 'Escape') onFermer() }
    window.addEventListener('keydown', auClavier)
    return () => window.removeEventListener('keydown', auClavier)
  }, [onFermer])

  const q = recherche.trim().toLowerCase()
  const resultats = (q ? elements.filter((e) => libelle(e).toLowerCase().includes(q)) : elements).slice(0, 5)

  return (
    <div
      className="animate-km-fade mb-2"
      style={{ border: '1px solid #e0dfdb', borderRadius: 9, background: '#fff', boxShadow: '0 8px 22px rgba(0,0,0,.10)', padding: 7 }}
    >
      <div
        className="flex items-center gap-1.5"
        style={{ border: '1px solid #e0dfdb', borderRadius: 7, padding: '5px 8px', background: '#fbfbfa' }}
      >
        <span className="flex-none text-[#a3a5a0]"><PictoLoupe taille={11} /></span>
        <input
          ref={champ}
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 border-0 bg-transparent text-[11px] text-[#16181d] outline-none"
        />
      </div>
      {resultats.length === 0 ? (
        <p className="px-2 py-2 text-[11px] text-[#a3a5a0]">Aucun résultat.</p>
      ) : (
        resultats.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onChoisir(e)}
            className="block w-full rounded-md px-2 py-1.5 text-left text-[11.5px] font-semibold hover:bg-[#f6f6f4]"
          >
            {libelle(e)}
          </button>
        ))
      )}
    </div>
  )
}

export function CarteCompte({
  compte,
  comptes,
  peutModifier,
  onChangerCompte,
  onCopie,
  nbPdlCouverts,
}: {
  compte: Compte | undefined
  comptes: Compte[]
  peutModifier: boolean
  onChangerCompte: (compteId: string) => void
  onCopie: (message: string) => void
  /** Sert la mise en garde : les PDL couverts ne suivent pas le changement de compte. */
  nbPdlCouverts: number
}) {
  const [ouvert, setOuvert] = useState(false)
  const adresse = [compte?.rue, [compte?.code_postal, compte?.ville].filter(Boolean).join(' ')]
    .filter((p) => p && String(p).trim())
    .join(', ')

  return (
    <div
      className="flex flex-col"
      style={{ background: '#fff', border: '1px solid #e7e6e2', borderRadius: 12, padding: '11px 13px' }}
    >
      <EnteteCarte
        picto={<PictoCompte taille={10} />}
        fondPicto="#eef0f4"
        couleurPicto="#3b5f8a"
        titre="Compte"
        titreChanger="Changer le compte"
        onChanger={peutModifier ? () => setOuvert((v) => !v) : undefined}
      />

      {ouvert && (
        <>
          {/* Changer le compte ne déplace PAS le périmètre : les PDL restent ceux des sites du
              compte d'origine. On le dit avant, pas après — c'est un geste de correction, pas un
              transfert de portefeuille. */}
          {nbPdlCouverts > 0 && (
            <p
              className="mb-2 rounded-md px-2 py-1.5 text-[10px] leading-snug"
              style={{ background: '#fdf9f0', border: '1px solid #f0e4cd', color: '#8a6420' }}
            >
              Ce mandat couvre {nbPdlCouverts} PDL du compte actuel. Ils ne suivront pas : le
              périmètre est à reprendre après le changement.
            </p>
          )}
          <PanneauSelection
            placeholder="Rechercher un compte…"
            elements={comptes}
            libelle={(c) => c.nom}
            onChoisir={(c) => { onChangerCompte(c.id); setOuvert(false) }}
            onFermer={() => setOuvert(false)}
          />
        </>
      )}

      <div className="flex flex-1 flex-col justify-center gap-[9px]">
        <div className="flex items-center gap-[9px]">
          <span
            className="inline-flex flex-none items-center justify-center text-[11px] font-extrabold"
            style={{ width: 32, height: 32, borderRadius: 9, background: '#eef0f4', color: '#3b5f8a' }}
          >
            {initiales(compte?.nom ?? '—')}
          </span>
          <div className="min-w-0">
            {compte ? (
              <Link
                to={`/comptes/${compte.id}`}
                className="block truncate text-[13.5px] tracking-[-.01em] text-km-text hover:text-[#3b5f8a] hover:underline"
                style={{ fontWeight: 750 }}
              >
                {compte.nom}
              </Link>
            ) : (
              <span className="text-[13.5px] font-semibold text-[#a3a5a0]">Aucun compte</span>
            )}
            {/* « mandant » n'est pas une donnée : c'est le RÔLE du compte dans ce mandat. Le segment,
                lui, vient de `comptes.segment`. William a posé la question le 09/09/2026 — la
                réponse vit ici pour que personne ne la repose. */}
            <div className="mt-px truncate text-[11.5px] text-[#83868f]">
              {compte ? [compte.segment, 'mandant'].filter(Boolean).join(' · ') : 'Choisissez le compte mandant avec ⇄'}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-[5px]" style={{ borderTop: '1px solid #f5f4f1', paddingTop: 9 }}>
          <div className="flex items-center gap-2">
            <span className={`${ETIQUETTE} w-[56px] flex-none`}>SIRET</span>
            {compte?.siret ? (
              <button
                type="button"
                title="Copier"
                onClick={() => {
                  void navigator.clipboard.writeText(compte.siret?.replace(/\s/g, '') ?? '')
                  onCopie('⧉ Copié')
                }}
                className="cursor-copy truncate font-mono text-[12px] font-semibold hover:text-[#3b5f8a]"
              >
                {siretLisible(compte.siret)} ⧉
              </button>
            ) : (
              <span className="text-[12px] text-[#c0c2bd]">—</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`${ETIQUETTE} w-[56px] flex-none`}>Siège</span>
            <span className="truncate text-[12px] text-[#3e4148]">{adresse || '—'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function CarteSignataire({
  contact,
  contacts,
  peutModifier,
  onChangerSignataire,
  onCopie,
}: {
  contact: Contact | undefined
  contacts: Contact[]
  peutModifier: boolean
  onChangerSignataire: (contactId: string) => void
  onCopie: (message: string) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const nom = contact ? `${contact.prenom} ${contact.nom}`.trim() : ''
  const mobile = contact?.telephone_mobile || contact?.telephone

  return (
    <div
      className="flex flex-col"
      style={{
        background: 'linear-gradient(135deg,#faf7ff,#fff)',
        border: '1.5px solid #e2d9ef',
        borderRadius: 12,
        padding: '11px 13px',
      }}
    >
      <EnteteCarte
        picto={<PictoContact taille={10} />}
        fondPicto="#f1edf7"
        couleurPicto="#7c5bb0"
        titre="Signataire"
        titreChanger="Changer le signataire"
        onChanger={peutModifier ? () => setOuvert((v) => !v) : undefined}
      />

      {ouvert && (
        <PanneauSelection
          placeholder="Rechercher un contact…"
          elements={contacts}
          libelle={(c) => `${c.prenom} ${c.nom}`.trim()}
          onChoisir={(c) => { onChangerSignataire(c.id); setOuvert(false) }}
          onFermer={() => setOuvert(false)}
        />
      )}

      <div className="flex flex-1 flex-col justify-center gap-[9px]">
        <div className="flex items-center gap-[9px]">
          <div
            className="flex flex-none items-center justify-center text-[11px] font-extrabold text-white"
            style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#7c5bb0,#9678c9)' }}
          >
            {initiales(nom || '—')}
          </div>
          <div className="min-w-0 flex-1">
            {contact ? (
              <Link
                to={`/contacts/${contact.id}`}
                className="block truncate text-[13.5px] tracking-[-.01em] text-km-text hover:text-[#7c5bb0] hover:underline"
                style={{ fontWeight: 750 }}
              >
                {nom}
              </Link>
            ) : (
              <span className="text-[13.5px] font-semibold text-[#a3a5a0]">Aucun signataire</span>
            )}
            {/* Sans signataire, le mandat ne peut pas partir en signature : la ligne dit le blocage
                plutôt qu'un « — » qu'on interprète comme une donnée manquante sans conséquence. */}
            <div className="mt-px truncate text-[11.5px] text-[#83868f]">
              {contact ? contact.fonction || 'Fonction non renseignée' : 'Requis pour envoyer en signature'}
            </div>
          </div>

          {/* Les deux gestes qu'on fait depuis un mandat en attente : relancer par téléphone, ou par
              courriel. Désactivés visuellement quand la coordonnée manque, plutôt que masqués — leur
              absence est en soi une information sur la fiche du contact. */}
          <div className="flex flex-none gap-[5px]">
            <a
              href={mobile ? `tel:${mobile}` : undefined}
              title={mobile ? `Appeler ${nom}` : 'Aucun numéro'}
              aria-disabled={!mobile}
              className={`flex items-center justify-center bg-white transition-colors ${mobile ? 'text-[#0d7a5f] hover:border-[#c4ddd3] hover:bg-[#eaf4f0]' : 'pointer-events-none text-[#c9cbc6]'}`}
              style={{ width: 27, height: 27, border: '1px solid #e0dfdb', borderRadius: 8 }}
            >
              <PictoTelephone taille={13} />
            </a>
            <a
              href={contact?.email ? `mailto:${contact.email}` : undefined}
              title={contact?.email ? `Écrire à ${nom}` : 'Aucune adresse'}
              aria-disabled={!contact?.email}
              className={`flex items-center justify-center bg-white transition-colors ${contact?.email ? 'text-[#3b5f8a] hover:border-[#cfd8e4] hover:bg-[#eef0f4]' : 'pointer-events-none text-[#c9cbc6]'}`}
              style={{ width: 27, height: 27, border: '1px solid #e0dfdb', borderRadius: 8 }}
            >
              <PictoEnveloppe taille={13} />
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-[5px]" style={{ borderTop: '1px solid #eee7f6', paddingTop: 9 }}>
          <div className="flex items-center gap-2">
            <span className={`${ETIQUETTE} w-[56px] flex-none`}>Email</span>
            {contact?.email ? (
              <button
                type="button"
                title="Copier"
                onClick={() => { void navigator.clipboard.writeText(contact.email as string); onCopie('⧉ Copié') }}
                className="cursor-copy truncate text-[12px] hover:text-[#7c5bb0]"
              >
                {contact.email}
              </button>
            ) : (
              <span className="text-[12px] text-[#c0c2bd]">—</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`${ETIQUETTE} w-[56px] flex-none`}>Mobile</span>
            <span className="truncate font-mono text-[12px] text-[#3e4148]">{mobile || '—'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * ══ LES DEUX SEULS ACD, ET ILS NE SE MODIFIENT PAS ICI ══
 *
 * William, 09/09/2026 : « les ACD inclus sont automatiques (en fonction de la demande de mandat)
 * mais ils ne peuvent pas être modifiés manuellement ».
 *
 * La maquette proposait deux lignes cliquables. C'était un contresens métier : la couverture d'un
 * mandat est ce que le document SIGNÉ porte. La rendre modifiable après coup laisserait la fiche
 * affirmer une couverture que le PDF ne dit pas — et comme on ne fait jamais d'avenant, il n'existe
 * aucun geste légitime qui changerait la couverture d'un mandat existant. Un périmètre différent,
 * c'est un mandat de plus.
 *
 * La carte reste donc en lecture, avec ses trois états visuels : le vert dit que la couverture est
 * effective, l'ambre qu'elle est prévue mais pas encore signée, le gris qu'elle n'existe pas.
 */
const ACD = [
  { code: 'KIWI', lettre: 'K', nom: 'ACD KiWee' },
  { code: 'ENERGIX', lettre: 'E', nom: 'ACD Energix' },
] as const

export function CarteTypeMandat({ mandat }: { mandat: Mandat }) {
  const actif = mandat.statut === 'ACTIF'

  return (
    <div
      className="flex flex-col"
      style={{ background: '#fff', border: '1px solid #e7e6e2', borderRadius: 12, padding: '11px 13px' }}
    >
      <EnteteCarte
        picto={<PictoMandat taille={10} />}
        fondPicto="#f5e9cf"
        couleurPicto="#8a6420"
        titre="Type de mandat"
      />

      <div className="flex flex-1 flex-col justify-center gap-[7px]">
        {ACD.map(({ code, lettre, nom }) => {
          const inclus = mandat.courtier_codes.includes(code)
          /* Trois états, et le vert n'est pas décoratif : il dit que la couverture est EFFECTIVE.
             Un ACD inclus sur un mandat pas encore signé ne couvre encore rien — l'ambre le dit. */
          const teinte = inclus ? (actif ? '#0d7a5f' : '#9a7a0d') : '#a3a5a0'
          const fond = inclus ? (actif ? '#f4faf7' : '#fdfaf0') : '#fff'
          const bordure = inclus ? (actif ? '#d3e5de' : '#f0e4cd') : '#e7e6e2'

          return (
            <div
              key={code}
              className={`flex w-full items-center gap-2 ${inclus ? '' : 'opacity-70'}`}
              style={{
                background: fond,
                border: inclus ? `1px solid ${bordure}` : '1px dashed #dcdad5',
                borderRadius: 9,
                padding: '8px 10px',
              }}
            >
              <span
                className="inline-flex flex-none items-center justify-center text-[10px] font-extrabold"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 7,
                  background: inclus ? teinte : '#f0efec',
                  color: inclus ? '#fff' : '#a3a5a0',
                }}
              >
                {lettre}
              </span>
              <span className="flex-1 text-left text-[12.5px] font-bold" style={{ color: inclus ? '#16181d' : '#a3a5a0' }}>
                {nom}
              </span>
              <span
                className="flex-none text-[9px] font-extrabold uppercase tracking-[.05em]"
                style={{ color: teinte }}
              >
                {inclus ? 'Inclus' : 'non inclus'}
              </span>
            </div>
          )
        })}

        {/* Une seule ligne : c'est cette note qui rendait la carte plus haute que ses trois
            voisines, et donc leur contenu flottant au milieu d'un vide. La règle complète — un
            changement de couverture fait un nouveau mandat, jamais un avenant — vit dans l'infobulle
            et dans le commentaire d'en-tête, là où on la cherche. */}
        <p
          className="pt-[3px] text-[10px] leading-[1.45] text-[#a3a5a0]"
          title="Un changement de couverture donne lieu à un nouveau mandat, jamais à un avenant."
        >
          Défini à la demande de mandat.
        </p>
      </div>
    </div>
  )
}

/**
 * ══ LA VALIDITÉ, DANS LA RANGÉE ══
 *
 * William, 09/09/2026 : la frise de validité quitte le bloc « Détail » pour rejoindre Compte,
 * Signataire et Type de mandat — « et je veux absolument éviter l'effet de flottement quand les
 * marges au-dessus et en dessous du contenu sont trop larges ».
 *
 * ── CE QUI COMPTE TIENT EN TROIS LIGNES ──
 *
 * Le temps qui reste, en grand : c'est la seule question qu'on pose à un mandat actif, et 78 des
 * 1 466 mandats de la base sont déjà expirés. La jauge situe ce chiffre entre deux bornes, et les
 * deux dates ferment la lecture. Rien d'autre — la carte doit remplir sa hauteur sans la meubler.
 *
 * ── LE SEUIL EST À 90 JOURS, PAS À 60 ──
 *
 * Un mandat qui expire dans deux mois est déjà un problème : il faut le refaire signer, et une
 * signature client prend des semaines. L'ambre à 90 jours laisse le temps d'agir ; le rouge à 30
 * dit que c'est maintenant.
 */
export function CarteValidite({ debut, fin }: { debut: string | null; fin: string | null }) {
  const t0 = debut ? new Date(debut).getTime() : NaN
  const t1 = fin ? new Date(fin).getTime() : NaN
  const maintenant = Date.now()
  const connue = Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0

  const joursRestants = Number.isFinite(t1) ? Math.round((t1 - maintenant) / 86_400_000) : null
  const pct = connue ? Math.min(100, Math.max(0, ((maintenant - t0) / (t1 - t0)) * 100)) : 0

  const ton =
    joursRestants == null
      ? { texte: '#a3a5a0', barre: '#dcdad5' }
      : joursRestants < 0
        ? { texte: '#5c5f66', barre: '#c9cbc6' }
        : joursRestants < 30
          ? { texte: '#c2452d', barre: '#c2452d' }
          : joursRestants < 90
            ? { texte: '#b57a24', barre: '#d19a44' }
            : { texte: '#0d7a5f', barre: '#0d7a5f' }

  /**
   * « 36 mois », « 23 jours », « 2 mois de dépassement » — en jours sous trois mois, en mois au-delà.
   *
   * ── LES MOIS SE COMPTENT AU CALENDRIER, PAS EN TRANCHES DE 30 JOURS ──
   *
   * William, 09/09/2026, sur le mandat SAS TVPJ : « il est indiqué 37 mois restants alors que du
   * 08/09/2026 au 08/09/2029 il y a pourtant 3 ans donc 36 mois ». Il avait raison, et la cause
   * était une division : 1 095 jours ÷ 30 = 36,5, arrondi à 37. Un mois moyen fait 30,44 jours, et
   * l'écart se cumule — sur trois ans il vaut un mois entier, exactement celui qu'on voyait.
   *
   * On compte donc les mois de calendrier écoulés entre les deux dates, puis les jours qui
   * dépassent, et l'on arrondit sur ce reste. 35 mois et 30 jours donnent bien 36.
   */
  function restant(): { valeur: string; suffixe: string } {
    if (joursRestants == null || !Number.isFinite(t1)) return { valeur: '—', suffixe: 'échéance inconnue' }
    const n = Math.abs(joursRestants)
    if (n < 90) return { valeur: `${n} jour${n > 1 ? 's' : ''}`, suffixe: joursRestants < 0 ? 'de dépassement' : 'restants' }

    const [tot, apresD] = joursRestants < 0 ? [new Date(t1), new Date(maintenant)] : [new Date(maintenant), new Date(t1)]
    let mois = (apresD.getFullYear() - tot.getFullYear()) * 12 + (apresD.getMonth() - tot.getMonth())
    if (apresD.getDate() < tot.getDate()) mois--
    const borne = new Date(tot)
    borne.setMonth(borne.getMonth() + mois)
    const joursEnPlus = Math.round((apresD.getTime() - borne.getTime()) / 86_400_000)
    // Le reste s'arrondit sur la longueur du mois qu'on vient de parcourir, pas sur 30.
    const longueurDuMois = new Date(borne.getFullYear(), borne.getMonth() + 1, 0).getDate()
    const arrondi = mois + (joursEnPlus >= longueurDuMois / 2 ? 1 : 0)

    return { valeur: `${arrondi} mois`, suffixe: joursRestants < 0 ? 'de dépassement' : 'restants' }
  }
  const { valeur, suffixe } = restant()

  return (
    <div
      className="flex flex-col"
      style={{ background: '#fff', border: '1px solid #e7e6e2', borderRadius: 12, padding: '11px 13px' }}
    >
      <EnteteCarte
        picto={<PictoValidite taille={10} />}
        fondPicto="#f5e9cf"
        couleurPicto="#8a6420"
        titre="Validité"
      />

      <div className="flex flex-1 flex-col justify-center gap-[9px]">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[22px] font-extrabold leading-none tracking-[-.02em]" style={{ color: ton.texte }}>
            {valeur}
          </span>
          <span className="text-[11.5px] text-[#83868f]">{suffixe}</span>
        </div>

        {/* La jauge n'apparaît que si les deux bornes existent : une barre sans échelle ne situe
            rien, elle décore. */}
        {connue ? (
          <>
            <div className="relative h-[7px] rounded-full" style={{ background: '#f0efec' }}>
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${pct}%`, background: ton.barre }}
              />
              {pct > 0 && pct < 100 && (
                <div
                  className="absolute -top-[2px] h-[11px] w-[2px] rounded"
                  style={{ left: `${pct}%`, background: '#16181d' }}
                />
              )}
            </div>
            <div className="flex justify-between font-mono text-[10px]" style={{ color: '#a3a5a0' }}>
              <span>{new Date(t0).toLocaleDateString('fr-FR')}</span>
              <span>{new Date(t1).toLocaleDateString('fr-FR')}</span>
            </div>
          </>
        ) : (
          <p className="text-[11px] leading-snug text-[#a3a5a0]">
            {fin
              ? 'Date de début inconnue : la durée ne peut pas être située.'
              : 'Aucune date de fin. Elle se calcule à la signature, depuis la durée du mandat.'}
          </p>
        )}
      </div>
    </div>
  )
}
