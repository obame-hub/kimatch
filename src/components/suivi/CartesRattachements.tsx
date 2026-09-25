import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2, ChevronRight, Download, Eye, FileText, Loader2, Mail, Phone, Smartphone, Sparkles, Zap,
} from 'lucide-react'
import { urlOuvrableDocument } from '@/lib/data/documents'
import { FenetreApercu } from '@/components/document/FenetreApercu'
import { poserContexteAppel } from '@/lib/data/contexteAppel'
import { appelerNumero } from '@/lib/telephonie'
import { useOuvrirEmail } from '@/lib/voletEmail'
import { cn } from '@/lib/utils'
import type {
  CompteurDuContrat, ContactDuSuivi, PieceJointeSuivi, RattachementsSuivi,
} from '@/lib/data/rattachementsSuivi'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES RATTACHEMENTS D'UN SUIVI DE CONTRAT
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 25/09/2026 : « j'aimerais que tous les rattachements soient parfaitement organisés dans
 * des cards dédiées sur la page suivi […] le but étant que Fabien, qui utilise ces enregistrements,
 * puisse avoir toutes les informations centralisées au même endroit. »
 *
 * Direction retenue parmi trois maquettes : « la console ». Une bande d'état répond à cinq
 * questions avant toute carte — quoi, quelle énergie, quelle nature, jusqu'à quand, chez qui — puis
 * une grille de cartes autonomes.
 *
 * ══ QUI DÉFILE, ET QUI NE DÉFILE PAS ══
 *
 * William : « les cards contact principal, recommandation et compte doivent avoir des hauteurs
 * fixes et optimisées. Les autres cards en regard comme pièces du contrat ou compteurs doivent
 * pouvoir être scrollées si trop d'infos. »
 *
 * C'est la bonne coupe, et les chiffres la confirment : un contrat porte jusqu'à VINGT pièces
 * jointes et jusqu'à QUINZE compteurs, alors qu'un contact a toujours trois coordonnées et une
 * recommandation toujours un montant et une date. Les deux premières listes grandissent, les trois
 * autres non. La page elle-même ne défile donc pas : seules les deux listes le font, chez elles.
 *
 * ══ LE FOURNISSEUR N'A PLUS DE CARTE ══
 *
 * William : « relation fournisseur : inutile, à supprimer, car le nom du fournisseur sera déjà dans
 * le contrat ». Il est dans la bande d'état, et sur chaque compteur.
 */

/**
 * ══ AUCUNE HAUTEUR IMPOSÉE, NULLE PART ══
 *
 * Les deux cartes du bas sont côte à côte, et le contact a un contenu FIXE — un nom, trois
 * coordonnées, deux boutons. C'est donc lui qui donne sa hauteur à la rangée ; la liste des
 * compteurs l'épouse et défile dedans. Une hauteur en pixels aurait produit l'un ou l'autre
 * défaut : une carte contact rognée sur ses boutons, ou une carte compteurs à moitié vide.
 *
 * Seules les pièces du contrat portent une borne (`max-h`), parce que rien ne leur fait face.
 */
const ETIQUETTE = 'text-[10.5px] font-bold uppercase tracking-[0.08em] text-km-faint'

function dateCourte(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR')
}

/**
 * La durée d'un contrat : celle qui est écrite, ou celle que ses dates disent.
 *
 * Le `≈` distingue les deux. Sans lui, une déduction passerait pour une saisie, et l'on ne saurait
 * plus si le champ mérite d'être rempli.
 */
function dureeLisible(mois: number | null | undefined, debut: string | null | undefined, fin: string | null | undefined): string {
  if (mois) return `${mois} mois`
  if (!debut || !fin) return '—'
  const d = new Date(debut)
  const f = new Date(fin)
  if (Number.isNaN(d.getTime()) || Number.isNaN(f.getTime())) return '—'
  /* +1 : du 1er janvier 2028 au 31 décembre 2030, il y a 36 mois pleins, pas 35. La fin d'un
     contrat est le DERNIER jour couvert, pas le lendemain de sa couverture. */
  const ecart = (f.getFullYear() - d.getFullYear()) * 12 + (f.getMonth() - d.getMonth()) + 1
  return ecart > 0 ? `≈ ${ecart} mois` : '—'
}

