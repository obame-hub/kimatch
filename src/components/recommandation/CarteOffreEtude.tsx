import { useState } from 'react'
import { cn } from '@/lib/utils'
import { LIBELLE_CLASSE, ORDRE_CLASSES, somme } from '@/lib/calculs/prixOffre'
import { libelleOffre, natureDeLOffre } from '@/lib/data/recommandations'
import { initialesFournisseur, logoFournisseur } from '@/lib/logosFournisseurs'
import type { Compteur, OffreFournisseur } from '@/types/domain'

/**
 * Une offre présentée à la façon de l'étude client de William.
 *
 * DEMANDE DE MICHEL, appel du 20/08/2026 à 13h15 : « dans le détail des offres, le même modèle que
 * dans fiche étude clients […] tu vois comme ça, là on pourra venir saisir les informations ». Le
 * même composant sert donc aux deux endroits qu'il cite : le détail de la version, et le résumé
 * qu'on montre au client.
 *
 * CE QUE LE MODÈLE DE WILLIAM APPORTE, et qu'un tableau ne donne pas :
 *
 *   · UNE BARRE SEGMENTÉE qui montre d'un coup d'œil la part de l'abonnement, de l'énergie et des
 *     contributions dans le budget. Deux offres au même total peuvent se répartir très différemment,
 *     et c'est ce qui explique pourquoi l'une vieillit mieux que l'autre.
 *   · UN DÉPLI EN CASCADE : l'offre donne son total, on ouvre pour voir chaque point de livraison, on
 *     ouvre un point de livraison pour voir ses composantes. Trois niveaux, chacun ne montrant que ce
 *     qu'on lui demande — au lieu d'un tableau qui étale tout d'emblée.
 *   · L'ÉCART affiché à côté du total, pas dans une colonne à part : c'est la première chose qu'un
 *     lecteur cherche après le montant.
 *
 * CE QUI DIFFÈRE DE LA MAQUETTE, faute de données : la maquette détaille l'électricité par poste
 * horaire avec l'électron et le mécanisme de capacité, et découpe le TURPE en quatre tuiles. Kimatch
 * a le prix par classe et un TURPE global ; les blocs affichent donc ce qui existe, sans inventer de
 * ventilation.
 */
