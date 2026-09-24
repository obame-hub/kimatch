import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Building2, ChevronRight, Mail, Phone, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RattachementModifiable } from '@/components/ui/rattachement-modifiable'
import { appelerNumero, numeroLisible } from '@/lib/telephonie'
import { useOuvrirEmail } from '@/lib/voletEmail'
import { HeroContrat, type ContratDuHero } from '@/components/recommandation/HeroContrat'
import type { Contact, Recommandation } from '@/types/domain'

/**
 * ══════════════════ LE HERO D'UNE RECOMMANDATION ══════════════════
 *
 * Trois cellules sur une ligne, dans l'ordre que William a fixé le 18/09/2026 : « à partir de la
 * gauche : le montant en premier, la proposition en 2ème, le compte + contact en troisième ».
 *
 * ELLES SE LISENT COMME UNE PHRASE — ce que ça rapporte, ce qu'on envoie, à qui. Le client ferme
 * la ligne parce que c'est le seul des trois qui mène ailleurs : ses deux liens sortent de la fiche.
 *
 * LES LARGEURS NE SONT PAS ÉGALES parce que les contenus ne le sont pas : le montant est un nombre
 * qui ne change jamais de forme, la proposition porte un document et son geste, le client deux
 * lignes et deux boutons.
 *
 * ══ AUCUN PRIX ICI, ET C'EST UNE DÉCISION ══
 *
 * William, 18/09/2026 : « il est impossible de connaître le montant d'une offre comme il est
 * impossible du coup de savoir quelle est la meilleure offre. Le but ici est surtout de savoir ce
 * qui est disponible, ce qui est en attente, ce qui ne l'est pas encore. »
 *
 * Il a raison sur les chiffres : 10 offres sur 291 portent un prix, et la base entière compte
 * 11 lignes de prix. Le seul montant qui existe est celui de l'AFFAIRE, saisi par le commercial à
 * la création depuis le 18/09 — d'où la mention « estimé par le commercial » sous le chiffre. Ce
 * n'est pas une coquetterie : elle empêche de lire comme un calcul ce qui est une estimation.
 *
 * ══ LA PROPOSITION À LA MÊME HAUTEUR QUE LE MONTANT ══
 *
 * Idée de William, validée par la mesure : sur les 42 versions « Disponible », 8 SEULEMENT ont
 * leur proposition attachée. Trente-quatre dossiers sont réputés prêts sans que le document à
 * envoyer existe. Une fiche qui range ce document au fond d'un onglet « Fichiers » laisse cet
 * écart invisible ; une cellule ambre en tête de fiche le rend impossible à ignorer.
 */

/**
 * Le montant tel qu'il a été saisi, aux centimes près.
 *
 * ON N'ARRONDIT JAMAIS UN PRIX (règle de William). `toLocaleString` sans option coupe à trois
 * décimales et arrondit en silence : un montant de 23 500,50 € s'afficherait « 23 500,5 » — pas
 * faux, mais pas ce qui est en base, et la moitié des lecteurs y verrait une troncature. Les deux
 * bornes disent la même chose dans les deux sens : ne rien ajouter, ne rien retirer.
 */
