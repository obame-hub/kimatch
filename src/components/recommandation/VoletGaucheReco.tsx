import { useState, type ReactNode } from 'react'
import { Building2, User, History, Coins, Send, Phone, Mail, RotateCcw, Search, Check, ExternalLink, Copy, Gauge, Folder } from 'lucide-react'
import { EntityLink } from '@/components/ui/entity-link'
import { cn } from '@/lib/utils'
import type { Compteur } from '@/types/domain'
import {
  usePartageEtudeClient,
  useEnvoyerEtudeClient,
  useDefinirExpirationEtude,
  urlEtudeClient,
  ilYA,
} from '@/lib/data/partagesEtude'
import type { ReferenceRow } from '@/lib/data/referenceTables'
import type { Recommandation, VersionRecommandation, Contact, Compte } from '@/types/domain'
import { appelerNumero, numeroLisible } from '@/lib/telephonie'

/**
 * Volet gauche de la fiche Recommandation — les cinq cartes de la maquette de William :
 * Compte, Contact principal, Versions, Coût de prestation, Étude client.
 *
 * Les valeurs de style (11 px de rayon, 12/13 px de padding, libellés à 10 px en capitales)
 * viennent du source de la maquette et non d'une estimation à l'œil ; elles existent déjà comme
 * jetons `kw-*` dans la configuration Tailwind, posés lors du portage de la fiche Compte.
 */

function Carte({
  icone,
  teinte,
  titre,
  droite,
  children,
  className,
}: {
  icone: ReactNode
  teinte: string
  titre: string
  droite?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-kw-xl border border-kw-border bg-white px-[13px] py-3', className)}>
      <div className="mb-[9px] flex items-center gap-[7px]">
        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-kw-sm', teinte)}>{icone}</span>
        <span className="text-kw-xs font-bold uppercase tracking-[0.08em] text-kw-faint">{titre}</span>
        <span className="flex-1" />
        {droite}
      </div>
      {children}
    </div>
  )
}

