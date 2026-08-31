import { useEffect, useMemo, useState } from 'react'
import { Building, Loader2, Search, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FormField, Input, Select, Textarea } from '@/components/ui/form'
import { ChoixParRecherche } from '@/components/ui/choix-recherche'
import { useComptes, useCreateCompte } from '@/lib/data/comptes'
import { useContacts, useCreateContact } from '@/lib/data/contacts'
import { useReferenceTable } from '@/lib/data/referenceTables'
import { searchCompanies, type CompanyResult } from '@/lib/companyDirectory'
import { cn } from '@/lib/utils'
import type { Piste, TypeCompte } from '@/types/domain'

/**
 * La conversion d'une piste en opportunité.
 *
 * DEUX CHOSES SONT EXIGÉES, et ce sont celles de Michel (23/08/2026) : « pour lancer une opportunité
 * il nous faut au minimum un signal et un contact ». Le signal, parce qu'il justifie d'ouvrir une
 * affaire maintenant ; le contact, parce qu'une piste EST un contact validé — la convertir sans le
 * rattacher donnerait une opportunité affichant « contact manquant » juste après.
 *
 * ET LE CONTACT PEUT ÊTRE CRÉÉ ICI. Naoëlle, 23/08/2026, à la question « la conversion doit-elle
 * créer le compte et le contact depuis la piste ? » : oui. La piste porte ces informations en texte
 * libre (société, nom, courriel, téléphone) ; elles deviennent de vrais objets du patrimoine au
 * moment où l'affaire s'ouvre, ce qui est exactement le passage de l'objet actif à l'objet passif du
 * mémo de Michel.
 *
 * LE SIREN N'EST PAS NÉGOCIABLE, et ce n'est pas moi qui l'invente : `useCreateCompte` refuse un
 * compte sans SIREN, sauf pour un syndic non professionnel — même règle que Tools, « un SIRET
 * identifie une entité légale unique ». On passe donc par la recherche d'entreprise INSEE
 * (`searchCompanies`, l'API publique déjà utilisée par l'écran Nouveau compte) plutôt que de
 * demander un SIREN de mémoire ou, pire, de contourner le contrôle.
 *
 * LE RÔLE EST DÉDUIT, POUR UNE FOIS À BON DROIT : la cinquième validation de la piste est
 * « responsable ou décisionnaire des contrats d'énergie ». Un contact créé depuis une piste
 * qualifiée est donc Décisionnaire, et `contact_principal` en découle côté données.
 */

type Segment = 'Syndic professionnel' | 'Syndic non professionnel' | 'Entreprise' | 'Partenaire' | 'Courtier' | 'Fournisseur'

// Reprise de `CompteCreate.tsx` : le segment est stocké tel quel, le type de compte s'en déduit.
const SEGMENT_TO_TYPE_COMPTE: Record<Segment, TypeCompte> = {
  'Syndic professionnel': 'client',
  'Syndic non professionnel': 'client',
  Entreprise: 'client',
  Courtier: 'client',
  Partenaire: 'partenaire',
  Fournisseur: 'fournisseur',
}

const SIGNAUX_EXEMPLES = [
  'Échéance de contrat à moins de 2 ans',
  'Demande explicite du client',
  'Marché favorable',
  "Potentiel d'optimisation TURPE",
  'Autre besoin commercial',
]

/** « Jean Marie DUPONT » → prénom « Jean Marie », nom « DUPONT ». Le dernier mot fait le nom. */
function separerNom(entier: string | null): { prenom: string; nom: string } {
  const mots = (entier ?? '').trim().split(/\s+/).filter(Boolean)
  if (mots.length === 0) return { prenom: '', nom: '' }
  if (mots.length === 1) return { prenom: '', nom: mots[0] }
  return { prenom: mots.slice(0, -1).join(' '), nom: mots[mots.length - 1] }
}

