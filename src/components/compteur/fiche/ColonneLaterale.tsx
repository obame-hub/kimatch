import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { HeroQualiteCompte, type FaitEllipro } from '@/components/compte/HerosCompte'
import { ChangementDeCompte, ResultatRattache } from '@/components/compteur/CartesRattachement'
import { useQualiteCompte } from '@/lib/data/qualiteCompte'
import { useCompteursParCompte } from '@/lib/data/compteurs'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { useCreerUnContact } from '@/lib/creationContact'
import { contactsPourLaFente } from '@/lib/contactRoles'
import { estConsommateur, type Compte, type Compteur, type Contact, type Contrat } from '@/types/domain'
import { logoFournisseur, initialesFournisseur } from '@/lib/logosFournisseurs'
import type { EcheanceCompteur, EcheanceDuCompteur } from '@/lib/echeance'
import { cn } from '@/lib/utils'
import {
  Carte, MENU_FLOTTANT, Sourcil, dateFr, initiales, joursJusqua, libelleJours, useMenu,
} from '@/components/compteur/fiche/commun'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * FICHE COMPTEUR v4 — LA COLONNE LATÉRALE (blocs E à H)
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 *   E. Qualité du compte   le héros de la fiche compte, tel quel
 *   F. Compte              la carte qui mène au compte
 *   G. Contacts            responsable, et conseil syndical chez un syndic
 *   H. Contrat en cours    fournisseur, compte à rebours, client ou prospect
 */

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// E · QUALITÉ DU COMPTE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export function BlocQualiteCompte({ compteId }: { compteId: string | null | undefined }) {
  const navigate = useNavigate()
  const { data: q } = useQualiteCompte(compteId ?? undefined)
  if (!compteId) return null
  /* Le pied de la maquette : les trois manques du barème, un fait à zéro ne s'affiche pas. */
  const faits: FaitEllipro[] = [
    { libelle: 'Sans contrat', aide: 'Compteurs du compte sans contrat en cours', valeur: String(q?.sans_contrat ?? 0) },
    { libelle: 'Échéance à revoir', aide: 'Compteurs dont l’échéance est absente ou dépassée', valeur: String(q?.echeance_a_revoir ?? 0) },
    { libelle: 'Sans responsable', aide: 'Compteurs sans responsable désigné', valeur: String(q?.sans_responsable ?? 0) },
  ].filter((f) => f.valeur !== '0')
  return (
    <HeroQualiteCompte
      score={q?.score ?? 0}
      nbCompteurs={q?.nb_compteurs ?? 0}
      sansContrat={q?.sans_contrat ?? 0}
      echeanceARevoir={q?.echeance_a_revoir ?? 0}
      sansResponsable={q?.sans_responsable ?? 0}
      parfaits={q?.parfaits ?? 0}
      faits={faits}
      onVoirCompteurs={() => navigate(`/comptes/${compteId}`)}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// F · COMPTE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ══ LE COMPTE SE CHANGE LÀ OÙ IL S'AFFICHE ══
 * Règle permanente de William (18/09/2026) : un rattachement affiché doit pouvoir être changé depuis
 * l'écran où il s'affiche. La maquette ne dessine que le lien ; l'onglet « Rattachements », qui
 * portait ce geste, disparaît. Il revient donc ici, sous la forme du bouton « Changer » des contacts
 * juste en dessous, et ouvre le même parcours de rattachement qu'avant.
 */
export function BlocCompte({ compteur, compte, modifiable }: {
  compteur: Compteur
  compte: Compte | undefined
  modifiable: boolean
}) {
  const { data: compteurs } = useCompteursParCompte(compte?.id)
  const [changement, setChangement] = useState(false)
  const [resultat, setResultat] = useState<Parameters<typeof ResultatRattache>[0]['r'] | null>(null)
  const nb = compteurs?.length ?? 0
  const type = compte ? (estConsommateur(compte.type_compte) ? 'Client' : compte.type_compte === 'partenaire' ? 'Partenaire' : compte.type_compte === 'fournisseur' ? 'Fournisseur' : 'KiWee') : null
  const detail = [compte?.segment_compte_libelle ?? compte?.segment, nb ? `${nb} compteur${nb > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ')

  return (
    <>
      <Link
        to={compte ? `/comptes/${compte.id}` : '#'}
        className="group flex items-center gap-3 rounded-[16px] border border-km-line bg-white px-4 py-[14px] text-km-text no-underline shadow-km-card transition-colors duration-150 hover:border-km-blue hover:text-km-text hover:no-underline"
      >
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[12px] bg-km-blue-soft text-km-blue">
          <Building2 className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <Sourcil className="block">Compte</Sourcil>
          <div className="mt-px truncate text-[14.5px] font-bold">{compte?.nom ?? 'Aucun compte'}</div>
          {compte && (
            <div className="mt-1 flex items-center gap-1.5">
              {type && <span className="rounded-[6px] bg-km-green-soft px-[7px] py-px text-[10px] font-bold text-km-green">{type}</span>}
              {detail && <span className="truncate text-[11px] text-km-muted">{detail}</span>}
            </div>
          )}
        </div>
        {/* AU REPOS, LA CARTE DE LA MAQUETTE : le « Changer » ne prend la place du chevron qu'au
            survol ou au clavier, pour ne pas rogner le nom ni la ligne du dessous. */}
        <span className="relative flex flex-none items-center justify-end">
          <span className={cn('text-[16px] text-km-blue', modifiable && 'group-focus-within:invisible group-hover:invisible')}>›</span>
          {modifiable && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setChangement(true) }}
              className="invisible absolute right-0 whitespace-nowrap rounded-[8px] border border-km-line bg-white px-2 py-1 text-[11px] font-semibold text-km-muted hover:bg-km-soft hover:text-km-text focus:visible group-focus-within:visible group-hover:visible"
            >
              Changer
            </button>
          )}
        </span>
      </Link>
      {(changement || resultat) && (
        <Dialog open onClose={() => { setChangement(false); setResultat(null) }} title="Rattacher ce compteur à un autre compte" className="max-w-[560px]">
          {resultat ? (
            <ResultatRattache r={resultat} onFermer={() => { setResultat(null); setChangement(false) }} />
          ) : (
            <ChangementDeCompte
              compteur={compteur}
              compteActuel={compte}
              responsableNom={compteur.responsable_contact_nom ?? 'Le responsable'}
              onFini={setResultat}
              onFermer={() => setChangement(false)}
            />
          )}
        </Dialog>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// G · CONTACTS DU COMPTEUR
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const SEGMENTS_SYNDIC = ['SYNDIC_PRO', 'SYNDIC_BENEVOLE']

export function BlocContacts({ compteur, compte, contactsDuCompte, modifiable, enregistrer, onToast }: {
  compteur: Compteur
  compte: Compte | undefined
  contactsDuCompte: Contact[]
  modifiable: boolean
  enregistrer: (patch: Record<string, unknown>) => Promise<void>
  onToast: (m: string) => void
}) {
  const { data: segments } = useReferenceTable('segments_comptes')
  /* ══ LE CONSEIL SYNDICAL EST DÛ CHEZ UN SYNDIC ══
     William, 30/09/2026 : « à partir du moment où le compte rattaché est indiqué "Syndic
     professionnel", le contact conseil syndical doit être indiqué. Et s'il est vide, proposer
     d'assigner ou de créer un contact. »
     DEUX SOURCES, parce que la base en a deux : le segment de référence (`comptes_clients.
     segment_compte_id`, codes SYNDIC_PRO / SYNDIC_BENEVOLE) et le segment écrit en texte sur le
     compte (`comptes.segment`). 541 syndics ne portent que le second — c'est le cas de KIWEE ENERGIE
     FRANCE, sur lequel le groupe n'apparaissait pas. */
  const codeSegment = segments?.find((s) => s.id === compte?.segment_compte_id)?.code ?? null
  const texteSegment = (compte?.segment_compte_libelle ?? compte?.segment ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
  const chezUnSyndic = (codeSegment != null && SEGMENTS_SYNDIC.includes(codeSegment))
    || texteSegment === 'syndic professionnel' || texteSegment === 'syndic non professionnel'
  const aConseil = chezUnSyndic || Boolean(compteur.contact_conseil_syndical_id)

  return (
    <Carte className="flex flex-col gap-3 px-4 py-[14px]">
      <Sourcil>Contacts du compteur</Sourcil>
      <GroupeContact
        titre="Responsable"
        fente="responsable"
        couleurs={{ fg: '#7C5BB0', bg: '#F2ECFB' }}
        contactId={compteur.responsable_contact_id ?? null}
        contactNom={compteur.responsable_contact_nom ?? null}
        compte={compte}
        contactsDuCompte={contactsDuCompte}
        modifiable={modifiable}
        onCommit={async (id, nom) => {
          await enregistrer({ responsable_contact_id: id })
          onToast(id ? `✓ Responsable : ${nom}` : 'Contact retiré')
        }}
        onToast={onToast}
      />
      {aConseil && (
        <GroupeContact
          titre="Conseil syndical"
          fente="conseilSyndical"
          couleurs={{ fg: '#3F6E9C', bg: '#EAF1F8' }}
          contactId={compteur.contact_conseil_syndical_id ?? null}
          contactNom={compteur.contact_conseil_syndical_nom ?? null}
          compte={compte}
          contactsDuCompte={contactsDuCompte}
          modifiable={modifiable}
          onCommit={async (id, nom) => {
            await enregistrer({ contact_conseil_syndical_id: id })
            onToast(id ? `✓ Conseil syndical : ${nom}` : 'Contact retiré')
          }}
          onToast={onToast}
        />
      )}
    </Carte>
  )
}

function GroupeContact({
  titre, fente, couleurs, contactId, contactNom, compte, contactsDuCompte, modifiable, onCommit, onToast,
}: {
  titre: string
  fente: 'responsable' | 'conseilSyndical'
  couleurs: { fg: string; bg: string }
  contactId: string | null
  contactNom: string | null
  compte: Compte | undefined
  contactsDuCompte: Contact[]
  modifiable: boolean
  onCommit: (id: string | null, nom: string | null) => Promise<void>
  onToast: (m: string) => void
}) {
  const menu = useMenu()
  const creerUnContact = useCreerUnContact()
  const eligibles = contactsPourLaFente(contactsDuCompte, fente, contactId)

  async function choisir(id: string | null, nom: string | null) {
    menu.setOuvert(false)
    try {
      await onCommit(id, nom)
    } catch (e) {
      onToast(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-[650] text-km-text">{titre}</span>
      <div ref={menu.ref} className="relative">
        {contactId ? (
          <div className="flex items-center gap-2.5 rounded-[12px] border border-km-line-soft bg-km-bg px-2.5 py-2">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[12px] font-bold" style={{ background: couleurs.bg, color: couleurs.fg }}>
              {initiales(contactNom)}
            </span>
            <Link to={`/contacts/${contactId}`} className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-km-text">
              {contactNom ?? 'Contact'}
            </Link>
            {modifiable && (
              <button
                type="button"
                onClick={menu.basculer}
                className="whitespace-nowrap rounded-[8px] border border-km-line bg-white px-2 py-1 text-[11px] font-semibold text-km-muted hover:bg-km-soft hover:text-km-text"
              >
                Changer
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded-[12px] border-[1.5px] border-dashed border-[#D5DBD7] py-[7px] pl-3 pr-2">
            <span className="flex-1 text-[12px] text-km-faint">Aucun contact</span>
            {modifiable && (
              <>
                <button
                  type="button"
                  onClick={menu.basculer}
                  className="rounded-[8px] bg-km-green-soft px-[9px] py-[5px] text-[11.5px] font-semibold text-km-green hover:brightness-[.97]"
                >
                  Assigner
                </button>
                <button
                  type="button"
                  onClick={() => compte && creerUnContact({
                    compte: { id: compte.id, nom: compte.nom },
                    type: fente === 'conseilSyndical' ? 'membreCS' : 'contact',
                    onCree: (c) => void choisir(c.id, `${c.prenom} ${c.nom}`),
                  })}
                  className="rounded-[8px] border border-km-line bg-white px-[9px] py-1 text-[11.5px] font-semibold text-km-text hover:bg-km-soft"
                >
                  ＋ Créer
                </button>
              </>
            )}
          </div>
        )}
        {menu.ouvert && (
          <div className={cn(MENU_FLOTTANT, 'absolute right-0 top-[calc(100%+4px)] w-[250px]')}>
            <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[.06em] text-km-faint">
              Contacts de {compte?.nom ?? 'ce compte'}
            </div>
            {eligibles.length === 0 && (
              <div className="px-2.5 py-[7px] text-[12px] text-km-faint">
                {fente === 'conseilSyndical' ? 'Aucun membre du conseil syndical sur ce compte.' : 'Aucun contact sur ce compte.'}
              </div>
            )}
            {eligibles.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => void choisir(c.id, `${c.prenom} ${c.nom}`)}
                className="flex w-full justify-between gap-2 rounded-[8px] px-2.5 py-[7px] text-left text-[12.5px] font-semibold text-km-text hover:bg-km-soft"
              >
                <span className="truncate">{c.prenom} {c.nom}</span>
                {c.id === contactId && <span className="text-km-green">✓</span>}
              </button>
            ))}
            {contactId && (
              <button
                type="button"
                onClick={() => void choisir(null, null)}
                className="mt-0.5 block w-full rounded-b-[8px] border-t border-km-line-soft px-2.5 py-[7px] text-left text-[12px] text-km-red hover:bg-km-red-soft"
              >
                Retirer ce contact
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// H · CONTRAT EN COURS
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Le logo du fournisseur sur fond blanc, ou ses initiales quand on ne l'a pas. */
export function LogoFournisseur({ nom, taille, rayon, part, bordure = true }: {
  nom: string | null | undefined
  taille: number
  rayon: number
  /** La place du logo dans sa tuile, en pour cent. */
  part: number
  bordure?: boolean
}) {
  const logo = logoFournisseur(nom)
  return (
    <span
      className={cn('flex flex-none items-center justify-center bg-white text-[10px] font-extrabold text-[#45473F]', bordure && 'border border-km-line')}
      style={{
        width: taille,
        height: taille,
        borderRadius: rayon,
        background: logo ? `#fff url("${logo}") center/${part}% no-repeat` : undefined,
      }}
    >
      {logo ? null : initialesFournisseur(nom)}
    </span>
  )
}

