import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Building2, Check, Loader2, Search, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Champ, EnTeteEtape, FenetreParcours, PanneauParcours, RailParcours, SAISIE, Segments,
  type EtapeParcours, type ResumeEtape,
} from '@/components/parcours/Parcours'
import { useContacts, useCreateContact, findContactDuplicates } from '@/lib/data/contacts'
import { useRechercheComptes } from '@/lib/data/comptes'
import { useAssignCompteurContact, useCompteursParCompte } from '@/lib/data/compteurs'
import { CIVILITES } from '@/lib/civilite'
import { formatPhoneFR, isValidEmail, isValidPhoneFR, toTitleCaseFR, toUpperFR } from '@/lib/textFormat'
import type { RoleContact } from '@/lib/contactRoles'
import { cn } from '@/lib/utils'
import type { Compteur, Contact } from '@/types/domain'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CRÉER UN CONTACT — LE PARCOURS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 24/09/2026 : « gardons toujours le même modèle de process (barre à gauche, pop-up) mais
 * cette fois attaquons-nous au process de création de contact. En fonction de la page depuis
 * laquelle je lance le process, il faudra lier ce nouveau contact au compte lié à l'enregistrement
 * d'origine (bien qu'il puisse être changé rapidement). Normalement tout devrait tenir sur un écran
 * avec plusieurs zones. »
 *
 *   Étape 1 · la fiche, en quatre zones, sur un seul écran
 *   Étape 2 · les compteurs du compte, à cocher
 *
 * ══ LE COMPTE ARRIVE DÉJÀ RENSEIGNÉ, ET C'EST LE CŒUR DE LA DEMANDE ══
 *
 * Un contact sans compte n'existe pas dans le modèle : `contacts.compte_id` n'est pas nul. Avant,
 * chaque écran redemandait ce compte que la fiche d'origine connaissait déjà — depuis la fiche d'un
 * compteur, l'utilisateur retapait le nom du client dont il venait de lire le PDL.
 *
 * Il reste CHANGEABLE, et cela relève d'une règle générale de Kimatch : un rattachement affiché se
 * change depuis l'écran où il s'affiche. La zone 1 le montre en grand et ouvre une recherche d'un
 * clic ; rien n'est verrouillé.
 *
 * ══ « CONTACT OU MEMBRE CS » DIT DEUX CHOSES À LA FOIS ══
 *
 * William demande un choix binaire en zone 3. Dans le modèle, il ne s'agit pas d'un champ mais de
 * deux conséquences, et c'est pour cela qu'un seul interrupteur suffit :
 *
 *   · le RÔLE écrit à la création — `CONSEIL_SYNDICAL`, ou `DECISIONNAIRE_POTENTIEL` pour un
 *     contact ordinaire. Ce dernier est exactement le rôle défini le 15/09/2026 : « un potentiel
 *     décisionnaire pour lequel nous ne disposons actuellement d'aucun périmètre ». Il ne survit
 *     pas au fait qu'il annonce — dès qu'un compteur désigne la personne responsable, la base le
 *     remplace par DECISIONNAIRE (`fn_roles_contact`). L'étape 2 le réalise souvent sur-le-champ ;
 *   · la FENTE que l'étape 2 remplit — `contact_conseil_syndical_id` pour un membre du conseil
 *     syndical, `responsable_contact_id` pour un contact. Les deux colonnes existent et restent
 *     distinctes, et une même personne ne peut pas occuper les deux sur un même compteur
 *     (contrainte du 13/09/2026).
 *
 * Les trois autres rôles ne se saisissent plus depuis le 14/09/2026 : la base les déduit des faits.
 * Ce parcours ne les propose donc pas — il ne ferait qu'annoncer ce que la base va corriger.
 */

const ETAPES: EtapeParcours[] = [
  { cle: 'fiche', libelle: 'Le contact' },
  { cle: 'compteurs', libelle: 'Ses compteurs' },
]

export interface CompteDuParcours {
  id: string
  nom: string
}