export function DialogConversionPiste({ piste, onFermer, onValide }: {
  piste: Piste
  onFermer: () => void
  /** Le signal, puis le contact et le compte finalement retenus (créés ou rattachés). */
  onValide: (signal: string, contactId: string, compteId: string | null) => void
}) {
  const { data: contacts } = useContacts()
  const { data: comptes } = useComptes()
  const { data: typesComptesRef } = useReferenceTable('types_comptes')
  const creerCompte = useCreateCompte()
  const creerContact = useCreateContact()

  const [signal, setSignal] = useState('')
  // « rattacher » : le contact existe déjà dans Kimatch. « creer » : on le fabrique depuis la piste.
  const [mode, setMode] = useState<'rattacher' | 'creer'>(piste.contact_id ? 'rattacher' : 'creer')
  const [contactId, setContactId] = useState(piste.contact_id ?? '')
  const [compteId, setCompteId] = useState(piste.compte_id ?? '')

  // Le compte, quand il faut le créer : recherche INSEE, ou rattachement d'un compte existant.
  const [modeCompte, setModeCompte] = useState<'rattacher' | 'creer'>(piste.compte_id ? 'rattacher' : 'creer')
  const [segment, setSegment] = useState<Segment>('Entreprise')
  const [recherche, setRecherche] = useState(piste.societe ?? '')
  const [resultats, setResultats] = useState<CompanyResult[]>([])
  const [chercheEnCours, setChercheEnCours] = useState(false)
  const [entreprise, setEntreprise] = useState<CompanyResult | null>(null)

  const nomSepare = useMemo(() => separerNom(piste.contact_nom), [piste.contact_nom])
  const [prenom, setPrenom] = useState(nomSepare.prenom)
  const [nom, setNom] = useState(nomSepare.nom)
  const [email, setEmail] = useState(piste.email ?? '')
  const [telephone, setTelephone] = useState(piste.telephone ?? '')

  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  // La recherche d'entreprise part du nom porté par la piste, et se relance à la frappe. Le
  // `AbortController` évite qu'une réponse lente écrase une plus récente.
  useEffect(() => {
    if (mode !== 'creer' || modeCompte !== 'creer') return
    const q = recherche.trim()
    if (q.length < 3) { setResultats([]); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setChercheEnCours(true)
      try {
        setResultats(await searchCompanies(q, ctrl.signal))
      } catch {
        // Abandon volontaire ou API indisponible : la liste reste vide, le message le dira.
      } finally {
        setChercheEnCours(false)
      }
    }, 350)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [recherche, mode, modeCompte])

  const syndicBenevole = segment === 'Syndic non professionnel'
  // Un syndic non professionnel n'a pas de SIREN : le compte se crée sur son seul nom, comme dans
  // l'écran Nouveau compte.
  const compteCreable = modeCompte === 'creer'
    ? (syndicBenevole ? Boolean(piste.societe || recherche.trim()) : Boolean(entreprise))
    : Boolean(compteId)

  const contactCreable = Boolean(nom.trim()) && compteCreable
  const pret = signal.trim().length > 0 && (mode === 'rattacher' ? Boolean(contactId) : contactCreable)

  async function valider() {
    setErreur(null)
    if (mode === 'rattacher') {
      onValide(signal.trim(), contactId, compteId || null)
      return
    }

    setEnCours(true)
    try {
      // 1. Le compte, s'il n'existe pas encore.
      let idCompte = compteId
      let nomCompte = comptes?.find((c) => c.id === idCompte)?.nom ?? ''
      if (modeCompte === 'creer') {
        const typeCompte = SEGMENT_TO_TYPE_COMPTE[segment]
        const typeCompteId = (typesComptesRef ?? []).find((t) => t.code === typeCompte.toUpperCase())?.id ?? null
        const resultat = await creerCompte.mutateAsync({
          segment,
          typeCompte,
          typeCompteId,
          nom: entreprise ? (entreprise.raisonSociale || entreprise.nomComplet) : (piste.societe || recherche.trim()),
          rue: entreprise?.street ?? null,
          codePostal: entreprise?.postalCode ?? null,
          ville: entreprise?.city ?? null,
          siret: entreprise?.siret ?? null,
          siren: entreprise?.siren ?? null,
          codeNaf: entreprise?.codeApe ?? null,
          libelleApe: entreprise?.libelleApe ?? null,
        })
        idCompte = resultat.compte.id
        nomCompte = resultat.compte.nom
      }

      // 2. Le contact, rattaché à ce compte.
      const resultatContact = await creerContact.mutateAsync({
        compte_id: idCompte,
        compte_nom: nomCompte,
        civilite: null,
        prenom: prenom.trim(),
        nom: nom.trim(),
        fonction: null,
        telephone: null,
        telephone_mobile: telephone.trim() || null,
        email: email.trim() || null,
        // La cinquième validation de la piste est « responsable ou décisionnaire des contrats
        // d'énergie » : le rôle n'est donc pas deviné, il est déjà établi.
        role: 'Décisionnaire',
        site_ids: [],
        sites: [],
      })

      onValide(signal.trim(), resultatContact.contact.id, idCompte)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Création impossible.')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onFermer}
      title="Convertir cette piste en opportunité"
      description="Un signal et un contact suffisent. Le site, le mandat et l'accord se rassemblent ensuite : c'est le travail de l'opportunité."
      className="max-w-xl"
    >
      <div className="space-y-3">
        {/* ── LE SIGNAL ── */}
        <FormField label="Signal positif">
          <div className="flex flex-wrap gap-1.5">
            {SIGNAUX_EXEMPLES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setSignal(e)}
                className={cn(
                  'rounded-lg border px-2.5 py-1 text-xs transition-colors',
                  signal === e
                    ? 'border-km-green bg-kiwi-50 font-semibold text-km-green'
                    : 'border-km-line text-km-muted hover:bg-km-bg',
                )}
              >
                {e}
              </button>
            ))}
          </div>
          <Textarea
            value={signal}
            onChange={(e) => setSignal(e.target.value)}
            rows={2}
            placeholder="…ou décrire ce qui justifie d'ouvrir une affaire maintenant"
            className="mt-2"
          />
        </FormField>

        {/* ── LE CONTACT ── */}
        <div className="rounded-xl border border-km-line bg-km-bg/40 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <p className="mr-1 text-[10px] font-bold uppercase tracking-wide text-km-faint">Le contact</p>
            {([
              { cle: 'creer' as const, titre: 'Le créer depuis la piste' },
              { cle: 'rattacher' as const, titre: 'Rattacher un contact existant' },
            ]).map((o) => (
              <button
                key={o.cle}
                type="button"
                onClick={() => setMode(o.cle)}
                className={cn(
                  'rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  mode === o.cle ? 'border-km-green bg-white text-km-green' : 'border-transparent text-km-muted hover:bg-white',
                )}
              >
                {o.titre}
              </button>
            ))}
          </div>

          {mode === 'rattacher' ? (
            <ChoixParRecherche
              items={contacts ?? []}
              valeur={contactId}
              onChoisir={(c) => { setContactId(c?.id ?? ''); setCompteId(c?.compte_id ?? '') }}
              placeholder={piste.contact_nom ? `Chercher « ${piste.contact_nom} »…` : 'Nom, compte ou courriel…'}
              principal={(c) => `${c.prenom} ${c.nom}`}
              secondaire={(c) => c.compte_nom || null}
              filtre={(c, q) => [c.prenom, c.nom, c.compte_nom, c.email].some((v) => (v ?? '').toLowerCase().includes(q))}
              aucun="Aucun contact — créez-le depuis la piste, l'autre onglet le fait."
              totalLibelle={`${(contacts ?? []).length} contacts`}
            />
          ) : (
            <div className="space-y-3">
              {/* Le compte d'abord : un contact appartient à un compte, on ne peut pas le créer sans. */}
              <div>
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <p className="mr-1 text-[10px] font-bold uppercase tracking-wide text-km-faint">Son compte</p>
                  {([
                    { cle: 'creer' as const, titre: 'Le créer' },
                    { cle: 'rattacher' as const, titre: 'En rattacher un existant' },
                  ]).map((o) => (
                    <button
                      key={o.cle}
                      type="button"
                      onClick={() => setModeCompte(o.cle)}
                      className={cn(
                        'rounded-lg border px-2 py-0.5 text-[11px] font-semibold transition-colors',
                        modeCompte === o.cle ? 'border-km-green bg-white text-km-green' : 'border-transparent text-km-muted hover:bg-white',
                      )}
                    >
                      {o.titre}
                    </button>
                  ))}
                </div>

                {modeCompte === 'rattacher' ? (
                  <ChoixParRecherche
                    items={comptes ?? []}
                    valeur={compteId}
                    onChoisir={(c) => setCompteId(c?.id ?? '')}
                    placeholder="Nom du compte…"
                    principal={(c) => c.nom}
                    secondaire={(c) => c.ville || null}
                    filtre={(c, q) => c.nom.toLowerCase().includes(q)}
                    aucun="Aucun compte trouvé."
                    totalLibelle={`${(comptes ?? []).length} comptes`}
                  />
                ) : (
                  <div className="space-y-2">
                    <Select value={segment} onChange={(e) => { setSegment(e.target.value as Segment); setEntreprise(null) }}>
                      <option value="Entreprise">Entreprise</option>
                      <option value="Syndic professionnel">Syndic professionnel</option>
                      <option value="Syndic non professionnel">Syndic non professionnel</option>
                      <option value="Courtier">Courtier</option>
                      <option value="Partenaire">Partenaire</option>
                      <option value="Fournisseur">Fournisseur</option>
                    </Select>

                    {syndicBenevole ? (
                      // Pas de SIREN pour un syndic bénévole : le nom suffit, comme dans Nouveau compte.
                      <Input
                        value={recherche}
                        onChange={(e) => setRecherche(e.target.value)}
                        placeholder="Nom de la copropriété…"
                      />
                    ) : entreprise ? (
                      <div className="flex items-start gap-2 rounded-lg border border-kiwi-200 bg-kiwi-50/60 px-3 py-2">
                        <Building className="mt-0.5 h-3.5 w-3.5 shrink-0 text-km-green" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-km-text">
                            {entreprise.raisonSociale || entreprise.nomComplet}
                          </p>
                          <p className="truncate text-[11px] text-km-muted">
                            SIREN {entreprise.siren}
                            {entreprise.city && ` · ${entreprise.city}`}
                            {entreprise.libelleApe && ` · ${entreprise.libelleApe}`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEntreprise(null)}
                          className="shrink-0 text-xs font-semibold text-km-green hover:underline"
                        >
                          changer
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-km-faint" />
                          <Input
                            value={recherche}
                            onChange={(e) => setRecherche(e.target.value)}
                            placeholder="Raison sociale ou SIREN…"
                            className="pl-8"
                          />
                          {chercheEnCours && (
                            <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-km-faint" />
                          )}
                        </div>
                        {recherche.trim().length >= 3 && (
                          <div className="max-h-[152px] overflow-y-auto rounded-lg border border-km-line bg-white">
                            {resultats.map((r) => (
                              <button
                                key={r.siret ?? r.siren}
                                type="button"
                                onClick={() => setEntreprise(r)}
                                className="flex w-full items-start gap-2 border-b border-navy-50 px-3 py-2 text-left last:border-b-0 hover:bg-km-bg/60"
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-semibold text-km-text">
                                    {r.raisonSociale || r.nomComplet}
                                  </span>
                                  <span className="block truncate text-[10.5px] text-km-faint">
                                    SIREN {r.siren}{r.city && ` · ${r.city}`}
                                  </span>
                                </span>
                              </button>
                            ))}
                            {!chercheEnCours && resultats.length === 0 && (
                              <p className="p-3 text-center text-xs text-km-faint">
                                Aucune entreprise trouvée. Un compte sans SIREN n'est possible que
                                pour un syndic non professionnel.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Puis le contact lui-même, pré-rempli avec ce que la piste porte. */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <FormField label="Prénom">
                  <Input value={prenom} onChange={(e) => setPrenom(e.target.value)} />
                </FormField>
                <FormField label="Nom">
                  <Input value={nom} onChange={(e) => setNom(e.target.value)} />
                </FormField>
                <FormField label="Courriel">
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </FormField>
                <FormField label="Portable">
                  <Input value={telephone} onChange={(e) => setTelephone(e.target.value)} />
                </FormField>
              </div>
              <p className="text-[10.5px] leading-snug text-km-faint">
                Créé comme <strong className="font-semibold text-km-muted">Décisionnaire</strong> : la
                piste a été validée « responsable des contrats d'énergie ».
              </p>
            </div>
          )}
        </div>

        {erreur && <p className="rounded-lg border border-red-200 bg-km-red-soft px-3 py-2 text-xs text-red-700">{erreur}</p>}

        {!pret && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-km-amber">
            Il manque {!signal.trim() && 'le signal'}
            {!signal.trim() && (mode === 'rattacher' ? !contactId : !contactCreable) && ' et '}
            {(mode === 'rattacher' ? !contactId : !contactCreable) && 'le contact'} : c'est le minimum
            pour lancer une opportunité.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onFermer}>Annuler</Button>
          <Button type="button" onClick={valider} disabled={!pret || enCours}>
            {enCours ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Création…</> : <><UserPlus className="h-3.5 w-3.5" /> Créer l'opportunité</>}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