function formaterMontant(valeur: number): string {
  return valeur.toLocaleString('fr-FR', {
    minimumFractionDigits: Number.isInteger(valeur) ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

export function HeroRecommandation({
  reco,
  compte,
  contacts,
  contactSignataire,
  responsablesCompteurs,
  contrats,
  peutModifier,
  signaler,
  onMajContactSignataire,
  onMajMontant,
}: {
  reco: Recommandation
  compte: { id: string; nom: string; ville?: string | null; type_compte?: string | null } | null | undefined
  contacts: Contact[]
  contactSignataire: Contact | null | undefined
  /**
   * Les contacts désignés responsables SUR LES COMPTEURS du périmètre, avec le nombre de points de
   * livraison que chacun couvre. Sert à détecter l'écart avec le signataire — voir l'alerte.
   */
  responsablesCompteurs: { id: string; nom: string; compteurs: number }[]
  /** Les contrats nés de ce dossier. Vide, la cellule « Contrat » ne s'affiche pas du tout. */
  contrats: ContratDuHero[]
  peutModifier: boolean
  signaler: (message: string) => void
  onMajContactSignataire: (contactId: string) => void
  /** Écrit le montant de l'affaire, et le marque comme saisi à la main. */
  onMajMontant: (montant: number | null) => Promise<void>
}) {
  const ouvrirEmail = useOuvrirEmail()

  /**
   * ══════════ LE MONTANT SE SAISIT ET SE CORRIGE ICI ══════════
   *
   * William, 18/09/2026 : « dans le hero, laisse la possibilité de saisir ou de modifier le montant
   * estimé de la recommandation ».
   *
   * IL MANQUE SUR 208 DOSSIERS ACTIFS — tous nés avant que la saisie soit rendue obligatoire à la
   * création, le 18/09/2026. Sans ce geste, ces 208 dossiers resteraient sans montant pour toujours :
   * le seul endroit où on pouvait l'écrire était un formulaire de création qu'ils ont déjà passé.
   *
   * ══ POURQUOI PAS `InlineField variant="number"` ══
   *
   * Il existe et il fait exactement ce travail, mais il rend sa valeur en 14 px. Le montant est le
   * premier chiffre de la fiche, écrit en 38 px : le passer par le composant partagé l'aurait
   * rétréci de deux tiers pour gagner vingt lignes. L'édition se fait donc ici, à la taille du
   * chiffre — l'input reprend la police, le poids et la couleur du nombre qu'il remplace, si bien
   * qu'on ne voit pas le champ apparaître, on voit le nombre devenir modifiable.
   *
   * LA SAISIE EST À LA FRANÇAISE : « 23 500,50 » vaut 23500.5. Sans cette normalisation, `Number()`
   * rend `NaN` et le champ se referme sur l'ancienne valeur sans un mot — l'utilisateur croit avoir
   * enregistré. La classe des espaces couvre aussi l'insécable des copier-coller depuis un tableur.
   */
  const [montantEnEdition, setMontantEnEdition] = useState(false)
  const [montantSaisi, setMontantSaisi] = useState('')
  const [montantEnCours, setMontantEnCours] = useState(false)
  const champMontant = useRef<HTMLInputElement>(null)

  /* Le hero du contrat n'existe que si une demande a été faite — voir `HeroContrat`. */
  const avecContrat = contrats.length > 0

  /**
   * ══════════ QUAND LE SIGNATAIRE N'EST PAS CELUI QUI GÈRE LES COMPTEURS ══════════
   *
   * William, 18/09/2026 : « si tu te rends compte que le contact principal de la recommandation est
   * différent du contact responsable renseigné sur le ou les compteurs, il serait très important de
   * mettre une alerte sur la card contact ».
   *
   * ══ POURQUOI C'EST GRAVE MALGRÉ SA RARETÉ ══
   *
   * Mesuré le 18/09/2026 : l'écart existe sur 178 dossiers, dont 6 encore ouverts. C'est peu — et
   * c'est précisément ce qui le rend dangereux. Une anomalie fréquente, on apprend à la voir ; une
   * anomalie qui touche un dossier sur trente passe inaperçue jusqu'au jour où la proposition part
   * chez quelqu'un qui n'a pas la main sur les compteurs concernés. Le contact signataire est celui
   * à qui « Envoyer au client » adresse le PDF : se tromper là, c'est envoyer l'offre à la mauvaise
   * personne, et l'apprendre par son silence.
   *
   * ══ L'ALERTE PORTE SON CORRECTIF ══
   *
   * Signaler sans offrir de réparer laisserait chercher où changer le contact. Le bouton « le
   * désigner » bascule le signataire sur le responsable des compteurs, en un clic — c'est le même
   * geste que le sélecteur juste au-dessus, mais pré-rempli avec la bonne réponse.
   *
   * ══ DEUX CAS, DEUX PHRASES ══
   *
   * Un signataire DIFFÉRENT du responsable, et un signataire ABSENT alors qu'un responsable est
   * connu (106 dossiers). Le second n'est pas une contradiction mais une lacune évitable : la
   * réponse est déjà en base, il suffit de la reprendre.
   *
   * ON NE DIT RIEN quand aucun compteur ne porte de responsable — c'est le cas de neuf dossiers
   * actifs sur cent deux, et l'absence de donnée n'est pas un désaccord.
   */
  const responsablePrincipal = [...responsablesCompteurs]
    .sort((a, b) => b.compteurs - a.compteurs)[0] ?? null
  const ecartResponsable =
    responsablePrincipal && responsablePrincipal.id !== contactSignataire?.id
      ? responsablePrincipal
      : null

  useEffect(() => {
    if (montantEnEdition) champMontant.current?.select()
  }, [montantEnEdition])

  function ouvrirMontant() {
    if (!peutModifier) return
    setMontantSaisi(reco.montant != null ? String(reco.montant).replace('.', ',') : '')
    setMontantEnEdition(true)
  }

  async function enregistrerMontant() {
    if (montantEnCours) return
    const brut = montantSaisi.replace(/\s/g, '').replace(',', '.')
    const valeur = brut === '' ? null : Number(brut)
    if (valeur !== null && Number.isNaN(valeur)) {
      signaler('Montant illisible — attendu un nombre, par exemple 23 500,50')
      setMontantEnEdition(false)
      return
    }
    if (valeur === (reco.montant ?? null)) {
      setMontantEnEdition(false)
      return
    }
    setMontantEnCours(true)
    try {
      await onMajMontant(valeur)
      signaler(valeur == null ? '✓ Montant effacé' : `✓ Montant de l'affaire : ${formaterMontant(valeur)} €`)
      setMontantEnEdition(false)
    } catch (e) {
      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setMontantEnCours(false)
    }
  }

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-3',
        /* ══ LA GRILLE S'ADAPTE AU NOMBRE DE CELLULES ══
           William, 18/09/2026 : « il adapte alors la largeur des autres heros pour se faire sa
           place ». À deux, le montant et le client se partagent la ligne ; à trois, le contrat
           prend le milieu — la place que la proposition commerciale occupait avant de descendre
           dans le bloc version — et les deux autres se resserrent d'autant.

           LE MONTANT RESTE LE PLUS ÉTROIT dans les deux cas : c'est un nombre, il n'a pas besoin de
           largeur, et lui en donner l'aurait fait flotter au milieu d'un vide. */
        avecContrat
          ? 'lg:grid-cols-[minmax(0,.7fr)_minmax(0,1fr)_minmax(0,1fr)]'
          : 'lg:grid-cols-[minmax(0,.75fr)_minmax(0,1fr)]',
      )}
    >
      {/* ─────────── 1 · LE MONTANT ───────────

          ATTENTION AU HOMONYME, et c'est lui qui a mis William en doute le 24/09/2026 : la fiche
          affiche DEUX choses vertes appelées « Montant ». Celle-ci — l'encadré vert, « Montant de
          l'affaire » — est `recommandations.montant`, saisie à la main par le commercial. La
          capsule verte au bas de la calculatrice, elle, est `recommandations.marge_nette_coeff`,
          la marge nette pondérée. Deux colonnes, deux sens. Le survol le dit désormais. */}
      <div
        title="recommandations.montant — nom de la colonne en base"
        className="flex flex-col justify-center rounded-km-lg border border-km-green-line bg-km-green-tint px-[18px] py-[15px]"
      >
        <span className="text-km-tiny font-extrabold uppercase tracking-[0.09em] text-km-faint">
          Montant de l'affaire
        </span>
        {montantEnEdition ? (
          <div className="mt-1 flex items-baseline gap-1">
            <input
              ref={champMontant}
              autoFocus
              type="text"
              inputMode="decimal"
              value={montantSaisi}
              disabled={montantEnCours}
              placeholder="0"
              onChange={(e) => setMontantSaisi(e.target.value)}
              onBlur={enregistrerMontant}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); void enregistrerMontant() }
                if (e.key === 'Escape') { e.preventDefault(); setMontantEnEdition(false) }
              }}
              className="w-full min-w-0 border-0 border-b-2 border-km-green bg-transparent p-0 text-[38px] font-extrabold leading-none tracking-[-0.045em] text-km-green outline-none placeholder:text-km-green/30"
            />
            <span className="text-km-title font-bold text-km-green">€</span>
          </div>
        ) : reco.montant != null ? (
          <button
            type="button"
            onClick={ouvrirMontant}
            disabled={!peutModifier}
            title={peutModifier ? 'Modifier le montant de l’affaire' : undefined}
            className="-mx-1 mt-1 flex items-baseline rounded-km-sm px-1 text-left transition-colors enabled:hover:bg-km-green/5 disabled:cursor-default"
          >
            <span className="text-[38px] font-extrabold leading-none tracking-[-0.045em] text-km-green">
              {formaterMontant(reco.montant)}
            </span>
            <span className="ml-1 text-km-title font-bold text-km-green">€</span>
          </button>
        ) : peutModifier ? (
          /* IL MANQUE SUR 208 DOSSIERS ACTIFS, tous nés avant le 18/09/2026 — la saisie n'était pas
             demandée à la création. On invite à l'écrire plutôt que d'afficher « 0 € », qui serait
             faux, ou un « non renseigné » mort qui ne mènerait nulle part. */
          <button
            type="button"
            onClick={ouvrirMontant}
            className="-mx-1 mt-1.5 w-fit rounded-km-sm border border-dashed border-km-green-line px-2 py-1 text-km-body font-bold text-km-green hover:bg-km-green-soft"
          >
            Saisir le montant
          </button>
        ) : (
          <p className="mt-1.5 text-km-name font-bold text-km-faint">Non renseigné</p>
        )}
        {reco.volume_contractuel != null && (
          <div className="mt-2.5">
            <div className="text-km-tiny font-extrabold uppercase tracking-[0.09em] text-km-faint">Volume</div>
            <div className="mt-px font-mono text-km-title font-bold tracking-[-0.02em] text-km-text">
              {reco.volume_contractuel.toLocaleString('fr-FR')} MWh
            </div>
          </div>
        )}
        <p className="mt-2 text-km-label text-km-muted">
          {reco.montant != null
            ? 'Estimé par le commercial'
            : 'Aucun calcul ne peut le déduire — il se saisit'}
        </p>
      </div>

      {/* ─────────── 2 · LE CONTRAT, S'IL EXISTE ─────────── */}
      {avecContrat && <HeroContrat contrats={contrats} />}

      {/* ─────────── 3 · LE CLIENT : COMPTE ET CONTACT ─────────── */}
      <div className="flex min-h-[132px] flex-col justify-between gap-2.5 rounded-km-lg border border-km-line bg-white px-[15px] py-[13px]">
        {/* Le compte : une ligne. « Autant le compte peut être une ligne, autant le contact doit
            avoir des boutons d'actions » (William, 18/09/2026).

            ══ ET IL NE SE CHANGE PAS ICI — C'EST LA SEULE EXCEPTION À LA RÈGLE ══

            La règle du 18/09/2026 veut que tout rattachement affiché puisse être changé là où il
            s'affiche. Je lui ai posé la question pour ce cas précis ; sa réponse le même jour :
            « il ne doit pas l'être ».

            ELLE SE COMPREND : le compte d'une recommandation n'est pas un lien parmi d'autres, il
            est ce dont tout le reste découle. Les compteurs du périmètre lui appartiennent, les
            contacts consultables sont les siens, les contrats qui naîtront du dossier seront les
            siens. Le déplacer d'un clic laisserait derrière un périmètre de points de livraison
            étrangers au nouveau compte — un dossier incohérent, sans rien pour le signaler.

            Une recommandation ouverte sur le mauvais compte se re-crée sur le bon ; elle ne se
            déménage pas. Le lien reste donc un lien, et il mène à la fiche du compte. */}
        <Link
          to={`/comptes/${reco.compte_id}`}
          className="-m-[3px] flex items-center gap-2.5 rounded-km-sm p-[3px] hover:bg-km-soft"
        >
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-km-sm bg-km-blue-soft text-km-blue">
            <Building2 className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1 truncate text-km-name font-bold text-km-text">
            {compte?.nom || reco.compte_nom}
          </span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-km-faint" />
        </Link>

        <div className="h-px bg-km-line-soft" />

        {/* Le contact signataire : deux lignes, deux gestes, et il se change sur place. */}
        <div className="flex flex-col gap-2.5">
          <RattachementModifiable
            options={contacts.map((c) => ({
              id: c.id,
              libelle: `${c.prenom} ${c.nom}`.trim(),
              sousLibelle: c.fonction || null,
            }))}
            valeurId={contactSignataire?.id ?? null}
            onChoisir={onMajContactSignataire}
            placeholder="Rechercher un contact…"
            legende={`contacts de ${compte?.nom || reco.compte_nom}`}
            desactive={!peutModifier}
          >
            {contactSignataire ? (
              <Link
                to={`/contacts/${contactSignataire.id}`}
                className="-m-[3px] flex items-center gap-2.5 rounded-km-sm p-[3px] pr-[70px] hover:bg-km-soft"
              >
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-km-sm bg-km-violet/10 text-km-violet">
                  <User className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-km-name font-bold text-km-text">
                    {contactSignataire.prenom} {contactSignataire.nom}
                  </span>
                  <span className="block truncate text-km-label text-km-faint">
                    Signataire{contactSignataire.fonction ? ` · ${contactSignataire.fonction}` : ''}
                  </span>
                </span>
              </Link>
            ) : (
              <div className="flex items-center gap-2.5 pr-[70px]">
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-km-sm bg-km-soft text-km-faint">
                  <User className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-km-body text-km-faint">
                  Aucun contact signataire
                </span>
              </div>
            )}
          </RattachementModifiable>

          {ecartResponsable && (
            <div className="flex flex-wrap items-start gap-1.5 rounded-km-sm border border-km-amber/40 bg-km-amber-soft px-2 py-1.5">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0 text-km-amber" />
              <p className="min-w-0 flex-1 text-km-label text-km-amber">
                {contactSignataire ? (
                  <>
                    <b>{ecartResponsable.nom}</b> est responsable
                    {ecartResponsable.compteurs > 1 ? ` des ${ecartResponsable.compteurs} compteurs` : ' du compteur'}
                    {' '}du périmètre — pas le signataire ci-dessus.
                  </>
                ) : (
                  <>
                    Aucun signataire, alors que <b>{ecartResponsable.nom}</b> est responsable
                    {ecartResponsable.compteurs > 1 ? ` des ${ecartResponsable.compteurs} compteurs` : ' du compteur'}
                    {' '}du périmètre.
                  </>
                )}
              </p>
              {peutModifier && (
                <button
                  type="button"
                  onClick={() => onMajContactSignataire(ecartResponsable.id)}
                  className="shrink-0 rounded-km-sm border border-km-amber/50 bg-white px-2 py-[2px] text-km-label font-bold text-km-amber hover:brightness-[.97]"
                >
                  le désigner
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={!contactSignataire?.telephone}
              onClick={() => contactSignataire?.telephone && void appelerNumero(contactSignataire.telephone)}
              title={contactSignataire?.telephone ? numeroLisible(contactSignataire.telephone) : 'Aucun téléphone'}
              className="inline-flex h-[30px] items-center justify-center gap-1.5 rounded-km-sm border border-km-line bg-white text-km-body font-semibold text-km-muted hover:border-km-green-line hover:bg-km-green-soft hover:text-km-green disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-km-line disabled:hover:bg-white disabled:hover:text-km-muted"
            >
              <Phone className="h-3 w-3" />
              Appeler
            </button>
            <button
              type="button"
              disabled={!contactSignataire?.email || !ouvrirEmail}
              onClick={() => contactSignataire?.email && ouvrirEmail?.({
                a: contactSignataire.email,
                nom: `${contactSignataire.prenom} ${contactSignataire.nom}`.trim(),
                contactId: contactSignataire.id,
                compteId: reco.compte_id,
                recommandationId: reco.id,
              })}
              title={contactSignataire?.email || 'Aucune adresse e-mail'}
              className="inline-flex h-[30px] items-center justify-center gap-1.5 rounded-km-sm border border-km-line bg-white text-km-body font-semibold text-km-muted hover:border-km-blue hover:bg-km-blue-soft hover:text-km-blue disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-km-line disabled:hover:bg-white disabled:hover:text-km-muted"
            >
              <Mail className="h-3 w-3" />
              Écrire
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