export function ParcoursCreationContact({ compte: compteInitial, type, onFermer, onCree }: {
  /** Le compte de l'enregistrement d'où l'on est parti. Absent depuis le menu « Créer » global. */
  compte?: CompteDuParcours | null
  /** Le type de départ, quand l'écran appelant en attend un précis. Reste modifiable. */
  type?: 'contact' | 'membreCS'
  onFermer: () => void
  /** Appelé avec le contact créé, pour l'écran qui attendait de le choisir. */
  onCree?: (contact: Contact) => void
}) {
  const navigate = useNavigate()
  const creerContact = useCreateContact()
  const assigner = useAssignCompteurContact()
  const { data: tousLesContacts } = useContacts()

  const [etape, setEtape] = useState<'fiche' | 'compteurs'>('fiche')
  const [compte, setCompte] = useState<CompteDuParcours | null>(compteInitial ?? null)
  const [chercheCompte, setChercheCompte] = useState(!compteInitial)
  const [termeCompte, setTermeCompte] = useState('')

  /* « M. » : la forme que la base écrit depuis la migration 20260915110000. Proposer autre chose
     rendrait le bouton inactif dès la relecture du contact. */
  const [civilite, setCivilite] = useState<string>(CIVILITES[0])
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [fonction, setFonction] = useState('')
  const [membreCS, setMembreCS] = useState(type === 'membreCS')
  const [email, setEmail] = useState('')
  const [emailTouche, setEmailTouche] = useState(false)
  const [telephone, setTelephone] = useState('')
  const [mobile, setMobile] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  const [contactCree, setContactCree] = useState<Contact | null>(null)
  const [compteursChoisis, setCompteursChoisis] = useState<string[]>([])

  /* La recherche n'est lancée que quand elle est ouverte : le cas courant, compte déjà connu, ne
     doit coûter aucune requête. */
  const recherche = useRechercheComptes(chercheCompte ? termeCompte : '')
  const { data: compteursDuCompte, isLoading: compteursEnCours } = useCompteursParCompte(compte?.id)

  /* ══ LA VALIDATION, CHAMP PAR CHAMP ══
     L'email se tait tant qu'on le saisit et parle au premier départ du curseur : afficher
     « invalide » dès la première lettre tapée accuse quelqu'un qui n'a pas fini d'écrire. Les
     téléphones, eux, se jugent sur la valeur BRUTE — les juger sur une version déjà normalisée
     n'afficherait jamais l'erreur. */
  const emailErreur = emailTouche && email && !isValidEmail(email) ? "Cette adresse n'est pas valide" : null
  const telErreur = telephone && !isValidPhoneFR(telephone) ? 'Format attendu : +33…' : null
  const mobErreur = mobile && !isValidPhoneFR(mobile) ? 'Format attendu : +33…' : null
  const peutValider = Boolean(compte) && nom.trim().length > 0 && !emailErreur && !telErreur && !mobErreur

  /* Les doublons ne se cherchent qu'à partir d'un signal fiable — un nom complet, un email ou un
     téléphone valides. Sans ce garde-fou, le bandeau clignote sur chaque frappe. */
  const doublons = useMemo(() => {
    const signal =
      (prenom.trim().length >= 2 && nom.trim().length >= 2) ||
      (!!email && isValidEmail(email)) ||
      (!!telephone && isValidPhoneFR(formatPhoneFR(telephone))) ||
      (!!mobile && isValidPhoneFR(formatPhoneFR(mobile)))
    if (!tousLesContacts || !signal) return []
    return findContactDuplicates(tousLesContacts, {
      prenom,
      nom,
      email: email || null,
      telephone: telephone ? formatPhoneFR(telephone) : null,
      telephoneMobile: mobile ? formatPhoneFR(mobile) : null,
    })
  }, [tousLesContacts, prenom, nom, email, telephone, mobile])

  /* Le compte peut arriver après coup : la fiche d'origine met parfois une requête à le connaître. */
  useEffect(() => {
    if (compteInitial && !compte) {
      setCompte(compteInitial)
      setChercheCompte(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compteInitial?.id])

  const roles: RoleContact[] = membreCS ? ['CONSEIL_SYNDICAL'] : ['DECISIONNAIRE_POTENTIEL']

  async function creer() {
    if (!compte || !peutValider) return
    setErreur(null)
    try {
      const resultat = await creerContact.mutateAsync({
        compte_id: compte.id,
        compte_nom: compte.nom,
        civilite: civilite || null,
        prenom: toTitleCaseFR(prenom),
        nom: toUpperFR(nom),
        fonction: fonction.trim() || null,
        telephone: telephone || null,
        telephone_mobile: mobile || null,
        email: email || null,
        roles,
        site_ids: [],
        sites: [],
      })
      if (!resultat.persisted) {
        setErreur("Le contact n'a pas pu être enregistré. Vérifiez votre connexion et réessayez.")
        return
      }
      setContactCree(resultat.contact)
      onCree?.(resultat.contact)
      setEtape('compteurs')
    } catch (e) {
      /* Aucun échec muet : une création qui échoue sans un mot est le défaut le plus coûteux de
         cet écran — l'utilisateur ressaisit tout en croyant avoir mal cliqué. */
      setErreur(e instanceof Error ? e.message : "La création a échoué.")
    }
  }

  async function terminer() {
    if (contactCree && compteursChoisis.length > 0) {
      try {
        await assigner.mutateAsync({
          compteurIds: compteursChoisis,
          contactId: contactCree.id,
          field: membreCS ? 'contact_conseil_syndical_id' : 'responsable_contact_id',
        })
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Les compteurs n'ont pas pu être assignés.")
        return
      }
    }
    fermer(true)
  }

  function fermer(versLaFiche = false) {
    onFermer()
    /* On n'emmène personne sur la fiche quand un écran attendait ce contact pour le choisir : il
       perdrait le formulaire qu'il était en train de remplir. */
    if (versLaFiche && contactCree && !onCree) navigate(`/contacts/${contactCree.id}`)
  }

  const nomAffiche = [prenom.trim(), nom.trim().toUpperCase()].filter(Boolean).join(' ')

  const resumes: Record<string, ResumeEtape | undefined> = {
    fiche: contactCree
      ? { lignes: [nomAffiche, membreCS ? 'Conseil syndical' : 'Contact', compte?.nom ?? ''].filter(Boolean) }
      : undefined,
    compteurs: compteursChoisis.length > 0
      ? { lignes: [`${compteursChoisis.length} compteur${compteursChoisis.length > 1 ? 's' : ''} assigné${compteursChoisis.length > 1 ? 's' : ''}`] }
      : undefined,
  }

  return (
    <FenetreParcours onFermer={() => fermer()}>
      <RailParcours
        titre={nomAffiche || 'Nouveau contact'}
        reference={compte?.nom ?? null}
        etapes={ETAPES}
        courante={etape}
        sousTitre={etape === 'fiche' ? 'Qui est-ce ?' : 'Ce dont il répond'}
        resumes={resumes}
        note={
          etape === 'fiche'
            ? { titre: 'Rien n’est écrit avant la validation', texte: 'Vous pouvez fermer sans rien laisser derrière.' }
            : { titre: 'Le contact existe', texte: 'Les compteurs sont facultatifs — vous pouvez vous arrêter là.' }
        }
        onFermer={() => fermer()}
      />

      <PanneauParcours>
        {etape === 'fiche' ? (
          <>
            <EnTeteEtape numero={1} total={2} titre="Le contact" />

            <div className="flex min-h-0 flex-1 flex-col gap-[16px] overflow-y-auto pr-1">
              {/* ════════ ZONE 1 · LE COMPTE LIÉ ════════ */}
              <ZoneCompte
                compte={compte}
                ouverte={chercheCompte}
                terme={termeCompte}
                resultats={recherche.data ?? []}
                enCours={recherche.isFetching}
                onOuvrir={() => { setChercheCompte(true); setTermeCompte('') }}
                onTerme={setTermeCompte}
                onChoisir={(c) => { setCompte(c); setChercheCompte(false); setTermeCompte('') }}
                onAnnuler={compte ? () => { setChercheCompte(false); setTermeCompte('') } : undefined}
              />

              {/* ════════ ZONE 2 · CIVILITÉ, PRÉNOM, NOM ════════ */}
              <div className="grid grid-cols-[132px_1fr_1fr] gap-[12px]">
                <Champ intitule="Civilité">
                  <Segments
                    obligatoire
                    valeur={civilite}
                    onChoisir={setCivilite}
                    options={CIVILITES.map((c) => ({ valeur: c, libelle: c }))}
                  />
                </Champ>
                <Champ intitule="Prénom">
                  <input
                    className={SAISIE}
                    value={prenom}
                    onChange={(e) => setPrenom(e.target.value)}
                    /* La mise en forme se fait au départ du curseur, pas à la frappe : corriger
                       chaque lettre pendant qu'on écrit déplace le curseur et rend la saisie
                       inutilisable sur les noms composés. La base applique la même règle de son
                       côté (`fn_formater_identite_contact`) ; l'écran ne fait que la montrer. */
                    onBlur={() => setPrenom((v) => toTitleCaseFR(v))}
                    placeholder="Jean-Pierre"
                  />
                </Champ>
                <Champ intitule="Nom" requis>
                  <input
                    className={SAISIE}
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    onBlur={() => setNom((v) => toUpperFR(v))}
                    placeholder="DUPONT"
                  />
                </Champ>
              </div>

              {/* ════════ ZONE 3 · FONCTION ET TYPE ════════ */}
              <div className="grid grid-cols-[1fr_300px] gap-[12px]">
                <Champ intitule="Fonction">
                  <input
                    className={SAISIE}
                    value={fonction}
                    onChange={(e) => setFonction(e.target.value)}
                    placeholder="Gestionnaire de copropriété"
                  />
                </Champ>
                <Champ intitule="Type de contact">
                  <Segments
                    obligatoire
                    valeur={membreCS ? 'cs' : 'contact'}
                    onChoisir={(v) => setMembreCS(v === 'cs')}
                    options={[
                      { valeur: 'contact', libelle: 'Contact', titre: 'Interlocuteur du cabinet — il portera les compteurs comme responsable' },
                      { valeur: 'cs', libelle: 'Membre CS', titre: 'Conseil syndical — il sera posé en relais sur les compteurs' },
                    ]}
                  />
                </Champ>
              </div>

              {/* ════════ ZONE 4 · LES COORDONNÉES ════════ */}
              <div className="grid grid-cols-[1.5fr_1fr_1fr] gap-[12px]">
                <Champ intitule="Email">
                  <input
                    type="email"
                    className={cn(SAISIE, emailErreur && 'border-km-red focus:border-km-red')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setEmailTouche(true)}
                    placeholder="jean.dupont@cabinet.fr"
                  />
                  {emailErreur && <span className="text-[11px] text-km-red">{emailErreur}</span>}
                </Champ>
                <Champ intitule="Téléphone">
                  <input
                    className={cn(SAISIE, telErreur && 'border-km-red focus:border-km-red')}
                    value={telephone}
                    onChange={(e) => setTelephone(e.target.value)}
                    onBlur={() => setTelephone((v) => (v ? formatPhoneFR(v) : v))}
                    placeholder="01 23 45 67 89"
                  />
                  {telErreur && <span className="text-[11px] text-km-red">{telErreur}</span>}
                </Champ>
                <Champ intitule="Mobile">
                  <input
                    className={cn(SAISIE, mobErreur && 'border-km-red focus:border-km-red')}
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    onBlur={() => setMobile((v) => (v ? formatPhoneFR(v) : v))}
                    placeholder="06 12 34 56 78"
                  />
                  {mobErreur && <span className="text-[11px] text-km-red">{mobErreur}</span>}
                </Champ>
              </div>

              {/* LES DOUBLONS S'ANNONCENT, ILS N'INTERDISENT PAS. Deux gestionnaires peuvent
                  partager un standard, et refuser la création ferait perdre la saisie. */}
              {doublons.length > 0 && (
                <div className="flex items-start gap-[9px] rounded-[10px] border border-amber-200 bg-amber-50 px-[13px] py-[10px]">
                  <AlertTriangle className="mt-px h-[15px] w-[15px] flex-none text-amber-600" />
                  <p className="text-[12px] leading-snug text-amber-900">
                    <strong className="font-semibold">
                      {doublons.length === 1 ? 'Un contact ressemble à celui-ci' : `${doublons.length} contacts ressemblent à celui-ci`}
                    </strong>{' '}
                    — {doublons.slice(0, 3).map((d) => `${d.contact.prenom ?? ''} ${d.contact.nom}`.trim()).join(', ')}
                    {doublons.length > 3 && `, et ${doublons.length - 3} autre${doublons.length - 3 > 1 ? 's' : ''}`}.
                    Vous pouvez créer quand même.
                  </p>
                </div>
              )}

              {erreur && (
                <p className="rounded-[10px] border border-km-red-line bg-km-red-soft px-[13px] py-[9px] text-[12.5px] text-red-700">
                  {erreur}
                </p>
              )}
            </div>

            <div className="mt-[14px] flex items-center gap-3 border-t border-km-line-soft pt-4">
              <span className="text-[11.5px] text-km-faint">
                {compte ? 'Le contact sera rattaché à ce compte.' : 'Choisissez d’abord le compte.'}
              </span>
              <span className="flex-1" />
              <Button variant="ghost" onClick={() => fermer()}>Annuler</Button>
              <Button disabled={!peutValider || creerContact.isPending} onClick={() => void creer()}>
                {creerContact.isPending
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Création…</>
                  : 'Créer le contact'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <EnTeteEtape numero={2} total={2} titre={`Les compteurs de ${compte?.nom ?? 'ce compte'}`} />
            <p className="mb-[16px] text-[13px] leading-snug text-km-muted">
              Cochez ceux dont {nomAffiche || 'ce contact'} répond
              {membreCS ? ' au titre du conseil syndical' : ''}. Chaque compteur coché
              {membreCS ? ' le prendra pour relais' : ' changera de responsable'} — c’est facultatif,
              et cela se corrige ensuite depuis la fiche du compteur.
            </p>

            <ListeCompteurs
              compteurs={compteursDuCompte ?? []}
              enCours={compteursEnCours}
              fente={membreCS ? 'conseilSyndical' : 'responsable'}
              choisis={compteursChoisis}
              onBasculer={(id) =>
                setCompteursChoisis((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
              }
              onTous={() =>
                setCompteursChoisis((p) =>
                  p.length === (compteursDuCompte ?? []).length ? [] : (compteursDuCompte ?? []).map((c) => c.id),
                )
              }
            />

            {erreur && (
              <p className="mt-[12px] rounded-[10px] border border-km-red-line bg-km-red-soft px-[13px] py-[9px] text-[12.5px] text-red-700">
                {erreur}
              </p>
            )}

            <div className="mt-[14px] flex items-center gap-3 border-t border-km-line-soft pt-4">
              <span className="text-[11.5px] text-km-faint">
                {compteursChoisis.length === 0
                  ? 'Aucun compteur sélectionné — le contact existe déjà.'
                  : `${compteursChoisis.length} compteur${compteursChoisis.length > 1 ? 's' : ''} sélectionné${compteursChoisis.length > 1 ? 's' : ''}.`}
              </span>
              <span className="flex-1" />
              <Button disabled={assigner.isPending} onClick={() => void terminer()}>
                {assigner.isPending
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Assignation…</>
                  : compteursChoisis.length > 0 ? 'Assigner et terminer' : 'Terminer'}
              </Button>
            </div>
          </>
        )}
      </PanneauParcours>
    </FenetreParcours>
  )
}

/** ZONE 1 — le compte lié, montré en grand, changeable d'un clic. */
function ZoneCompte({ compte, ouverte, terme, resultats, enCours, onOuvrir, onTerme, onChoisir, onAnnuler }: {
  compte: CompteDuParcours | null
  ouverte: boolean
  terme: string
  resultats: { id: string; nom: string; ville: string | null; segment: string | null }[]
  enCours: boolean
  onOuvrir: () => void
  onTerme: (v: string) => void
  onChoisir: (c: CompteDuParcours) => void
  onAnnuler?: () => void
}) {
  if (!ouverte && compte) {
    return (
      <div className="flex items-center gap-[12px] rounded-[12px] border border-km-line bg-km-soft px-[15px] py-[12px]">
        <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-white">
          <Building2 className="h-[17px] w-[17px] text-km-green" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint">
            Compte lié
          </span>
          <span className="block truncate text-[14.5px] font-semibold text-km-text">{compte.nom}</span>
        </span>
        <button
          type="button"
          onClick={onOuvrir}
          className="flex-none rounded-[8px] border border-km-line bg-white px-[11px] py-[6px] text-[12px] font-semibold text-km-muted transition-colors hover:border-km-green hover:text-km-green"
        >
          Changer
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-[12px] border border-km-line bg-km-soft p-[12px]">
      <div className="mb-[8px] flex items-center gap-2">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint">
          Compte lié <span className="text-km-muted">*</span>
        </span>
        <span className="flex-1" />
        {onAnnuler && (
          <button type="button" onClick={onAnnuler} className="text-[11.5px] font-semibold text-km-muted hover:text-km-text">
            Annuler
          </button>
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-[11px] top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-km-faint" />
        <input
          autoFocus
          className={cn(SAISIE, 'pl-[34px]')}
          value={terme}
          onChange={(e) => onTerme(e.target.value)}
          placeholder="Chercher un compte par son nom…"
        />
        {enCours && <Loader2 className="absolute right-[11px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 animate-spin text-km-faint" />}
      </div>

      {terme.trim().length > 0 && terme.trim().length < 3 && (
        <p className="mt-[8px] text-[11.5px] text-km-faint">Encore un caractère ou deux.</p>
      )}

      {terme.trim().length >= 3 && (
        <div className="mt-[8px] max-h-[176px] overflow-y-auto rounded-[9px] border border-km-line bg-white">
          {resultats.length === 0 && !enCours && (
            <p className="px-[12px] py-[10px] text-[12px] text-km-faint">Aucun compte à ce nom.</p>
          )}
          {resultats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onChoisir({ id: c.id, nom: c.nom })}
              className="flex w-full items-center gap-[9px] px-[12px] py-[8px] text-left transition-colors hover:bg-km-green-soft"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-km-text">{c.nom}</span>
                {(c.ville || c.segment) && (
                  <span className="block truncate text-[11px] text-km-faint">
                    {[c.segment, c.ville].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** ÉTAPE 2 — les compteurs du compte, à cocher. */
function ListeCompteurs({ compteurs, enCours, fente, choisis, onBasculer, onTous }: {
  compteurs: Compteur[]
  enCours: boolean
  /** Celle des deux fentes qu'on s'apprête à remplir : c'est elle qu'il faut dire occupée. */
  fente: 'responsable' | 'conseilSyndical'
  choisis: string[]
  onBasculer: (id: string) => void
  onTous: () => void
}) {
  if (enCours) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-km-faint">
        <Loader2 className="h-[14px] w-[14px] animate-spin" /> Lecture des compteurs…
      </p>
    )
  }

  if (compteurs.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-[10px] rounded-[12px] border border-dashed border-km-line py-[40px]">
        <Zap className="h-[22px] w-[22px] text-km-faint" />
        <p className="text-[13px] text-km-muted">Ce compte n’a encore aucun compteur.</p>
        <p className="text-[11.5px] text-km-faint">Le contact est créé — vous pourrez l’assigner plus tard.</p>
      </div>
    )
  }

  const tousChoisis = choisis.length === compteurs.length

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-[8px] flex items-center">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-km-faint">
          {compteurs.length} compteur{compteurs.length > 1 ? 's' : ''}
        </span>
        <span className="flex-1" />
        <button type="button" onClick={onTous} className="text-[11.5px] font-semibold text-km-muted hover:text-km-green">
          {tousChoisis ? 'Tout décocher' : 'Tout cocher'}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-[11px] border border-km-line">
        {compteurs.map((c) => {
          const choisi = choisis.includes(c.id)
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onBasculer(c.id)}
              className={cn(
                'flex w-full items-center gap-[11px] border-b border-km-line-soft px-[13px] py-[10px] text-left transition-colors last:border-b-0',
                choisi ? 'bg-km-green-soft' : 'hover:bg-km-soft',
              )}
            >
              <span
                className={cn(
                  'flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border transition-colors',
                  choisi ? 'border-km-green bg-km-green' : 'border-km-line bg-white',
                )}
              >
                {choisi && <Check className="h-[12px] w-[12px] text-white" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-km-text">
                  {c.libelle_site || c.site_nom || 'Compteur'}
                </span>
                <span className="block truncate font-mono text-[11px] text-km-faint">{c.numero_pdl}</span>
              </span>
              {/* UN RESPONSABLE DÉJÀ EN PLACE SE DIT AVANT LE CLIC, pas après : l'assignation
                  REMPLACE, elle n'ajoute pas, et personne ne doit découvrir après coup qu'il a
                  retiré un collègue d'un compteur. */}
              {/* ON REGARDE LA FENTE QU'ON VA REMPLIR, pas l'autre : un compteur qui a déjà un
                  responsable n'a rien d'occupé du point de vue du conseil syndical, et l'annoncer
                  ferait hésiter devant un geste parfaitement sûr. */}
              {(fente === 'conseilSyndical' ? c.contact_conseil_syndical_id : c.responsable_contact_id) && !choisi && (
                <span className="flex-none text-[10.5px] font-semibold uppercase tracking-[0.05em] text-km-faint">
                  déjà attribué
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