function initiales(nom: string): string {
  return nom
    .split(' ')
    .filter(Boolean)
    .map((m) => m[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function euros(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`
}

/**
 * Sélecteur « ⇄ » du design : une recherche, cinq résultats, et c'est tout.
 *
 * La création à la volée que propose la maquette (« ＋ Créer "Untel" ») n'est PAS reprise :
 * créer un contact demande au minimum un nom, un prénom et un compte de rattachement, et un
 * contact né d'un seul mot tapé dans une barre de recherche est un doublon de plus dans une table
 * qui en compte déjà 3 380. Le lien se fait vers un contact existant.
 */
function Selecteur({
  ouvert,
  onBasculer,
  options,
  onChoisir,
  placeholder,
}: {
  ouvert: boolean
  onBasculer: () => void
  options: { id: string; libelle: string }[]
  onChoisir: (id: string) => void
  placeholder: string
}) {
  const [recherche, setRecherche] = useState('')
  const filtrees = options
    .filter((o) => !recherche || o.libelle.toLowerCase().includes(recherche.toLowerCase()))
    .slice(0, 5)

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={onBasculer}
        title="Changer l'élément lié"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-kw-sm border border-kw-border-strong bg-white text-kw-xs text-kw-label hover:bg-kw-bg hover:text-kw-ink"
      >
        ⇄
      </button>
    )
  }
  return (
    <>
      <button
        type="button"
        onClick={onBasculer}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-kw-sm border border-kw-border-strong bg-kw-bg text-kw-xs text-kw-ink"
      >
        ⇄
      </button>
      <div className="absolute inset-x-[13px] top-[38px] z-20 animate-kw-fade-slide rounded-kw-lg border border-kw-border-strong bg-white p-[7px] shadow-kw-panel">
        <div className="flex items-center gap-1.5 rounded-kw-sm border border-kw-border-strong bg-kw-subtle px-2 py-1.5">
          <Search className="h-[11px] w-[11px] shrink-0 text-kw-faint" />
          <input
            autoFocus
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder={placeholder}
            className="min-w-0 flex-1 border-0 bg-transparent text-kw-base text-kw-ink outline-none placeholder:text-kw-faint"
          />
        </div>
        {filtrees.length === 0 ? (
          <p className="px-2 py-2 text-kw-base text-kw-faint">Aucun résultat.</p>
        ) : (
          filtrees.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => { onChoisir(o.id); setRecherche('') }}
              className="block w-full truncate rounded-kw-sm px-2 py-1.5 text-left text-kw-md font-semibold text-kw-ink hover:bg-kw-bg"
            >
              {o.libelle}
            </button>
          ))
        )}
      </div>
    </>
  )
}

/**
 * COÛT DE PRESTATION ET ÉTUDE CLIENT SONT MASQUÉS. Michel, 25/08/2026 : « supprimer les informations
 * inutiles du dossier — coût de prestation, étude client », et il précise « POUR LE MOMENT ».
 *
 * D'où un interrupteur et non une suppression. Retirer les deux blocs laissait derrière eux leurs
 * propriétés, leurs rappels, le dialogue « Fixer le coût de prestation » du parent et une quinzaine
 * de variables orphelines : un grand nettoyage, difficile à défaire, pour quelque chose qu'il a
 * qualifié de provisoire. Repasser à `true` les fait revenir tels quels.
 *
 * À NE PAS CONFONDRE AVEC LA COMMISSION ESTIMÉE, qu'il demande au contraire de GARDER — « la
 * commission estimée qui se calcule automatiquement selon la marge ». Ce sont deux choses
 * différentes : le coût de prestation est un montant saisi à la main sur le dossier
 * (`cout_prestation_estime`), la commission estimée se calcule depuis la marge dans le dialogue de
 * création de version. Elle n'est pas touchée ici.
 */
const AFFICHER_COUT_ET_ETUDE = false

export function VoletGaucheReco({
  reco,
  compte,
  contacts,
  compteurs,
  documents,
  contactPrincipal,
  versionAffichee,
  statutsVersions,
  onChoisirVersion,
  onMajContactSignataire,
  coutEstimeSuggere,
  onFixerCout,
  onDefinirEstime,
  peutModifier,
  signaler,
}: {
  reco: Recommandation
  compte: Compte | null | undefined
  contacts: Contact[]
  /** Le périmètre et les documents descendent ici depuis les onglets — voir le bloc ci-dessous. */
  compteurs: Compteur[]
  documents: { id: string; nom: string; type_document: string | null }[]
  contactPrincipal: Contact | null | undefined
  versionAffichee: VersionRecommandation | null
  /** Table de référence des statuts de version : la frise affiche le libellé, pas le code. */
  statutsVersions: ReferenceRow[]
  onChoisirVersion: (version: VersionRecommandation) => void
  onMajContactSignataire: (contactId: string) => void
  /** Ce que vaudrait l'estimation si on l'appliquait maintenant — calculée par la fiche à partir
   *  des économies de la version active. Proposée, jamais écrite d'office. */
  coutEstimeSuggere: number | null
  onFixerCout: () => void
  onDefinirEstime: (montant: number) => void
  peutModifier: boolean
  signaler: (message: string) => void
}) {
  const [selecteurOuvert, setSelecteurOuvert] = useState<'contact' | null>(null)
  const { data: partage } = usePartageEtudeClient(reco.id)
  const envoyerEtude = useEnvoyerEtudeClient()
  const definirExpiration = useDefinirExpirationEtude()

  // Le lien Eneo est porté par la VERSION : chaque cotation a la sienne, et changer de version dans
  // la frise doit changer l'étude proposée.
  const lienEneo = versionAffichee?.lien_eneo ?? null

  const estime = reco.cout_prestation_estime
  const reel = reco.cout_prestation_reel
  const coutFixe = reel != null

  // Échéance courante en jours pleins, pour surligner la bonne pastille parmi 7 / 14 / 30.
  const joursValidite = (() => {
    if (!partage?.date_expiration) return null
    const depart = partage.date_envoi ? new Date(partage.date_envoi) : new Date(partage.date_creation)
    return Math.round((new Date(partage.date_expiration).getTime() - depart.getTime()) / 86400000)
  })()

  async function envoyer(jours?: number) {
    try {
      const cree = await envoyerEtude.mutateAsync({
        recommandationId: reco.id,
        versionId: versionAffichee?.id ?? null,
        contactId: contactPrincipal?.id ?? reco.contact_signataire_id ?? null,
        joursValidite: jours ?? joursValidite ?? 14,
      })
      // Le lien est mis dans le presse-papiers plutôt qu'envoyé : l'écran public « Étude client »
      // n'est pas encore porté. Voir l'en-tête de partagesEtude.ts.
      if (cree?.jeton) {
        try {
          await navigator.clipboard.writeText(urlEtudeClient(cree.jeton))
          signaler('✓ Lien de l’étude enregistré et copié')
          return
        } catch {
          // Presse-papiers refusé (page non sécurisée, permission) : le partage est enregistré,
          // c'est l'essentiel — on ne fait pas passer ça pour un échec.
        }
      }
      signaler('✓ Lien de l’étude enregistré')
    } catch (e) {
      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="flex flex-col gap-3 bg-kw-subtle p-3.5">
      {/* ── COMPTE ── */}
      <Carte
        icone={<Building2 className="h-[11px] w-[11px]" />}
        teinte="bg-kw-blue-light text-kw-blue"
        titre="Compte"
        droite={
          <EntityLink to={`/comptes/${reco.compte_id}`} className="text-kw-sm font-semibold text-kw-blue">
            ouvrir →
          </EntityLink>
        }
      >
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-kw-sm bg-kw-blue-light text-[9.5px] font-bold text-kw-blue">
            {initiales(reco.compte_nom || '?')}
          </span>
          <div className="min-w-0">
            <EntityLink to={`/comptes/${reco.compte_id}`} className="block truncate text-kw-xl font-bold text-kw-ink">
              {reco.compte_nom || '—'}
            </EntityLink>
            {/* « Syndic · mandant » dans la maquette : le segment du compte, puis le type de
                recommandation (Renouvellement / Captation). Le segment est le mot métier, pas
                `type_compte` qui ne dit que « client ». */}
            <div className="truncate text-kw-sm text-kw-meta">
              {[compte?.segment_compte_libelle || compte?.segment, reco.type_opportunite].filter(Boolean).join(' · ')
                || 'Segment non renseigné'}
            </div>
          </div>
        </div>
      </Carte>

      {/* ── CONTACT PRINCIPAL ── */}
      <div className="relative rounded-kw-xl border-[1.5px] border-violet-200 bg-gradient-to-br from-violet-50 to-white px-[13px] py-3">
        <div className="mb-[9px] flex items-center gap-[7px]">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-kw-sm bg-violet-100 text-kw-purple">
            <User className="h-[11px] w-[11px]" />
          </span>
          <span className="text-kw-xs font-bold uppercase tracking-[0.08em] text-kw-faint">Contact principal</span>
          <span className="flex-1" />
          {peutModifier && (
            <Selecteur
              ouvert={selecteurOuvert === 'contact'}
              onBasculer={() => setSelecteurOuvert((v) => (v === 'contact' ? null : 'contact'))}
              options={contacts.map((c) => ({ id: c.id, libelle: `${c.prenom} ${c.nom}`.trim() }))}
              onChoisir={(id) => { onMajContactSignataire(id); setSelecteurOuvert(null) }}
              placeholder="Rechercher un contact du compte…"
            />
          )}
          {contactPrincipal && (
            <EntityLink to={`/contacts/${contactPrincipal.id}`} className="text-kw-sm font-semibold text-kw-purple">
              ouvrir →
            </EntityLink>
          )}
        </div>
        {contactPrincipal ? (
          <>
            <div className="flex items-center gap-[9px]">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-violet-400 text-kw-base font-bold text-white">
                {initiales(`${contactPrincipal.prenom} ${contactPrincipal.nom}`)}
              </div>
              <div className="min-w-0">
                <EntityLink to={`/contacts/${contactPrincipal.id}`} className="block truncate text-kw-xl font-bold text-kw-ink">
                  {contactPrincipal.prenom} {contactPrincipal.nom}
                </EntityLink>
                <div className="truncate text-kw-xs text-kw-meta">{contactPrincipal.fonction || 'Fonction non renseignée'}</div>
                {/* LE NUMÉRO S'AFFICHE, ET CE N'EST PAS COSMÉTIQUE. L'extension Allo décore les
                    numéros qu'elle VOIT sur la page : derrière une icône et une infobulle, elle n'a
                    rien à détecter et l'icône Allo n'apparaît jamais. Le texte est la condition pour
                    que l'appel dans Allo soit possible. */}
                {contactPrincipal.telephone && (
                  <div className="truncate font-mono text-kw-xs text-kw-body">{numeroLisible(contactPrincipal.telephone)}</div>
                )}
              </div>
            </div>
            <div className="mt-2.5 flex gap-1.5">
              <button
                type="button"
                onClick={() => contactPrincipal.telephone && void appelerNumero(contactPrincipal.telephone)}
                title={contactPrincipal.telephone || 'Aucun téléphone'}
                disabled={!contactPrincipal.telephone}
                className={cn(
                  'flex h-7 flex-1 items-center justify-center rounded-kw-sm border border-kw-border-strong bg-white text-kw-green',
                  contactPrincipal.telephone ? 'hover:bg-kw-green-light' : 'pointer-events-none opacity-40',
                )}
              >
                <Phone className="h-3 w-3" />
              </button>
              <a
                href={contactPrincipal.email ? `mailto:${contactPrincipal.email}` : undefined}
                title={contactPrincipal.email || 'Aucun email'}
                aria-disabled={!contactPrincipal.email}
                className={cn(
                  'flex h-7 flex-1 items-center justify-center rounded-kw-sm border border-kw-border-strong bg-white text-kw-blue',
                  contactPrincipal.email ? 'hover:bg-kw-blue-light' : 'pointer-events-none opacity-40',
                )}
              >
                <Mail className="h-3 w-3" />
              </a>
            </div>
          </>
        ) : (
          <p className="text-kw-base text-kw-faint">
            Aucun contact signataire. {peutModifier && 'Utilisez ⇄ pour en désigner un.'}
          </p>
        )}
      </div>

      {/* ══════════ PÉRIMÈTRE ══════════
          Michel, 25/08/2026 : « le périmètre, je le mettrais en dessous de contact », et la règle
          qu'il en tire — « tous les objets qui sont liés à la recommandation, ou à l'opportunité, je
          les mettrais toujours sur la gauche, comme ça on a toujours la même logique ». Naoëlle a
          reformulé : « au compteur, dans un carré à gauche, en dessous de contact principal ». */}
      <Carte
        icone={<Gauge className="h-[11px] w-[11px]" />}
        teinte="bg-kw-muted text-kw-meta"
        titre="Périmètre"
        droite={<span className="font-mono text-kw-micro font-extrabold text-kw-faint">{compteurs.length}</span>}
      >
        {compteurs.length === 0 ? (
          <p className="text-kw-micro text-kw-faint">Aucun point de livraison rattaché.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {compteurs.slice(0, 6).map((k) => (
              <a
                key={k.id}
                href={`/compteurs/${k.id}`}
                className="flex items-baseline justify-between gap-2 rounded-kw-sm px-1 py-0.5 hover:bg-kw-bg"
              >
                <span className="truncate font-mono text-kw-micro font-bold text-kw-ink">{k.numero_pdl}</span>
                <span className="shrink-0 font-mono text-kw-micro text-kw-faint">
                  {k.consommation_annuelle_mwh != null
                    ? `${k.consommation_annuelle_mwh.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} MWh`
                    : '—'}
                </span>
              </a>
            ))}
            {/* On dit le reste plutôt que de le couper en silence. */}
            {compteurs.length > 6 && (
              <span className="px-1 text-kw-micro text-kw-faint">et {compteurs.length - 6} autres</span>
            )}
          </div>
        )}
      </Carte>

      {/* ══════════ DOCUMENTS ══════════
          « Les documents et document, c'est un objet aussi, je le mettrais en dessous. » Il précise
          pourquoi l'onglet ne servait à rien : « les documents sont dans les versions en vérité, donc
          en réalité j'ai pas besoin de documents » — sauf un cas qu'il nomme lui-même, « le client a
          envoyé une offre d'un fournisseur qu'il a déjà reçue ». D'où une carte et non un onglet :
          l'exception se voit sans occuper une place permanente. */}
      <Carte
        icone={<Folder className="h-[11px] w-[11px]" />}
        teinte="bg-kw-muted text-kw-meta"
        titre="Documents"
        droite={<span className="font-mono text-kw-micro font-extrabold text-kw-faint">{documents.length}</span>}
      >
        {documents.length === 0 ? (
          <p className="text-kw-micro text-kw-faint">
            Aucun document sur le dossier — ceux des consultations vivent sur leur version.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {documents.slice(0, 6).map((d) => (
              <a
                key={d.id}
                href={`/documents/${d.id}`}
                className="truncate rounded-kw-sm px-1 py-0.5 text-kw-micro font-semibold text-kw-ink hover:bg-kw-bg"
                title={d.nom}
              >
                {d.nom}
              </a>
            ))}
            {documents.length > 6 && (
              <span className="px-1 text-kw-micro text-kw-faint">et {documents.length - 6} autres</span>
            )}
          </div>
        )}
      </Carte>

      {/* ── VERSIONS ── */}
      <Carte
        icone={<History className="h-[11px] w-[11px]" />}
        teinte="bg-kw-amber-light text-[#8a4b2a]"
        titre="Versions"
        droite={
          <span className="rounded-kw-lg bg-kw-amber-light px-2 py-0.5 text-kw-xs font-extrabold text-[#8a4b2a]">
            {reco.versions.length}
          </span>
        }
      >
        {reco.versions.length === 0 ? (
          <p className="text-kw-base text-kw-faint">Aucune version — la première reste à produire.</p>
        ) : (
          <div className="flex flex-col">
            {/* Les versions arrivent déjà triées du plus récent au plus ancien (numero_version
                décroissant) : la frise se lit de haut en bas comme l'historique. */}
            {reco.versions.map((v, i) => {
              const expiree = !v.version_actuelle
              const affichee = versionAffichee?.id === v.id
              return (
                <div key={v.id} className="flex gap-[9px]">
                  <div className="flex w-3.5 shrink-0 flex-col items-center">
                    <span
                      className="mt-3 h-2.5 w-2.5 shrink-0 rounded-full border-[2.5px]"
                      style={{
                        background: expiree ? '#dcdad5' : '#8a4b2a',
                        borderColor: expiree ? '#f0efec' : '#f7ece3',
                      }}
                    />
                    {i < reco.versions.length - 1 && <span className="min-h-2 w-0.5 flex-1 bg-[#eee4d2]" />}
                  </div>
                  {/*
                    Deux lignes et non une seule. Mesuré dans le navigateur le 18/08/2026 : sur une
                    colonne de 256 px, « Version 4 » + le statut + la date débordaient de 32 px, et
                    le nom se coupait en « Version » / « 4 ». Le nom et le statut tiennent la
                    première ligne, la date passe dessous — plus rien ne déborde et le nom reste lisible.
                  */}
                  <button
                    type="button"
                    onClick={() => onChoisirVersion(v)}
                    title="Afficher cette version"
                    className={cn(
                      'mb-1.5 flex min-w-0 flex-1 flex-col gap-0.5 rounded-kw-lg border px-[9px] py-[7px] text-left transition-colors',
                      affichee
                        ? 'border-[#dcc39c] bg-kw-amber-light ring-1 ring-[#dcc39c]'
                        : expiree
                          ? 'border-kw-border-subtle bg-kw-subtle hover:border-[#dcc39c]'
                          : 'border-[#dcc39c] bg-kw-amber-light',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-[7px]">
                      <span
                        className={cn(
                          'truncate font-mono text-kw-md font-extrabold',
                          expiree ? 'text-kw-faint' : 'text-[#8a4b2a]',
                        )}
                      >
                        {v.nom || `V${v.numero_version ?? '?'}`}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 rounded-[7px] px-1.5 py-px text-[8px] font-extrabold uppercase tracking-[0.05em]',
                          expiree ? 'bg-kw-muted text-kw-faint' : 'bg-[#8a4b2a] text-white',
                        )}
                      >
                        {/* Le LIBELLÉ du statut, pas son code : la frise affichait « REMPLACEE »,
                            tel quel, sans accent — c'est la clé technique et non un mot français. */}
                        {v.version_actuelle
                          ? 'Active'
                          : statutsVersions.find((st) => st.code === v.statut)?.libelle || 'Remplacée'}
                      </span>
                    </span>
                    <span className="font-mono text-kw-tiny text-kw-faint">
                      {new Date(v.date_creation).toLocaleDateString('fr-FR')}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </Carte>

      {/* ── COÛT DE PRESTATION ── */}
      {AFFICHER_COUT_ET_ETUDE && (
      <Carte
        icone={<Coins className="h-[11px] w-[11px]" />}
        teinte="bg-kw-amber-light text-[#8a4b2a]"
        titre="Coût de prestation"
        droite={
          peutModifier && (
            <button
              type="button"
              onClick={onFixerCout}
              title={coutFixe ? 'Montant fixé — cliquer pour le corriger' : "Fixer le montant réellement facturé"}
              className={cn(
                'whitespace-nowrap rounded-kw-sm border px-[7px] py-0.5 text-kw-micro font-extrabold',
                coutFixe
                  ? 'border-kw-green-border bg-kw-green-light text-kw-green'
                  : 'border-kw-border-strong bg-white text-kw-meta hover:bg-kw-bg',
              )}
            >
              {coutFixe ? '✓ FIXÉ' : 'fixer'}
            </button>
          )
        }
      >
        <div
          className={cn('flex items-center justify-between gap-2 rounded-kw-md px-[9px] py-[7px]', coutFixe ? 'bg-kw-subtle' : 'bg-kw-amber-light')}
        >
          <span className="text-kw-micro font-extrabold uppercase tracking-[0.06em] text-[#8a4b2a]">Estimé</span>
          {estime != null ? (
            <span className="font-mono text-[16px] font-extrabold text-kw-ink">{euros(estime)}</span>
          ) : coutEstimeSuggere != null && peutModifier ? (
            // Pas de montant estimé en base — et il n'y en a sur AUCUNE des 1703 recommandations.
            // Plutôt qu'un tiret muet, la fiche propose le calcul et laisse l'écrire d'un clic.
            <button
              type="button"
              onClick={() => onDefinirEstime(coutEstimeSuggere)}
              title={`12 % des économies estimées de la version affichée (${euros(coutEstimeSuggere)})`}
              className="font-mono text-kw-md font-bold text-[#8a4b2a] underline decoration-dashed underline-offset-2 hover:text-kw-ink"
            >
              estimer à {euros(coutEstimeSuggere)}
            </button>
          ) : (
            <span className="font-mono text-[16px] font-extrabold text-kw-ghost">— €</span>
          )}
        </div>
        <div
          className={cn('mt-1.5 flex items-center justify-between gap-2 rounded-kw-md px-[9px] py-[7px]', coutFixe ? 'bg-kw-green-light' : 'bg-kw-subtle')}
        >
          <span
            className={cn('text-kw-micro font-extrabold uppercase tracking-[0.06em]', coutFixe ? 'text-kw-green' : 'text-kw-ghost')}
          >
            {coutFixe ? 'Fixé' : 'Réel'}
          </span>
          <span className={cn('font-mono text-[16px] font-extrabold', coutFixe ? 'text-kw-green' : 'text-kw-ghost')}>
            {reel != null ? euros(reel) : '— €'}
          </span>
        </div>
        <p className="mt-1.5 text-kw-tiny leading-snug text-kw-faint">
          {coutFixe
            ? 'Montant facturé, arrêté à la clôture.'
            : 'Le réel se fixe à la clôture, sur les économies constatées.'}
        </p>
      </Carte>
      )}

      {/* ── ÉTUDE CLIENT ── */}
      {AFFICHER_COUT_ET_ETUDE && (
      <div className="rounded-kw-xl border-[1.5px] border-[#c4ddd3] bg-gradient-to-br from-kw-green-tint to-white px-[13px] py-3">
        <div className="mb-[9px] flex items-center gap-[7px]">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-kw-sm bg-kw-green-light text-kw-green">
            <Send className="h-[11px] w-[11px]" />
          </span>
          <span className="text-kw-xs font-bold uppercase tracking-[0.08em] text-kw-faint">Étude client</span>
          <span className="flex-1" />
          <span
            className={cn(
              'rounded-kw-lg border px-2 py-0.5 text-kw-micro font-extrabold tracking-[0.05em]',
              lienEneo || partage?.date_envoi
                ? 'border-kw-green-border bg-kw-green-light text-kw-green'
                : 'border-kw-border-strong bg-white text-kw-faint',
            )}
          >
            {lienEneo ? 'ENEO' : partage?.date_envoi ? 'ENVOYÉE' : 'NON ENVOYÉE'}
          </span>
        </div>

        {/*
          L'étude client existe déjà : c'est Eneo. Quand la version affichée porte son lien, il fait
          foi et le partage maison n'est pas proposé — deux liens concurrents vers la même étude est
          la meilleure façon d'envoyer le mauvais au client. Le partage maison reste branché pour
          l'étude interne prévue plus tard (décision de Naoëlle, 17/08/2026).
        */}
        {lienEneo ? (
          <>
            <div className="text-kw-sm leading-[1.55] text-kw-label">
              Étude <b>Eneo</b> rattachée à {versionAffichee?.nom || 'cette version'}.
            </div>
            <div className="mt-2.5 flex gap-1.5">
              <a
                href={lienEneo}
                target="_blank"
                rel="noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-kw-md bg-gradient-to-br from-kw-green to-[#199b78] px-1 py-2 text-kw-sm font-bold text-white shadow-kw-green hover:brightness-105"
              >
                <ExternalLink className="h-3 w-3" /> Ouvrir l'étude Eneo
              </a>
              <button
                type="button"
                title="Copier le lien pour l'envoyer au client"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(lienEneo)
                    signaler('✓ Lien de l’étude copié')
                  } catch {
                    signaler('Copie refusée par le navigateur')
                  }
                }}
                className="inline-flex items-center justify-center rounded-kw-md border border-kw-border-strong bg-white px-2.5 py-2 text-kw-sm font-bold text-kw-label hover:bg-kw-bg"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          </>
        ) : partage?.date_envoi ? (
          <div className="text-kw-sm leading-[1.55] text-kw-label">
            Envoyée le <b className="font-mono">{new Date(partage.date_envoi).toLocaleDateString('fr-FR')}</b>
            {partage.contact_nom ? <> à {partage.contact_nom}</> : null}
            <br />
            {partage.nb_visites > 0 ? (
              <span className="font-bold text-kw-green">
                ✓ Consultée {partage.date_derniere_visite ? ilYA(partage.date_derniere_visite) : ''}
              </span>
            ) : (
              <span className="text-kw-faint">Pas encore consultée</span>
            )}
            {' · '}
            {partage.nb_visites} visite{partage.nb_visites > 1 ? 's' : ''}
          </div>
        ) : (
          <p className="text-kw-sm leading-snug text-kw-label">
            Aucun lien d'étude n'a été partagé pour cette recommandation.
          </p>
        )}

        {peutModifier && !lienEneo && (
          <div className="mt-[9px] flex items-center gap-1.5">
            <span className="text-kw-tiny font-extrabold uppercase tracking-[0.06em] text-kw-faint">Expiration</span>
            {[7, 14, 30].map((j) => {
              const actif = (joursValidite ?? 14) === j
              return (
                <button
                  key={j}
                  type="button"
                  onClick={async () => {
                    if (!partage) return envoyer(j)
                    try {
                      await definirExpiration.mutateAsync({
                        partageId: partage.id,
                        recommandationId: reco.id,
                        jours: j,
                        dateEnvoi: partage.date_envoi,
                      })
                      signaler(`✓ Expiration du lien : ${j} jours`)
                    } catch (e) {
                      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
                    }
                  }}
                  className={cn(
                    'rounded-kw-md px-2 py-0.5 font-mono text-[9.5px] font-extrabold',
                    actif && partage ? 'bg-kw-green text-white' : 'bg-kw-muted text-kw-label hover:bg-kw-border',
                  )}
                >
                  {j} j
                </button>
              )
            })}
          </div>
        )}

        {peutModifier && !lienEneo && (
          <div className="mt-2.5 flex gap-1.5">
            <button
              type="button"
              onClick={() => envoyer()}
              disabled={envoyerEtude.isPending}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-kw-md bg-gradient-to-br from-kw-green to-[#199b78] px-1 py-2 text-kw-sm font-bold text-white shadow-kw-green disabled:opacity-60"
            >
              {partage?.date_envoi ? <><RotateCcw className="h-3 w-3" /> Renvoyer le lien</> : <><Check className="h-3 w-3" /> Créer le lien</>}
            </button>
          </div>
        )}
        {/* Sans lien Eneo, on dit franchement que le partage maison n'aboutit pas encore, au lieu de
            laisser croire à un envoi : l'étude interne reste à construire. */}
        {!lienEneo && (
          <p className="mt-1.5 text-kw-tiny leading-snug text-kw-faint">
            Aucune étude Eneo sur cette version. Le lien maison est enregistré et copié, pas envoyé
            au client : l'étude interne reste à construire.
          </p>
        )}
      </div>
      )}
    </div>
  )
}