/* ══ PLUS D'ÉTIQUETTE « CLIENT / PROSPECT » — William, 01/10/2026 ══
   Elle se posait à la main sur un contrat de la table `contrats` : un contrat KiWee pouvait ainsi
   être marqué « prospect » par erreur. Les contrats signés sans nous ont désormais leur propre table
   (`contrats_prospects`, « Éditer l'échéance ») ; tout contrat affiché ici est signé par KiWee. */
export function BlocContratEnCours({ contrat, echeance, compteur, onVoirContrats }: {
  contrat: Contrat | null
  echeance: EcheanceCompteur
  compteur: Compteur
  onVoirContrats: () => void
}) {
  const debut = contrat?.date_debut?.slice(0, 10) ?? null
  const fin = contrat?.date_fin?.slice(0, 10) ?? echeance.date
  const fournisseur = contrat?.fournisseur_nom || compteur.fournisseur_actuel_nom || null

  if (!contrat && !fin) {
    return (
      <div className="flex flex-col gap-1 rounded-[16px] border-[1.5px] border-dashed border-[#C9D0CB] bg-white px-[22px] py-[18px]">
        <Sourcil>Contrat en cours</Sourcil>
        <div className="mt-1 text-[14px] font-bold">Aucun contrat connu</div>
        <div className="text-[12.5px] text-km-muted">Ni contrat rattaché, ni échéance déclarée sur ce compteur.</div>
      </div>
    )
  }

  const jours = joursJusqua(fin)
  const total = debut && fin ? new Date(fin).getTime() - new Date(debut).getTime() : 0
  const ecoule = debut ? Date.now() - new Date(debut).getTime() : 0
  const part = total > 0 ? Math.max(0, Math.min(100, (ecoule / total) * 100)) : 0
  const typeContrat = [contrat?.type_prix, contrat?.duree_mois ? `${contrat.duree_mois} mois` : null].filter(Boolean).join(' · ') || null
  const prouvee = echeance.nature === 'PROUVEE'

  return (
    <Carte className="flex flex-col gap-3 px-[18px] py-4">
      <Sourcil>Contrat en cours</Sourcil>

      {contrat && (
        <div className="-mt-1 text-[11.5px] leading-[1.45] text-km-muted">
          {`Signé par KiWee${contrat.recommandation_date ? ` · issu de la recommandation du ${dateFr(contrat.recommandation_date.slice(0, 10))}` : ''}`}
        </div>
      )}

      <div className="flex items-center gap-3">
        <LogoFournisseur nom={fournisseur} taille={42} rayon={12} part={74} />
        <div>
          <div className="text-[15px] font-bold">{fournisseur ?? 'Fournisseur inconnu'}</div>
          {typeContrat && <div className="text-[12px] text-km-muted">{typeContrat}</div>}
        </div>
      </div>

      {fin && (
        <div>
          <div className="flex items-baseline justify-between">
            <span className={cn('font-mono text-[22px] font-bold tracking-[-.02em]', jours != null && jours < 0 ? 'text-km-red' : 'text-km-amber')}>
              {jours != null ? libelleJours(jours) : '—'}
            </span>
            <span className="text-[12px] text-km-muted">fin le <b className="font-mono text-km-text">{dateFr(fin)}</b></span>
          </div>
          {debut && (
            <>
              <div className="mt-2 h-1.5 overflow-hidden rounded-[3px] bg-km-soft">
                <div className="h-full rounded-[3px] bg-[linear-gradient(90deg,#0D7A5F,#199B78)]" style={{ width: `${part}%` }} />
              </div>
              <div className="mt-[5px] flex justify-between font-mono text-[10px] text-km-faint">
                <span>{dateFr(debut)}</span><span>{dateFr(fin)}</span>
              </div>
            </>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center gap-2.5">
        {/* LA PASTILLE D'ÉCHÉANCE DIT CE QUI EST PROUVÉ : un contrat rattaché, ou une date déclarée. */}
        {echeance.nature !== 'ABSENTE' && (
          <span
            className="rounded-[6px] px-2 py-[3px] text-[10.5px] font-bold"
            style={prouvee ? { color: '#0D7A5F', background: '#E7F4EF' } : { color: '#A06B19', background: '#FFF3D8' }}
          >
            {prouvee ? '✓ Échéance prouvée' : 'Échéance déclarée'}
          </span>
        )}
        <span className="flex-1" />
        <button type="button" onClick={onVoirContrats} className="text-[12px] font-semibold text-km-green hover:underline">
          Historique et frise →
        </button>
      </div>
    </Carte>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// BLOC PROVISOIRE · LES TROIS CHAMPS D’AVANT
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ══ LE BLOC PROVISOIRE : LES TROIS CHAMPS D'AVANT, CÔTE À CÔTE ══
 *
 * William, 01/10/2026 : « je ne veux aucune perte de data donc déjà dans le bloc temporaire, je veux
 * que tu continues à afficher les champs actuels "Échéance", "Échéance déclarée" et "Fournisseur en
 * place". » Le temps de valider les contrats prospects, on lit côte à côte :
 *
 *   · l'Échéance — celle que la fiche retient, contrats prospects compris (`echeanceDuCompteur`) ;
 *   · l'Échéance déclarée — `compteurs.date_echeance`, telle qu'elle est en base, jamais réécrite ;
 *   · le Fournisseur en place — `compteurs.fournisseur_actuel_*`, idem.
 *
 * Toujours affiché, contrat ou pas : c'est précisément quand les deux échéances diffèrent qu'il sert.
 */
export function BlocSituationDeclaree({ compteur, echeance }: { compteur: Compteur; echeance: EcheanceDuCompteur }) {
  const declaree = compteur.date_echeance?.slice(0, 10) ?? null
  const fournisseur = compteur.fournisseur_actuel_nom ?? null
  const retenue = echeance.date?.slice(0, 10) ?? null
  const jours = joursJusqua(retenue)
  const source = echeance.source === 'CONTRAT_PROSPECT'
    ? 'Contrat prospect'
    : echeance.nature === 'PROUVEE' ? 'Contrat client' : echeance.nature === 'ESTIMEE' ? 'Échéance déclarée' : null
  const differe = Boolean(retenue && declaree && retenue !== declaree)
  return (
    <Carte className="flex flex-col gap-3 px-[18px] py-4">
      <div className="flex items-center gap-2">
        <Sourcil>Situation déclarée</Sourcil>
        <span className="flex-1" />
        <span className="rounded-full bg-km-soft px-2 py-[2px] text-[10px] font-bold text-km-muted">Provisoire</span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[.05em] text-km-faint">Échéance</div>
          <div className={cn('font-mono text-[15px] font-bold', !retenue && 'text-km-faint')}>
            {retenue ? dateFr(retenue) : echeance.indeterminee ? 'Indéterminée' : 'Non renseignée'}
          </div>
          {source && <div className="text-[11px] text-km-muted">{source}</div>}
        </div>
        {jours != null && (
          <span className={cn('font-mono text-[22px] font-bold tracking-[-.02em]', jours < 0 ? 'text-km-red' : 'text-km-amber')}>{libelleJours(jours)}</span>
        )}
      </div>
      <div className="h-px bg-km-line-soft" />
      <div>
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.05em] text-km-faint">
          Échéance déclarée
          {differe && <span className="rounded-full bg-km-amber-soft px-1.5 py-px text-[9.5px] font-bold normal-case tracking-normal text-km-amber">diffère</span>}
        </div>
        <div className={cn('font-mono text-[15px] font-bold', !declaree && 'text-km-faint')}>{declaree ? dateFr(declaree) : 'Non renseignée'}</div>
      </div>
      <div className="flex items-center gap-3">
        <LogoFournisseur nom={fournisseur} taille={36} rayon={10} part={74} />
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[.05em] text-km-faint">Fournisseur en place</div>
          <div className={cn('truncate text-[14px] font-bold', !fournisseur && 'font-semibold text-km-faint')}>{fournisseur ?? 'Non renseigné'}</div>
        </div>
      </div>
      <div className="text-[11.5px] leading-[1.45] text-km-muted">
        Les deux derniers champs sont ceux du compteur, tels qu’en base. L’échéance se modifie désormais par « Éditer l’échéance ».
      </div>
    </Carte>
  )
}