function poids(octets: number | null): string {
  if (!octets) return ''
  if (octets >= 1024 * 1024) return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`
  return `${Math.round(octets / 1024)} ko`
}

/** L'extension, en trois lettres, pour la pastille d'un fichier. */
function extension(nom: string): string {
  const e = nom.toLowerCase().split('.').pop() ?? ''
  return (e === 'jpeg' ? 'jpg' : e).slice(0, 4).toUpperCase() || 'FIC'
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   LES PIÈCES JOINTES — visualiser et télécharger, partout où il y en a
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Deux gestes sur une pièce : la REGARDER, ou la PRENDRE. Et ce ne sont pas les mêmes.
 *
 * William, 25/09/2026 : « quand je veux visualiser un fichier, ouvre une popup avec la
 * visualisatrice. Actuellement ça me le télécharge ». Les deux boutons faisaient la même chose —
 * ouvrir l'adresse dans un onglet — et le navigateur, devant un `application/octet-stream` (le type
 * des 6 454 documents repris de Salesforce), enregistre au lieu d'afficher.
 *
 * L'œil ouvre donc une fenêtre d'aperçu DANS Kimatch ; la flèche, elle, télécharge vraiment. Les
 * deux passent par `urlOuvrableDocument` : le seau `documents` est privé, et l'adresse enregistrée
 * en base ne s'ouvre pas telle quelle. Voir la note du 25/09/2026 dans `documents.ts`.
 */
function GestesPiece({ piece }: { piece: PieceJointeSuivi }) {
  const [enCours, setEnCours] = useState<'voir' | 'prendre' | null>(null)
  const [erreur, setErreur] = useState(false)
  const [apercu, setApercu] = useState(false)

  async function prendre() {
    if (enCours) return
    setEnCours('prendre')
    setErreur(false)
    try {
      window.open(await urlOuvrableDocument(piece.url), '_blank', 'noopener')
    } catch {
      setErreur(true)
    } finally {
      setEnCours(null)
    }
  }

  if (erreur) {
    return <span className="shrink-0 text-km-label text-km-red">indisponible</span>
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        aria-label={`Visualiser ${piece.nom}`}
        title="Visualiser"
        onClick={() => setApercu(true)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-km border border-km-line bg-km-surface text-km-muted transition-colors hover:border-km-green hover:text-km-green"
      >
        <Eye className="h-3.5 w-3.5" />
      </button>
      {apercu && (
        <FenetreApercu
          document={{ id: piece.id, nom: piece.nom, nom_fichier: piece.nom_fichier, url: piece.url }}
          onFermer={() => setApercu(false)}
        />
      )}
      <button
        type="button"
        aria-label={`Télécharger ${piece.nom}`}
        title="Télécharger"
        onClick={() => void prendre()}
        className="inline-flex h-7 w-7 items-center justify-center rounded-km border border-km-line bg-km-surface text-km-muted transition-colors hover:border-km-green hover:text-km-green"
      >
        {enCours === 'prendre' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      </button>
    </span>
  )
}

/**
 * ══ LES PIÈCES DU CONTRAT SE DÉPLIENT ══
 *
 * William, 25/09/2026 : « les fichiers doivent être visibles quand je déplie la ligne pièces du
 * contrat ». Repliée, la ligne ne coûte que sa hauteur et annonce son nombre ; dépliée, elle rend
 * la liste, qui défile — un contrat en porte jusqu'à vingt.
 *
 * TOUJOURS REPLIÉE AU DÉPART, comme les compteurs et pour la même raison : la carte garde la même
 * hauteur d'un dossier à l'autre. Une liste ouverte d'office ici et fermée là ferait sauter la mise
 * en page à chaque fiche.
 */
function PiecesDepliables({ pieces }: { pieces: PieceJointeSuivi[] }) {
  const [ouvert, setOuvert] = useState(false)

  if (pieces.length === 0) {
    return (
      <div className="flex items-center gap-2 border-t border-km-line px-3.5 py-2.5">
        <FileText className="h-3.5 w-3.5 text-km-faint" strokeWidth={2} />
        <span className={ETIQUETTE}>Pièces du contrat</span>
        <span className="text-km-body text-km-faint">aucune</span>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        aria-expanded={ouvert}
        onClick={() => setOuvert((v) => !v)}
        className="flex w-full items-center gap-2 border-t border-km-line px-3.5 py-2.5 text-left transition-colors hover:bg-km-soft"
      >
        <ChevronRight
          className={cn('h-3.5 w-3.5 shrink-0 text-km-faint transition-transform', ouvert && 'rotate-90')}
          strokeWidth={2.4}
        />
        <FileText className="h-3.5 w-3.5 text-km-faint" strokeWidth={2} />
        <span className={ETIQUETTE}>Pièces du contrat</span>
        <span className="rounded-km-sm bg-km-soft px-1.5 py-px text-km-micro font-bold text-km-muted">{pieces.length}</span>
      </button>

      {ouvert && (
        <ul className="max-h-[232px] overflow-y-auto border-t border-km-line-soft">
          {pieces.map((p) => {
            const nom = p.nom_fichier || p.nom
            return (
              <li key={p.id} className="flex items-center gap-2.5 border-b border-km-line-soft px-3.5 py-2 last:border-b-0">
                <span className="flex h-8 w-[26px] shrink-0 items-center justify-center rounded-km-sm border border-km-line bg-km-soft text-km-micro font-extrabold text-km-muted">
                  {extension(nom)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-km-body font-semibold text-km-text" title={nom}>{nom}</span>
                  <span className="block text-km-label text-km-faint">
                    {[poids(p.taille_octets), dateCourte(p.date_creation)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <GestesPiece piece={p} />
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   LE CONTACT — la seule carte qui agit
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * « Appeler » quand il y a deux numéros.
 *
 * William : « 2 boutons appeler (choix du téléphone à appeler) et contacter ». Avec un seul numéro
 * le bouton compose directement — offrir un choix d'un seul élément est un clic pour rien. Avec
 * deux, le choix s'ouvre sous le bouton.
 *
 * L'INTENTION EST POSÉE AVANT DE COMPOSER : c'est elle qui ramènera l'appel dans le volet
 * d'activité de ce suivi. Voir `poserContexteAppel`.
 */
/**
 * Appeler CE numéro-là.
 *
 * William, 25/09/2026 : « les boutons sont trop gros ». Le bouton d'appel occupait toute la largeur
 * sous la fiche, et ouvrait un menu pour choisir entre le fixe et le mobile. Il se pose désormais au
 * bout de la ligne du numéro : le choix est fait par l'endroit où l'on clique, et le menu disparaît
 * avec lui.
 *
 * L'INTENTION EST POSÉE AVANT DE COMPOSER : c'est elle qui ramènera l'appel dans le volet
 * d'activité de ce suivi. Voir `poserContexteAppel`.
 */
function BoutonAppel({ numero, contact, societe, suiviId }: {
  numero: string
  contact: ContactDuSuivi
  societe: string | null
  suiviId: string
}) {
  const [message, setMessage] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  async function appeler() {
    if (enCours) return
    setEnCours(true)
    try {
      await poserContexteAppel(numero, suiviId)
      const retour = await appelerNumero(numero, {
        prenom: contact.prenom,
        nom: contact.nom,
        societe,
        fonction: contact.fonction,
      })
      /* `appelerNumero` rend une phrase quand quelque chose l'empêche — poste non prêt, numéro
         inutilisable. La taire ferait un bouton qui ne réagit pas. */
      if (retour) {
        setMessage(retour)
        window.setTimeout(() => setMessage(null), 6000)
      }
    } finally {
      setEnCours(false)
    }
  }

  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => void appeler()}
        title={`Appeler le ${numero}`}
        /* `w-[104px]` sur les deux : « les boutons doivent être de même taille ». Sans largeur
           imposée, « Appeler » et « Contacter » se dimensionnent sur leur texte et ne s'alignent
           jamais, l'un sous l'autre. */
        className="inline-flex h-9 w-[104px] min-h-[36px] items-center justify-center gap-1.5 rounded-km border border-km-green-line bg-km-green-soft text-km-label font-bold text-km-green transition-colors hover:bg-km-green hover:text-white"
      >
        {enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" strokeWidth={2.2} />}
        Appeler
      </button>
      {message && (
        <span className="absolute right-0 top-full z-10 mt-1 w-[220px] rounded-km border border-km-amber-line bg-km-amber-soft px-2 py-1 text-km-label text-km-amber">
          {message}
        </span>
      )}
    </span>
  )
}

function CarteContact({ contact, compteId, compteNom, suiviId }: {
  contact: ContactDuSuivi | null
  compteId: string | null
  compteNom: string | null
  suiviId: string
}) {
  /* `useOuvrirEmail` porte déjà la règle du brouillon en cours — il demande avant d'écraser un
     mail écrit. La recopier ici donnerait deux formulations de la même question. */
  const ouvrirEmail = useOuvrirEmail()

  if (!contact) {
    return (
      <Carte titre="Contact principal" icone={Sparkles}>
        <p className="px-3.5 py-4 text-km-body text-km-faint">
          Aucun contact principal sur ce suivi. Rattachez-en un pour pouvoir appeler et écrire d’ici.
        </p>
      </Carte>
    )
  }

  /* `personne` plutôt que `contact` : `ecrire` est une closure, et TypeScript n'y transporte pas
     le rétrécissement obtenu par le retour anticipé au-dessus. Même piège que dans `VoletEmail`. */
  const personne = contact
  const nomComplet = [personne.civilite, personne.prenom, personne.nom].filter(Boolean).join(' ')
  const initiales = `${personne.prenom?.[0] ?? ''}${personne.nom?.[0] ?? ''}`.toUpperCase()

  function ecrire() {
    if (!personne.email || !ouvrirEmail) return
    ouvrirEmail({
      a: personne.email,
      nom: nomComplet,
      contactId: personne.id,
      compteId: compteId ?? undefined,
      /* C'est CE champ qui ramènera le mail — et la réponse du client — dans le volet d'activité
         du suivi. Voir `ContexteEmail.suiviContratId`. */
      suiviContratId: suiviId,
    })
  }

  return (
    <Carte
      titre="Contact principal"
      icone={Sparkles}
      infobulle="Les appels et les emails lancés d’ici rejoignent le volet d’activité de ce suivi, réponses comprises."
    >
      <div className="flex min-h-0 flex-1 flex-col px-4 py-3">

        {/* ── L'identité ── */}
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-km-green-soft text-km-label font-bold text-km-green">
            {initiales || '—'}
          </span>
          <span className="min-w-0 flex-1">
            <Link
              to={`/contacts/${personne.id}`}
              className="block truncate text-[15.5px] font-bold tracking-[-0.015em] text-km-text hover:text-km-green"
            >
              {nomComplet}
            </Link>
            <span className="mt-px block truncate text-km-body text-km-muted">
              {personne.fonction || <span className="text-km-faint">fonction inconnue</span>}
            </span>
          </span>
        </div>

        {/* PLUS DE RÔLES ICI. William, 25/09/2026 : « oublie les rôles dans la card contact et
            optimise la verticalité pour que tout s'affiche sur mon écran sans scroll ». Ils
            coûtaient une ligne entière pour une information qui ne sert pas à décider d'appeler —
            et ils restent sur la fiche du contact, à un clic sur son nom. */}

        {/* ── Les coordonnées, chacune avec son geste au bout ── */}
        <div className="mt-3 flex flex-col">
          <LigneTelephone contact={personne} societe={compteNom} suiviId={suiviId} />
          <LigneCoordonnee
            icone={Mail}
            libelle="Email"
            valeur={personne.email}
            action={personne.email ? (
              <button
                type="button"
                onClick={ecrire}
                title={`Écrire à ${personne.email}`}
                className="inline-flex h-9 w-[104px] min-h-[36px] items-center justify-center gap-1.5 rounded-km border border-km-green-line bg-km-green-soft text-km-label font-bold text-km-green transition-colors hover:bg-km-green hover:text-white"
              >
                <Mail className="h-3.5 w-3.5" strokeWidth={2.2} /> Contacter
              </button>
            ) : undefined}
          />
        </div>

      </div>
    </Carte>
  )
}

/**
 * ══ UN SEUL CHAMP POUR DEUX NUMÉROS ══
 *
 * William, 25/09/2026 : « le téléphone mobile et téléphone doivent être le même champ mais
 * sélectionnable avec une flèche (permet de garder de la place verticale) ».
 *
 * Deux lignes pour deux numéros dont un seul sert à la fois, c'est de la hauteur dépensée pour rien
 * — et la carte doit tenir en regard des compteurs. La flèche bascule de l'un à l'autre ; le bouton
 * appelle CELUI QU'ON REGARDE, donc le choix se fait avant l'appel, sans menu.
 *
 * ELLE N'APPARAÎT QUE S'IL Y A DE QUOI BASCULER. Un contact qui n'a qu'un numéro n'a rien à
 * choisir, et une flèche inerte inviterait à cliquer pour rien.
 */
function LigneTelephone({ contact, societe, suiviId }: {
  contact: ContactDuSuivi
  societe: string | null
  suiviId: string
}) {
  const numeros = [
    contact.telephone ? { cle: 'fixe' as const, libelle: 'Téléphone', numero: contact.telephone, icone: Phone } : null,
    contact.telephone_mobile ? { cle: 'mobile' as const, libelle: 'Mobile', numero: contact.telephone_mobile, icone: Smartphone } : null,
  ].filter((n): n is NonNullable<typeof n> => n !== null)

  const [i, setI] = useState(0)

  if (numeros.length === 0) {
    return <LigneCoordonnee icone={Phone} libelle="Téléphone" valeur={null} mono />
  }

  const courant = numeros[Math.min(i, numeros.length - 1)]
  const Icone = courant.icone

  return (
    <div className="flex items-center gap-2.5 border-b border-km-line-soft py-1.5 last:border-b-0">
      <Icone className="h-3.5 w-3.5 shrink-0 text-km-faint" strokeWidth={2} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className="text-km-micro font-bold uppercase tracking-[0.07em] text-km-faint">{courant.libelle}</span>
          {numeros.length > 1 && (
            <button
              type="button"
              onClick={() => setI((v) => (v + 1) % numeros.length)}
              title={`Voir le ${numeros[(i + 1) % numeros.length].libelle.toLowerCase()}`}
              aria-label={`Voir le ${numeros[(i + 1) % numeros.length].libelle.toLowerCase()}`}
              className="inline-flex h-4 w-4 items-center justify-center rounded-km-sm text-km-faint transition-colors hover:bg-km-soft hover:text-km-text"
            >
              <ChevronRight className="h-3 w-3" strokeWidth={2.4} />
            </button>
          )}
        </span>
        <span className="block truncate font-mono text-km-name font-semibold text-km-text">{courant.numero}</span>
      </span>
      <BoutonAppel numero={courant.numero} contact={contact} societe={societe} suiviId={suiviId} />
    </div>
  )
}

/** Une coordonnée : son icône, son intitulé, sa valeur, et le geste qu'elle permet. */
function LigneCoordonnee({ icone: Icone, libelle, valeur, mono, action }: {
  icone: typeof Phone
  libelle: string
  valeur: string | null
  mono?: boolean
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-km-line-soft py-1.5 last:border-b-0">
      <Icone className="h-3.5 w-3.5 shrink-0 text-km-faint" strokeWidth={2} />
      <span className="min-w-0 flex-1">
        <span className="block text-km-micro font-bold uppercase tracking-[0.07em] text-km-faint">{libelle}</span>
        <span className={cn('block truncate text-km-name font-semibold text-km-text', mono && 'font-mono')}>
          {valeur || <span className="font-normal text-km-faint">—</span>}
        </span>
      </span>
      {action}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   LA COQUILLE D'UNE CARTE
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

function Carte({ titre, icone: Icone, compteur, aDroite, infobulle, children, className }: {
  titre: string
  icone: typeof FileText
  compteur?: number
  aDroite?: React.ReactNode
  /** Ce qu'on aurait écrit sous la carte si la hauteur le permettait. */
  infobulle?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex min-h-0 flex-col overflow-hidden rounded-km-md border border-km-line bg-km-surface', className)}>
      <div className="flex shrink-0 items-center gap-2 border-b border-km-line px-3.5 py-2">
        <Icone className="h-3.5 w-3.5 text-km-faint" strokeWidth={2} />
        <span className={ETIQUETTE} title={infobulle}>{titre}</span>
        {compteur != null && (
          <span className="rounded-km-sm bg-km-soft px-1.5 py-px text-km-micro font-bold text-km-muted">{compteur}</span>
        )}
        {aDroite && <span className="ml-auto">{aDroite}</span>}
      </div>
      {children}
    </section>
  )
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   L'ENSEMBLE
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export function CartesRattachements({ data, suiviId, compteId, compteNom, contratId }: {
  data: RattachementsSuivi
  suiviId: string
  compteId: string | null
  compteNom: string | null
  contratId: string
}) {
  const { contrat, compteurs, contact, renouvellement } = data
  const totalMwh = compteurs.reduce((s, c) => s + (c.consommation_annuelle_mwh ?? 0), 0)

  return (
    <div className="flex flex-col gap-3">

      {/* ════════════════════════════════════════════════════════════════════════════════════════
          LE CONTRAT — et tout ce qui lui appartient
          ════════════════════════════════════════════════════════════════════════════════════════

          William, 25/09/2026 : « dans la card contrat, j'aimerais que tu incorpores les fichiers vu
          qu'ils sont propres à cet objet ». Ils avaient leur carte ; ils rentrent chez eux.

          LE COMPTE N'A PLUS DE CARTE NON PLUS — « le compte est déjà dans la card contrat, ajoute
          juste un lien de redirection quand je clique sur le nom ». Une carte entière pour un nom
          qui s'affichait déjà deux centimètres plus haut était une ligne de trop.

          LA RECOMMANDATION EST PARTIE pour la même raison : elle ne portait rien que Fabien
          consulte en suivant un contrat. */}
      <section className="overflow-hidden rounded-km-md border border-km-line bg-km-surface">

        {/* ── La bande d'état, sur l'anthracite des volets ── */}
        <div className="bg-km-side">
          <div className="flex flex-wrap items-center gap-2.5 px-4 pb-2.5 pt-3">
            <Link to={`/contrats/${contratId}`} className="font-mono text-[15px] font-semibold text-km-side-text hover:underline">
              {contrat?.reference || 'contrat sans référence'}
            </Link>
            {contrat?.energie_libelle && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-km-label font-bold text-km-side-amber">
                <Zap className="h-3 w-3" strokeWidth={2.4} /> {contrat.energie_libelle}
              </span>
            )}
            {/* LA NATURE PEUT ÊTRE INDÉTERMINÉE, et il faut le dire : 43 suivis sur 1 583 ont un
                contrat sans aucun compteur. Les afficher « Captation » serait une affirmation
                qu'on ne peut pas soutenir. */}
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-km-label font-bold',
                renouvellement === null ? 'bg-white/10 text-km-side-faint'
                  : renouvellement ? 'bg-km-side-green/20 text-km-side-green'
                    : 'bg-km-side-blue/20 text-km-side-blue',
              )}
              title={
                renouvellement === null
                  ? 'Aucun compteur rattaché à ce contrat : la nature ne peut pas être établie.'
                  : renouvellement
                    ? 'Au moins un compteur de ce contrat était déjà sous contrat chez nous.'
                    : 'Aucun compteur de ce contrat n’était sous contrat chez nous auparavant.'
              }
            >
              {renouvellement === null ? 'Nature indéterminée' : renouvellement ? 'Renouvellement' : 'Captation'}
            </span>

            {/* LE NOM DU COMPTE MÈNE À SA FICHE. C'est tout ce que sa carte apportait. */}
            {compteNom && (
              compteId ? (
                <Link
                  to={`/comptes/${compteId}`}
                  title={`Ouvrir la fiche de ${compteNom}`}
                  className="ml-auto inline-flex min-w-0 items-center gap-1.5 truncate text-km-body font-semibold text-km-side-muted transition-colors hover:text-km-side-text hover:underline"
                >
                  <Building2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                  <span className="truncate">{compteNom}</span>
                </Link>
              ) : (
                <span className="ml-auto truncate text-km-body text-km-side-muted">{compteNom}</span>
              )
            )}
          </div>

          <div className="grid grid-cols-2 gap-px border-t border-white/10 bg-white/10 sm:grid-cols-3 lg:grid-cols-5">
            <Chiffre libelle="Signature" valeur={dateCourte(contrat?.date_signature)} />
            <Chiffre libelle="Début" valeur={dateCourte(contrat?.date_debut)} />
            {/* ══ LA DURÉE SE DÉDUIT QUAND PERSONNE NE L'A SAISIE ══
              1 561 contrats suivis sur 1 583 n'ont pas de `duree_mois` — mais TOUS ont une date de
              début et une date de fin. Afficher « — » devant deux dates qui donnent la réponse était
              un aveu d'impuissance pour rien. Le calcul est marqué d'un ≈ : c'est une déduction, pas
              une saisie, et la nuance compte le jour où quelqu'un renseignera vraiment le champ. */}
          <Chiffre
            libelle="Durée"
            valeur={dureeLisible(contrat?.duree_mois, contrat?.date_debut, contrat?.date_fin)}
          />
            <Chiffre libelle="Fin" valeur={dateCourte(contrat?.date_fin)} accent />
            <Chiffre libelle="Fournisseur" valeur={contrat?.fournisseur_nom || '—'} />
          </div>
        </div>

        {/* ── Les pièces, chez elles, et repliées ──
            William, 25/09/2026 : « les fichiers doivent être visibles quand je déplie la ligne
            pièces du contrat ». Repliée, la ligne ne coûte que sa hauteur et annonce son nombre ;
            dépliée, elle rend la liste, qui défile — un contrat en porte jusqu'à vingt. */}
        <PiecesDepliables pieces={contrat?.pieces ?? []} />
      </section>

      {/* ════════════════════════════════════════════════════════════════════════════════════════
          LE CONTACT ET LES COMPTEURS, CÔTE À CÔTE
          ════════════════════════════════════════════════════════════════════════════════════════

          William : « mets la card contact et compteur sur la même ligne ». Le contact a un contenu
          fixe — un nom, trois coordonnées, deux boutons —, donc c'est lui qui donne sa hauteur à la
          rangée ; les compteurs l'épousent et défilent dedans. */}
      <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-2">
        <CarteContact contact={contact} compteId={compteId} compteNom={compteNom} suiviId={suiviId} />

        <Carte
          titre="Compteurs du contrat"
          icone={Zap}
          compteur={compteurs.length}
          className="h-full"
          aDroite={
            totalMwh > 0 ? (
              <span className="text-km-body text-km-muted">
                <strong className="font-semibold tabular-nums text-km-text">{totalMwh.toLocaleString('fr-FR')} MWh</strong>/an
              </span>
            ) : undefined
          }
        >
          {compteurs.length > 0 ? (
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {compteurs.map((c) => <LigneCompteur key={c.compteur_id} compteur={c} />)}
            </ul>
          ) : (
            <p className="px-3.5 py-4 text-km-body text-km-faint">
              Aucun compteur rattaché à ce contrat — c’est aussi pourquoi sa nature reste indéterminée.
            </p>
          )}
        </Carte>
      </div>
    </div>
  )
}

function Chiffre({ libelle, valeur, accent }: { libelle: string; valeur: string; accent?: boolean }) {
  return (
    <div className="bg-km-side px-4 py-2.5">
      <div className="font-mono text-km-micro uppercase tracking-[0.1em] text-km-side-faint">{libelle}</div>
      <div className={cn('mt-1 truncate text-km-name font-bold tabular-nums', accent ? 'text-km-side-amber' : 'text-km-side-text')}>
        {valeur}
      </div>
    </div>
  )
}

/**
 * ══ UN COMPTEUR SE DÉPLIE ══
 *
 * William, 25/09/2026 : « rends les compteurs dépliables pour accéder aux pièces jointes ou à
 * d'autres infos si tu n'as pas la place de tout afficher horizontalement ».
 *
 * Sur une demi-largeur, il n'y a effectivement plus la place : replié, le compteur montre ce qui
 * l'identifie et la seule date qu'on vient vérifier — le libellé, le PDL, l'énergie, l'échéance.
 * Déplié, il rend le reste : le fournisseur, la consommation, et ses fichiers.
 *
 * TOUJOURS REPLIÉ AU DÉPART. J'ouvrais d'office le compteur quand il était seul, en me disant que
 * déplier une liste d'un élément était un geste pour rien. William, 25/09/2026 : « un compteur est
 * par défaut replié ». Il a raison, et pour une raison que j'avais manquée : ce qui compte n'est pas
 * le nombre d'éléments, c'est que la carte garde TOUJOURS la même hauteur au chargement. Un panneau
 * ouvert d'office sur un dossier et fermé sur un autre fait sauter la mise en page d'une fiche à
 * l'autre, et l'on ne sait plus où regarder.
 */
function LigneCompteur({ compteur }: { compteur: CompteurDuContrat }) {
  const [ouvert, setOuvert] = useState(false)

  return (
    <li className="border-b border-km-line last:border-b-0">
      <button
        type="button"
        aria-expanded={ouvert}
        onClick={() => setOuvert((v) => !v)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-km-soft"
      >
        <ChevronRight
          className={cn('h-3.5 w-3.5 shrink-0 text-km-faint transition-transform', ouvert && 'rotate-90')}
          strokeWidth={2.4}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-km-name font-bold text-km-text">
            {compteur.libelle || compteur.libelle_site || 'compteur sans libellé'}
          </span>
          {/* TOUT CE QUI SE RÉSUME TIENT ICI, sur une seule ligne secondaire : le dépli est réservé
              aux fichiers, qui eux ne se résument pas. Le nombre de fichiers est annoncé au bout —
              sans lui, rien ne dirait s'il vaut la peine d'ouvrir. */}
          <span className="mt-0.5 flex items-baseline gap-2">
            <span className="shrink-0 truncate font-mono text-km-label text-km-muted">{compteur.numero_point}</span>
            {compteur.energie_libelle && (
              <span className="shrink-0 rounded-full bg-km-amber-soft px-1.5 py-px text-km-micro font-bold text-km-amber">
                {compteur.energie_libelle}
              </span>
            )}
            <span className="truncate text-km-label text-km-muted">
              {[
                compteur.fournisseur_nom,
                compteur.consommation_annuelle_mwh != null
                  ? `${compteur.consommation_annuelle_mwh.toLocaleString('fr-FR')} MWh/an`
                  : null,
              ].filter(Boolean).join(' · ')}
            </span>
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-km-micro font-bold uppercase tracking-[0.06em] text-km-faint">Échéance</span>
          <span className="block text-km-body font-semibold tabular-nums text-km-text">{dateCourte(compteur.date_echeance)}</span>
        </span>
        <span className={cn(
          'shrink-0 rounded-km-sm px-1.5 py-px text-km-micro font-bold',
          compteur.pieces.length > 0 ? 'bg-km-soft text-km-muted' : 'text-km-faint',
        )}>
          {compteur.pieces.length > 0 ? `${compteur.pieces.length} fich.` : '—'}
        </span>
      </button>

      {/* ══ LE DÉPLI NE MONTRE QUE LES FICHIERS ══
          William, 25/09/2026 : « les compteurs dépliés doivent simplement afficher les fichiers,
          rien de plus (gagner de la place encore) ». Le fournisseur et la consommation sont remontés
          sur la ligne repliée, où ils se lisent sans rien ouvrir ; le dépli ne sert plus qu'à ce
          qu'on ne peut pas résumer en un mot. */}
      {ouvert && (
        <div className="border-t border-km-line-soft bg-km-bg/50 px-3.5 py-2">
          {compteur.pieces.length === 0 ? (
            <p className="text-km-body text-km-faint">Aucun fichier sur ce compteur.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {compteur.pieces.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-km-body font-semibold text-km-text" title={p.nom_fichier || p.nom}>
                    {p.nom_fichier || p.nom}
                  </span>
                  <span className="shrink-0 text-km-label text-km-faint">{poids(p.taille_octets)}</span>
                  <GestesPiece piece={p} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}