export function CarteOffreEtude({
  offre,
  compteurs,
  reference,
  avecFournisseur = false,
  avecIdentite = false,
  avecBarre = false,
  aChoisir,
  choisie,
  onChoisir,
  actions,
  chiffresEnPlus,
  deplieToujours,
}: {
  offre: OffreFournisseur
  /** Les compteurs de la fiche, pour nommer les points de livraison et connaître leurs volumes. */
  compteurs: Compteur[]
  /** L'offre de comparaison — la moins chère du lot, en attendant l'offre de référence de Michel. */
  reference: OffreFournisseur | null
  /** Le nom du fournisseur : inutile sous un groupe qui le porte déjà, indispensable sans lui. */
  avecFournisseur?: boolean
  /** L'identité de l'offre — durée et type de prix. À masquer quand un en-tête la porte au-dessus. */
  avecIdentite?: boolean
  /** La barre de répartition : présentation client, bruit pour le commercial. */
  avecBarre?: boolean
  /** Affiche la case de sélection, comme la maquette qui invite à comparer 2 ou 3 offres. */
  aChoisir?: boolean
  choisie?: boolean
  onChoisir?: () => void
  /** Ce qu'on greffe à droite : saisie, pièce jointe… selon l'écran qui l'affiche. */
  actions?: React.ReactNode
  /** Un chiffre de plus au centre, à côté du budget — l'économie, par exemple. */
  chiffresEnPlus?: React.ReactNode
  /** Détail ouvert d'office : le document imprimé, où l'on ne clique pas. */
  deplieToujours?: boolean
}) {
  const [ouvert, setOuvert] = useState(false)
  // DÉPLIÉE D'OFFICE, pour le document imprimé. Michel, 21/08/2026 : « quand on va télécharger le
  // rapport, ce sera exactement la même chose, c'est déplié ». Un PDF ne se clique pas : ce que
  // l'écran cache derrière un clic doit y être ouvert.
  const deplie = deplieToujours || ouvert
  const [pdlOuvert, setPdlOuvert] = useState<string | null>(null)
  const parId = new Map(compteurs.map((c) => [c.id, c]))

  const logo = logoFournisseur(offre.fournisseur_nom)
  const b = budgetsDeLOffre(offre)
  // La marge de l'offre : celle de ses points de livraison quand elle est la même partout, sinon on
  // ne l'affiche pas — une moyenne de marges ne veut rien dire pour un commercial qui négocie.
  const marges = [...new Set(offre.details_par_compteur.map((d) => (d.type_marge === 'FIXE' ? d.marge_fixe_eur : d.marge_reelle_eur_mwh)).filter((v) => v != null))]
  const marge = marges.length === 1 ? marges[0]! : null
  const typeMarge = offre.details_par_compteur[0]?.type_marge ?? 'VARIABLE'
  const total = offre.montant_annuel_ht ?? b.total
  const ecart = total != null && reference?.montant_annuel_ht != null && reference.id !== offre.id
    ? total - reference.montant_annuel_ht
    : null
  const ecartPct = ecart != null && reference?.montant_annuel_ht
    ? (ecart / reference.montant_annuel_ht) * 100
    : null

  // Les trois parts du budget. Sans total, aucune barre : une barre vide ferait croire à un zéro.
  // QUATRE SEGMENTS, ceux de la maquette de William et dans ses couleurs : abonnement en bleu,
  // énergie en vert, réseau en doré, taxes en gris. La distinction réseau / taxes compte pour le
  // client : le réseau baisse avec une optimisation de puissance, les taxes non.
  //
  // L'abonnement n'a sa part qu'au gaz : ailleurs il est dans l'énergie, et la barre dépasserait
  // 100 % de ce que le client paie.
  const abonnementAPart = offre.details_par_compteur.some((d) => !!d.prix_gaz)
  const parts = [
    { cle: 'abonnement', libelle: 'Abonnement', valeur: abonnementAPart ? b.abonnement : null, couleur: 'bg-kw-blue' },
    { cle: 'energie', libelle: 'Énergie', valeur: b.energie, couleur: 'bg-kw-green' },
    { cle: 'reseau', libelle: 'TURPE / réseau', valeur: b.reseau, couleur: 'bg-kw-gold' },
    { cle: 'taxes', libelle: 'Taxes', valeur: b.taxes, couleur: 'bg-kw-meta' },
  ].filter((p) => p.valeur != null && p.valeur > 0)
  const sommeParts = somme(...parts.map((p) => p.valeur))

  return (
    <div
      className={cn(
        // `break-inside-avoid` : une carte ne se coupe pas entre deux pages à l'impression. C'est la
        // bonne granularité — on interdit de casser UNE carte, sans interdire de casser la liste,
        // sinon la liste entière saute à la page suivante et laisse une page blanche derrière elle.
        'overflow-hidden break-inside-avoid',
        // Un cadre seulement quand la carte est autonome. Dans le détail de version elle vit à
        // l'intérieur du bloc de l'offre : deux bordures imbriquées pour une seule chose se lisent
        // comme deux choses.
        avecIdentite
          ? cn('rounded-kw-lg border bg-white', offre.est_offre_recommandee ? 'border-[1.5px] border-kw-green' : 'border-kw-border')
          : 'rounded-kw-md',
      )}
    >
      {/* ── La ligne de l'offre ──
          TOUTE LA LIGNE OUVRE LE DÉTAIL. Naoëlle, 20/08/2026 : « privilégie les clics dans les
          blocs, pour ne pas appuyer sur des liens et avoir du bruit écrit. » Un bouton « Détail » en
          plus de la ligne, c'est un mot de plus à lire pour un geste qu'on devine. Les commandes
          qu'on ne veut pas déclencher par mégarde — retenir, saisir, joindre — arrêtent la
          propagation, chacune de son côté. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOuvert((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOuvert((v) => !v) } }}
        title={deplie ? 'Replier le détail' : 'Ouvrir le détail de cette offre'}
        className={cn(
          'cursor-pointer items-center gap-x-3 gap-y-2 px-3.5 py-3 hover:bg-kw-subtle',
          // UNE GRILLE À COLONNES DÉCLARÉES dans le comparatif client, et non une rangée flexible.
          //
          // En flex, la largeur de chaque zone suit son contenu : une offre portant le badge
          // « ★ Recommandation Kiwee » poussait sa barre et ses montants plus loin que les autres, et
          // rien ne s'alignait d'une ligne à l'autre (signalé le 20/08/2026 — « c'est pas joli, le
          // décalage »). Des colonnes déclarées règlent la question pour toutes les cartes à la fois.
          //
          // CINQ COLONNES POUR CINQ CELLULES. La première version en déclarait six — logo, identité,
          // barre, puis 112 px, 136 px et `auto`. Or la ligne ne porte que cinq enfants : les deux
          // chiffres voyagent ensemble dans une seule cellule. Celle-ci héritait donc des 112 px
          // prévus pour le seul budget, et à la largeur d'une page A4 « 14 319 » s'imprimait
          // par-dessus la barre tandis que l'écart s'enroulait sur trois lignes (mesuré à 703 px le
          // 20/08/2026). Compter les cellules avant de compter les colonnes.
          //
          // LES DEUX COLONNES SOUPLES ONT UN MINIMUM DE ZÉRO : c'est ce qui rend le débordement
          // impossible à toute largeur. C'est le texte descriptif qui se resserre, jamais un chiffre.
          // Les colonnes chiffrées gardent une largeur fixe — sans elle les montants ne s'alignent pas
          // d'une carte à l'autre, chaque carte étant sa propre grille.
          //
          // EN INTERNE, TROIS COLONNES À CÔTÉS ÉGAUX. Les deux ressorts `flex-1` ne centraient pas :
          // `flex: 1 1 0%` distribue l'espace libre à parts égales, mais aucun des deux ne peut
          // descendre sous la largeur de son contenu. Le ressort de droite portant les boutons, il
          // débordait de sa part et poussait les chiffres vers la gauche — d'une ligne à l'autre les
          // montants ne tombaient donc pas au même endroit, selon que le bouton disait « Saisir les
          // prix » ou « Modifier les prix » (visible sur la capture du 20/08/2026).
          //
          // Deux colonnes `minmax(0,1fr)` sont égales par construction, quoi qu'elles contiennent. La
          // colonne du milieu prend la largeur de ses chiffres. C'est le montage déjà retenu pour
          // centrer le logo de la barre du haut.
          avecIdentite
            ? 'grid grid-cols-[32px_minmax(0,1.15fr)_minmax(0,1.5fr)_204px_28px]'
            // La grille ne prend qu'à partir de `sm` : en dessous, la somme des largeurs minimales
            // — les chiffres plus les boutons — dépasse celle d'un téléphone. La rangée souple s'y
            // replie sur deux lignes, comme avant, et les ressorts reprennent leur office.
            : 'flex flex-wrap sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]',
        )}
      >
        {/* TROIS ZONES : l'identité à gauche, les chiffres au CENTRE, les actions à DROITE.
            Demande de Naoëlle du 20/08/2026. Les deux zones latérales portent `flex-1` : c'est ce qui
            centre réellement le groupe du milieu, alors qu'un simple `mx-auto` l'aurait décalé dès que
            les deux côtés n'ont pas la même largeur — ce qui est le cas ici, l'identité étant plus
            longue que les boutons. */}
        {/* LE LOGO EN TÊTE DE LIGNE, comme dans la maquette : c'est lui qu'on repère avant d'avoir
            lu le nom. Il était placé entre la barre et les montants, ce qui le noyait au milieu.
            Quand on ne l'a pas, une pastille d'initiales — afficher le logo d'un autre fournisseur
            serait bien pire que de ne rien afficher. */}
        {avecIdentite && (
          logo ? (
            <img src={logo} alt="" className="h-8 w-8 shrink-0 justify-self-center rounded-kw-sm object-contain" />
          ) : (
            <span
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center justify-self-center rounded-kw-sm text-kw-tiny font-extrabold',
                offre.est_offre_recommandee ? 'bg-kw-green text-white' : 'bg-kw-muted text-kw-meta',
              )}
            >
              {initialesFournisseur(offre.fournisseur_nom)}
            </span>
          )
        )}

        {/* RIEN N'EST RÉPÉTÉ ICI. Michel puis Naoëlle, 20/08/2026 : « je vois Gaz Européen, après
            je revois encore Gaz Européen moins chère, je ne comprends plus » — puis « c'est écrit
            deux fois 12 mois fixe, c'est trop d'information ».

            Dans le détail de version, l'en-tête de l'offre porte DÉJÀ sa durée, son type de prix, son
            statut et le bouton « Retenir » : la carte n'ajoute que les chiffres et la saisie. Elle ne
            reprend l'identité que dans le résumé client, où aucun en-tête ne la porte. */}
        <span className={cn('min-w-0', !avecIdentite ? 'hidden' : '')}>
          <span className="flex flex-wrap items-baseline gap-1.5">
            {avecFournisseur && (
              <span className="text-kw-md font-extrabold">{offre.fournisseur_nom || 'Fournisseur'}</span>
            )}
            <span className={cn('font-mono', avecFournisseur ? 'text-kw-sm text-kw-meta' : 'text-kw-md font-extrabold')}>
              {libelleOffre(offre.duree_mois, offre.type_prix)}
            </span>
            {/* LE CONTRAT ACTUEL ET LA RECONDUCTION SE DISENT, dans le document remis au client :
                sans cela, une ligne du comparatif qui n'est pas une de nos offres se lirait comme
                une de nos offres. Michel, 21/08/2026, à propos de la proposition du fournisseur en
                place : « c'est pas non plus l'offre que moi je propose. » */}
            {!natureDeLOffre(offre.nature_offre).retenable && (
              <span className="rounded-kw-xs bg-kw-muted px-1.5 py-px text-kw-micro font-bold uppercase tracking-[0.06em] text-kw-meta">
                {natureDeLOffre(offre.nature_offre).libelle}
              </span>
            )}
            {offre.est_offre_recommandee && (
              <span
                className={cn(
                  'rounded-kw-xs px-1.5 py-px text-kw-micro font-bold uppercase tracking-[0.06em]',
                  // Dans le comparatif client, c'est une recommandation qu'on assume — la maquette de
                  // William la marque en vert plein. En interne, « Retenue » suffit.
                  avecIdentite ? 'bg-kw-green text-white' : 'bg-kw-green-light text-kw-green',
                )}
              >
                {avecIdentite ? '★ Recommandation Kiwee' : 'Retenue'}
              </span>
            )}
          </span>
          {offre.date_validite && (
            <span className="mt-0.5 block font-mono text-kw-micro text-kw-faint">
              valable jusqu'au {new Date(offre.date_validite).toLocaleDateString('fr-FR')}
            </span>
          )}
        </span>

        {/* LA BARRE NE S'AFFICHE QUE POUR LE CLIENT. Michel, 20/08/2026, en parlant de la
            répartition : « ces informations là, on n'a pas besoin de décorer comme ici, parce que ça
            c'est plus de la présentation. Lui, qu'est-ce qu'il veut voir ? Il veut voir Gaz Européen,
            et puis la marge et le budget. » Elle reste donc dans le résumé client, où elle explique
            pourquoi deux offres au même total ne se valent pas. */}
        <span className={cn('min-w-0', !avecBarre && 'hidden')}>
          {sommeParts != null && sommeParts > 0 ? (
            <>
              <span className="flex h-3.5 overflow-hidden rounded-kw-sm bg-kw-muted">
                {parts.map((p) => (
                  <span
                    key={p.cle}
                    title={`${p.libelle} · ${Math.round(p.valeur!).toLocaleString('fr-FR')} € (${Math.round((p.valeur! / sommeParts) * 100)} %)`}
                    className={cn(p.couleur, 'cursor-help')}
                    style={{ width: `${(p.valeur! / sommeParts) * 100}%` }}
                  />
                ))}
              </span>
              {/* DEUX REPÈRES SEULEMENT, aux extrémités, comme la maquette : la part d'énergie à
                  gauche, celle du réseau et des taxes à droite. Quatre pourcentages alignés se lisent
                  comme un tableau ; deux se lisent d'un coup d'œil. Le détail reste au survol de
                  chaque segment. */}
              <span className="mt-1 flex justify-between font-mono text-kw-micro text-kw-faint">
                <span>
                  énergie {Math.round(((b.energie ?? 0) / sommeParts) * 100)} %
                </span>
                <span>
                  taxes+réseau {Math.round((((b.reseau ?? 0) + (b.taxes ?? 0)) / sommeParts) * 100)} %
                </span>
              </span>
            </>
          ) : (
            <span className="text-kw-tiny text-kw-ghost">composition inconnue — aucun prix saisi</span>
          )}
        </span>

        {/* LA COLONNE DE GAUCHE de la vue interne. Elle est vide la plupart du temps — son rôle est
            de faire contrepoids à celle des boutons — et accueille la case de sélection quand la vue
            propose de comparer des offres. La case doit vivre ICI et non en tête de ligne : en
            grille, un enfant de plus décalerait toutes les colonnes d'un cran. */}
        {!avecIdentite && (
          <span className="flex min-w-0 flex-1 items-center sm:flex-none">
            {aChoisir && (
              <button
                type="button"
                onClick={onChoisir}
                title="Sélectionner pour comparer"
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-kw-xs border text-kw-micro font-bold',
                  choisie ? 'border-kw-green bg-kw-green text-white' : 'border-kw-border-strong bg-white',
                )}
              >
                {choisie ? '✓' : ''}
              </button>
            )}
          </span>
        )}

        {/* ── Les chiffres, au centre ──
            Michel : « il veut savoir : est-ce que j'ai reçu l'offre de Gaz Européen ? Voici la marge.
            Voici le budget. Fin du game. » */}
        <span
          className={cn(
            'items-center whitespace-nowrap text-center',
            // Côté client, le budget et l'écart occupent chacun une colonne de largeur fixe : c'est à
            // cette condition qu'ils s'alignent d'une carte à l'autre, puisque chaque carte est une
            // grille indépendante. `whitespace-nowrap` interdit à un montant de s'enrouler.
            // `gap-7` en interne : Naoëlle, 20/08/2026, « un peu aéré entre eux afin que
            // visuellement ça fasse joli ». Quatre chiffres serrés se lisent comme un seul nombre.
            // 76 ET 152 PIXELS, MESURÉS ET NON DEVINÉS. La pastille d'écart « ▲ +7 749 € · 108,4 % »
            // demande 138 px ; la piste en faisait 132. Avec `justify-items: end`, un contenu trop
            // large ne déborde pas à droite mais à GAUCHE — il mord sur la colonne du budget, dont le
            // libellé se coupait en « budget HT / a. » (constaté le 21/08/2026 sur les pages de détail
            // du document). 152 px laissent la place à un écart à cinq chiffres et trois chiffres de
            // pourcentage, 76 px au libellé du budget en entier.
            avecIdentite ? 'grid grid-cols-[76px_152px] justify-items-end' : 'flex shrink-0 gap-7',
          )}
        >
          {!avecBarre && (
            <span>
              <span className="block font-mono text-kw-base font-bold tabular-nums">
                {marge == null ? <span className="text-kw-ghost">—</span> : `${marge.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`}
              </span>
              <span className="block text-kw-micro text-kw-faint">
                marge {typeMarge === 'FIXE' ? 'fixe' : '€/MWh'}
              </span>
            </span>
          )}

          <span>
            <span className="block font-mono text-kw-lg font-extrabold tabular-nums">
              {total == null ? '—' : Math.round(total).toLocaleString('fr-FR')}
            </span>
            <span className="block text-kw-micro text-kw-faint">budget HT / an</span>
          </span>

          <span>
            {ecart == null ? (
              <span className="block text-kw-sm text-kw-faint">référence</span>
            ) : (
              <span
                className={cn(
                  'inline-flex items-baseline gap-1.5 rounded-kw-sm px-2 py-0.5 font-mono text-kw-sm font-extrabold tabular-nums',
                  ecart > 0 ? 'bg-kw-red-light text-kw-red' : 'bg-kw-green-light text-kw-green',
                )}
              >
                {/* Flèche, montant et pourcentage, comme la maquette : « ▼ −1 760 € · 12,4 % ». Le
                    pourcentage seul cache l'ordre de grandeur, le montant seul cache l'ampleur. */}
                <span>{ecart > 0 ? '▲' : '▼'}</span>
                <span>
                  {ecart > 0 ? '+' : '−'}
                  {Math.abs(Math.round(ecart)).toLocaleString('fr-FR')} €
                </span>
                {ecartPct != null && (
                  <span className="font-normal">
                    · {Math.abs(ecartPct).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %
                  </span>
                )}
              </span>
            )}
          </span>

          {chiffresEnPlus}
        </span>

        {/* ── Les actions, à droite ──
            `flex-1` fait ici office de second ressort : avec celui de la zone d'identité, il garde
            les chiffres au milieu quelle que soit la largeur des boutons. */}
        <span
          className={cn(
            'flex min-w-0 items-center justify-end gap-2',
            // Le ressort ne sert qu'à la rangée souple, sous `sm` : en grille il est ignoré.
            !avecIdentite && 'flex-1 sm:flex-none',
          )}
        >
          {actions}
          <span className="w-3 shrink-0 text-center text-kw-sm text-kw-faint">{deplie ? '▾' : '▸'}</span>
        </span>
      </div>

      {/* ── Niveau 2 : un point de livraison par ligne ──────────────────────── */}
      {deplie && (
        <div className="border-t border-kw-border-faint bg-kw-subtle px-3.5 py-3">
          <p className="mb-2 text-kw-micro font-bold uppercase tracking-[0.07em] text-kw-faint">
            Budget par compteur · dépliez pour le détail
          </p>
          {offre.details_par_compteur.length === 0 ? (
            <p className="text-kw-tiny text-kw-faint">Aucun prix saisi sur cette offre.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {offre.details_par_compteur.map((d) => {
                const compteur = parId.get(d.compteur_id)
                const gaz = !!d.prix_gaz
                const volume = d.consommation_annuelle_reference_mwh
                  ?? (gaz ? compteur?.car_mwh : compteur?.consommation_annuelle_mwh)
                  ?? null
                // DÉPLIÉ JUSQU'AU BOUT quand le document l'exige. Naoëlle, 21/08/2026 : « il faut
                // que ça s'affiche exactement comme quand on déplie l'offre entièrement ». Forcer
                // seulement la liste des compteurs ne suffisait pas : les composantes — abonnement,
                // énergie ligne par ligne, contributions — vivent un niveau plus bas, et c'est là
                // qu'est l'information qu'un PDF doit porter.
                const estOuvert = deplieToujours || pdlOuvert === d.id
                return (
                  <div key={d.id} className="overflow-hidden break-inside-avoid rounded-kw-md border border-kw-border bg-white">
                    <button
                      type="button"
                      onClick={() => setPdlOuvert(estOuvert ? null : d.id)}
                      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-left hover:bg-kw-subtle sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
                    >
                      {/* LE CHEVRON VOYAGE AVEC LE NUMÉRO DE PDL, dans le même ressort. Séparé, ses
                          12 px s'ajoutaient à gauche seulement et décalaient d'autant le groupe de
                          chiffres : mesuré à 975 px là où ceux de l'offre tombaient à 963. Deux
                          ressorts de part et d'autre, et rien d'autre, centrent exactement. */}
                      {/* `overflow-hidden` ET `truncate` : SANS EUX LA COLONNE DÉBORDE SUR LES CHIFFRES.
                          Signalé le 21/08/2026 sur les pages de détail du document — « regarde les
                          chiffres, tout se chevauche » — et la cause n'est pas la grille mais son
                          contenu. La colonne de gauche vaut `minmax(0,1fr)` : elle PEUT descendre à
                          zéro, et c'est ce qui garantit que les chiffres ne soient jamais pousses
                          dehors. Mais un texte qui ne sait pas se couper sort quand même de sa
                          colonne et se superpose au voisin. Il faut donc dire à la fois « la colonne
                          peut rétrécir » et « le texte se coupe quand elle rétrécit ». */}
                      <span className="flex min-w-0 flex-1 items-center gap-x-3 overflow-hidden sm:flex-none">
                        <span className="w-3 shrink-0 text-kw-tiny text-kw-faint">{estOuvert ? '▾' : '▸'}</span>
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-mono text-kw-sm font-bold">
                            {compteur?.numero_pdl || d.compteur_label || 'Compteur'}
                          </span>
                          <span className="shrink-0 rounded-kw-xs bg-kw-muted px-1.5 py-px text-kw-micro font-bold text-kw-meta">
                            {gaz ? 'Gaz' : 'Élec'}
                          </span>
                        </span>
                      </span>
                      {/* LES CHIFFRES DU COMPTEUR SE CENTRENT, comme ceux de l'offre juste au-dessus.
                          Naoëlle, 20/08/2026 : « fais en sorte que les prix de l'offre et les prix par
                          compteurs soient centrés et un peu aérés entre eux ». Ils étaient collés au
                          bord droit — le numéro de PDL portait le seul ressort de la ligne et poussait
                          tout devant lui — tandis que ceux de l'offre étaient centrés : deux blocs de
                          chiffres l'un sous l'autre, sur deux axes différents. Un second ressort après
                          le groupe rétablit l'axe commun. */}
                      <span className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5">
                        <Cellule libelle="CONSO" valeur={volume} unite="MWh" />
                        {/* AU GAZ L'ABONNEMENT EST UN POSTE À PART, en électricité il est DANS l'énergie
                            (règle de Michel du 19/08/2026). L'afficher comme une colonne autonome des
                            deux côtés le ferait compter deux fois quand on additionne la ligne — c'est
                            ce que le test du 20/08 a montré. Côté électricité il est donc marqué inclus,
                            et il n'entre pas dans le total de la ligne. */}
                        <Cellule
                          libelle={gaz ? 'ABONNEMENT' : 'ABONNEMENT (inclus)'}
                          valeur={abonnementDe(d)}
                          unite="€"
                          estompe={!gaz}
                        />
                        <Cellule libelle="ÉNERGIE" valeur={d.cout_fourniture_annuel_ht} unite="€" />
                        <Cellule libelle={gaz ? 'RÉSEAU' : 'TURPE'} valeur={reseauDe(d)} unite="€" />
                        <Cellule libelle="TAXES" valeur={taxesDe(d)} unite="€" />
                        <span className="min-w-[86px] text-right">
                          <span className="block text-kw-micro font-bold tracking-[0.05em] text-kw-faint">
                            TOTAL / AN
                          </span>
                          {/* LE TOTAL EST LA SOMME DE CE QUI EST MONTRÉ SUR LA LIGNE, pas la valeur
                              stockée. Sur un PDL réel, le total en base valait 21 957 € alors que la
                              ligne affichait 18 757 d'énergie et 3 746 de contributions, soit 22 503 :
                              l'accise et la CTA, ajoutées le matin même, n'étaient pas dans le total
                              stocké. Une ligne qui ne s'additionne pas ne se fait pas pardonner. */}
                          <span className="block font-mono text-kw-base font-extrabold tabular-nums text-kw-green">
                            {(() => {
                              const t = totalDeLaLigne(d)
                              return t == null ? '—' : `${Math.round(t).toLocaleString('fr-FR')} €`
                            })()}
                          </span>
                        </span>
                      </span>
                      <span className="min-w-0 flex-1" />
                    </button>

                    {/* ── Niveau 3 : les composantes, en blocs ───────────────── */}
                    {estOuvert && (
                      <div className="animate-kw-fade-slide border-t border-kw-border-faint px-3 py-3">
                        <BlocCompose
                          couleur="blue"
                          titre="Abonnement"
                          aide="Part fixe facturée par le fournisseur, indépendante de la consommation."
                          total={abonnementDe(d)}
                        />
                        <BlocCompose
                          couleur="green"
                          titre="Énergie"
                          aide={gaz
                            ? 'La molécule et ce que le fournisseur refacture au mégawattheure.'
                            : "Le prix de chaque plage horosaisonnière. En électricité l'abonnement est compté ici."}
                          total={d.cout_fourniture_annuel_ht}
                          lignes={gaz
                            ? [
                                { l: 'Molécule', pu: d.prix_gaz?.prix_energie_mwh, vol: volume },
                                { l: 'CEE', pu: d.prix_gaz?.prix_cee_mwh, vol: volume },
                                { l: 'CPB', pu: d.prix_gaz?.prix_cpb_mwh, vol: volume },
                              ]
                            : [
                                // L'ÉLECTRON ET LA CAPACITÉ, POSTE PAR POSTE — la maquette de William
                                // les sépare, et pour une bonne raison : la capacité est bien plus
                                // chère en pointe qu'en creuses d'été, ce qu'un prix unique cacherait.
                                ...ORDRE_CLASSES.flatMap((c) => {
                                  const vol = compteur?.consoParClasseMwh?.[c] ?? null
                                  const electron = d.prix_electricite?.prix_mwh_par_classe?.[c] ?? null
                                  const capa = d.prix_electricite?.capacite_mwh_par_classe?.[c] ?? null
                                  const nom = LIBELLE_CLASSE[c] ?? c
                                  return [
                                    { l: `${nom} · électron`, pu: electron, vol },
                                    { l: `${nom} · capacité`, pu: capa, vol },
                                  ].filter((x) => x.pu != null)
                                }),
                                { l: 'CEE', pu: d.prix_electricite?.prix_cee_mwh ?? null, vol: volume },
                                { l: 'GO', pu: d.prix_electricite?.prix_go_mwh ?? null, vol: volume },
                              ]}
                        />
                        <BlocCompose
                          couleur="gold"
                          titre={gaz ? 'Contributions' : 'TURPE et contributions'}
                          aide={gaz
                            ? 'Acheminement et taxes. Le client les paie quel que soit le fournisseur.'
                            : "Le TURPE finance les réseaux, l'accise et la CTA sont des taxes. Identiques chez tous les fournisseurs."}
                          total={contributionsDe(d)}
                          lignes={gaz
                            ? [
                                { l: 'ATRT', pu: d.prix_gaz?.prix_atrt_mwh, vol: volume },
                                { l: 'ATRD', pu: d.prix_gaz?.prix_atrd_mwh, vol: volume },
                                { l: 'AGN', pu: d.prix_gaz?.prix_agn_mwh, vol: volume },
                                { l: 'CTA', montant: d.prix_gaz?.cta_annuel_ht },
                              ]
                            : [
                                // Le TURPE en quatre parts quand elles sont saisies, sinon son total.
                                ...(turpeDetaille(d) != null
                                  ? [
                                      { l: 'TURPE · gestion', montant: d.prix_electricite?.turpe_gestion_annuel_ht },
                                      { l: 'TURPE · comptage', montant: d.prix_electricite?.turpe_comptage_annuel_ht },
                                      { l: 'TURPE · soutirage fixe', montant: d.prix_electricite?.turpe_soutirage_fixe_annuel_ht },
                                      { l: 'TURPE · soutirage variable', montant: d.prix_electricite?.turpe_soutirage_variable_annuel_ht },
                                    ]
                                  : [{ l: 'TURPE', montant: d.prix_electricite?.prix_turpe_annuel_ht }]),
                                { l: 'AE — accise', montant: d.prix_electricite?.accise_annuel_ht },
                                { l: 'CTA', montant: d.prix_electricite?.cta_annuel_ht },
                              ]}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Les budgets d'une offre, additionnés sur ses points de livraison. */
export function budgetsDeLOffre(offre: OffreFournisseur) {
  const cumul = (f: (d: OffreFournisseur['details_par_compteur'][number]) => number | null | undefined) =>
    offre.details_par_compteur.reduce<number | null>((t, d) => somme(t, f(d)), null)
  const abonnement = cumul(abonnementDe)
  const energie = cumul((d) => d.cout_fourniture_annuel_ht)
  const reseau = cumul(reseauDe)
  const taxes = cumul(taxesDe)
  const contributions = cumul(contributionsDe)
  // Le total additionne les lignes, chacune sachant si son abonnement compte à part ou non.
  return { abonnement, energie, reseau, taxes, contributions, total: cumul(totalDeLaLigne) }
}

/**
 * Le total d'un point de livraison : la somme de ce que la ligne montre.
 *
 * L'abonnement n'y entre QU'AU GAZ. En électricité il est déjà compris dans le budget énergie, et
 * l'additionner le compterait deux fois — écart constaté sur un PDL réel le 20/08/2026.
 */
function totalDeLaLigne(d: OffreFournisseur['details_par_compteur'][number]) {
  const gaz = !!d.prix_gaz
  return somme(gaz ? abonnementDe(d) : null, d.cout_fourniture_annuel_ht, contributionsDe(d))
}

/** L'abonnement du PDL, quelle que soit son énergie. */
function abonnementDe(d: OffreFournisseur['details_par_compteur'][number]) {
  return d.prix_gaz?.abonnement_fourniture_annuel_ht ?? d.prix_electricite?.abonnement_fourniture_annuel_ht ?? null
}

/**
 * Le RÉSEAU d'un point de livraison : ce qui finance l'acheminement.
 *
 * La maquette de William sépare le réseau des taxes, et c'est une distinction qui a du sens pour le
 * client : le réseau se négocie indirectement — une optimisation de puissance le fait baisser — tandis
 * que les taxes sont identiques chez tous les fournisseurs. Les mêler dans un seul segment ferait
 * croire que rien n'est actionnable.
 *
 *   GAZ          ATRT + ATRD
 *   ÉLECTRICITÉ  TURPE
 */
function reseauDe(d: OffreFournisseur['details_par_compteur'][number]) {
  const vol = volumeDe(d)
  if (d.prix_gaz) {
    const parMwh = somme(d.prix_gaz.prix_atrt_mwh, d.prix_gaz.prix_atrd_mwh)
    return parMwh == null || vol == null ? null : parMwh * vol
  }
  return turpeDetaille(d) ?? d.prix_electricite?.prix_turpe_annuel_ht ?? d.cout_acheminement_annuel_ht ?? null
}

/**
 * Les TAXES d'un point de livraison : ce que le fournisseur ne fixe pas.
 *
 *   GAZ          AGN + CTA
 *   ÉLECTRICITÉ  accise + CTA
 */
function taxesDe(d: OffreFournisseur['details_par_compteur'][number]) {
  const vol = volumeDe(d)
  if (d.prix_gaz) {
    const agn = d.prix_gaz.prix_agn_mwh != null && vol != null ? d.prix_gaz.prix_agn_mwh * vol : null
    return somme(agn, d.prix_gaz.cta_annuel_ht)
  }
  return somme(d.prix_electricite?.accise_annuel_ht, d.prix_electricite?.cta_annuel_ht)
}

/** Le volume du PDL : celui retenu par le fournisseur, à défaut celui du compteur. */
function volumeDe(d: OffreFournisseur['details_par_compteur'][number]) {
  return d.consommation_annuelle_reference_mwh ?? d.prix_gaz?.car_reference_mwh ?? null
}

/**
 * Les contributions, réseau et taxes réunis.
 *
 * Reste utilisée là où l'on ne veut qu'un total — la vue interne du commercial, qui n'a pas besoin de
 * la distinction que le client, lui, doit comprendre.
 */
function contributionsDe(d: OffreFournisseur['details_par_compteur'][number]) {
  const somme2 = somme(reseauDe(d), taxesDe(d))
  // Repli sur le budget d'acheminement quand les composantes ne sont pas détaillées.
  return somme2 ?? d.cout_acheminement_annuel_ht ?? null
}

/**
 * La somme des quatre parts du TURPE, ou `null` si aucune n'est saisie.
 *
 * Quand le détail existe, il fait foi : garder le champ global en parallèle donnerait deux totaux
 * possibles pour la même chose, et rien pour dire lequel compte.
 */
export function turpeDetaille(d: OffreFournisseur['details_par_compteur'][number]) {
  const e = d.prix_electricite
  return somme(
    e?.turpe_gestion_annuel_ht,
    e?.turpe_comptage_annuel_ht,
    e?.turpe_soutirage_fixe_annuel_ht,
    e?.turpe_soutirage_variable_annuel_ht,
  )
}


function Cellule({ libelle, valeur, unite, estompe }: {
  libelle: string
  valeur: number | null | undefined
  unite: string
  /** Une valeur déjà comptée ailleurs se lit en gris : elle informe sans inviter à l'additionner. */
  estompe?: boolean
}) {
  return (
    <span className="min-w-[74px]">
      <span className="block text-kw-micro font-bold tracking-[0.05em] text-kw-faint">{libelle}</span>
      <span className={cn('block font-mono text-kw-sm tabular-nums', estompe ? 'font-normal text-kw-faint' : 'font-bold')}>
        {valeur == null
          ? <span className="text-kw-ghost">—</span>
          : `${unite === 'MWh' ? valeur.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : Math.round(valeur).toLocaleString('fr-FR')} ${unite}`}
      </span>
    </span>
  )
}

/**
 * Un bloc de composantes, avec son total en tête et ses lignes en dessous.
 *
 * Une ligne se donne soit au mégawattheure — et son montant se calcule par le volume — soit
 * directement en euros par an, comme la CTA ou l'accise. Les deux cohabitent dans le même bloc parce
 * que c'est ainsi que le fournisseur les annonce.
 */
function BlocCompose({ couleur, titre, aide, total, lignes }: {
  couleur: 'blue' | 'green' | 'gold'
  titre: string
  aide: string
  total: number | null | undefined
  lignes?: { l: string; pu?: number | null; vol?: number | null; montant?: number | null }[]
}) {
  const teintes = {
    blue: { bord: 'border-[#e6edf3]', fond: 'bg-[#f7f9fb]', puce: 'bg-kw-blue', texte: 'text-kw-blue' },
    green: { bord: 'border-kw-green-border', fond: 'bg-kw-green-tint', puce: 'bg-kw-green', texte: 'text-kw-green' },
    gold: { bord: 'border-kw-amber-border', fond: 'bg-kw-amber-light', puce: 'bg-kw-gold', texte: 'text-kw-amber-dark' },
  }[couleur]
  const visibles = (lignes ?? []).filter((x) => x.montant != null || (x.pu != null))
  return (
    <div className={cn('mb-2 overflow-hidden rounded-kw-md border last:mb-0', teintes.bord)}>
      <div className={cn('flex flex-wrap items-center gap-2 border-b px-3 py-2', teintes.bord, teintes.fond)}>
        <span className={cn('h-[7px] w-[7px] shrink-0 rounded-[3px]', teintes.puce)} />
        <span className={cn('text-kw-micro font-bold uppercase tracking-[0.06em]', teintes.texte)}>{titre}</span>
        <span className="flex-1" />
        <span className={cn('font-mono text-kw-base font-extrabold tabular-nums', teintes.texte)}>
          {total == null ? '—' : `${Math.round(total).toLocaleString('fr-FR')} €`}
        </span>
      </div>
      <p className="px-3 pt-1.5 text-kw-micro leading-snug text-kw-faint">{aide}</p>
      {visibles.length > 0 && (
        <div className="px-3 pb-2 pt-1">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1 text-kw-tiny">
            <span className="text-kw-micro font-bold tracking-[0.05em] text-kw-faint">POSTE</span>
            <span className="text-right text-kw-micro font-bold tracking-[0.05em] text-kw-faint">PRIX</span>
            <span className="text-right text-kw-micro font-bold tracking-[0.05em] text-kw-faint">VOLUME</span>
            <span className="text-right text-kw-micro font-bold tracking-[0.05em] text-kw-faint">€ / AN</span>
            {visibles.map((x) => {
              const montant = x.montant != null
                ? x.montant
                : x.pu != null && x.vol != null ? x.pu * x.vol : null
              return (
                <div key={x.l} className="col-span-4 grid grid-cols-[1fr_auto_auto_auto] gap-x-3 border-t border-kw-border-faint pt-1">
                  <span className="font-semibold text-kw-label">{x.l}</span>
                  <span className="text-right font-mono tabular-nums text-kw-meta">
                    {x.pu != null ? `${x.pu.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €/MWh` : '—'}
                  </span>
                  <span className="text-right font-mono tabular-nums text-kw-meta">
                    {x.vol != null ? `${x.vol.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} MWh` : '—'}
                  </span>
                  <span className="text-right font-mono font-bold tabular-nums">
                    {montant == null ? <span className="text-kw-ghost">—</span> : `${Math.round(montant).toLocaleString('fr-FR')} €`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
