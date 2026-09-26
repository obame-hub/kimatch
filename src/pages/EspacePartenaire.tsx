import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, Building2, FileCheck2, Files, FileSignature, Gauge, Loader2, Mail,
  MapPin, Search, Sparkle, Users,
} from 'lucide-react'
import kiweePicto from '@/assets/kiwee-picto.png'
import { cn } from '@/lib/utils'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * L'ESPACE PARTENAIRE — UNE PAGE, UN LIEN PAR MAIL, AUCUN COMPTE KIMATCH
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 26/09/2026 : « est-ce qu'ils peuvent passer par l'API et voir une interface visuelle ?
 * comme ça ils ont une interface sans entrer dans Kimatch » — et, sur la clé : « je préfère qu'ils
 * reçoivent ou un code ou un lien dans leur boîte mail afin qu'ils soient indépendants et
 * n'attendent pas notre clé de notre part ».
 *
 * ══ IL SE CONNECTE SEUL ══
 *
 * Il tape son adresse, reçoit un lien valable 24 heures, et ce lien ouvre une session de 30 jours
 * dans son navigateur. Personne chez KiWee n'a rien à copier ni à transmettre. C'est le même
 * fonctionnement que la connexion de Kimatch — le lien est un sas, pas un accès permanent.
 *
 * LA CLÉ D'API RESTE POSSIBLE, pour une intégration à son propre outil : `exigerCle` accepte les
 * deux, et le préfixe `kw_` les distingue.
 *
 * ══ POURQUOI CETTE PAGE PLUTÔT QU'UN ACCÈS KIMATCH ══
 *
 * Faire entrer un externe dans Kimatch, c'est lui donner une session dans une application de 188
 * tables et 69 points d'entrée, dont chacun doit refuser individuellement et pour toujours. Sept
 * failles ont été mesurées en deux jours, dont une dans une correction écrite la veille. Ici, il
 * n'y a pas de session Kimatch : la page ne parle qu'à `api/partenaire`, qui rend ce qu'on a décidé
 * de rendre. Ajouter demain un écran à Kimatch n'ouvre rien.
 *
 * ══ CE QU'ELLE MONTRE ══
 *
 * Ses recommandations, et TOUT son patrimoine — comptes, contacts, sites, compteurs, mandats,
 * contrats, documents. Naoëlle, 26/09 : « faudrait leur afficher tous leurs objets dans
 * patrimoine ». Jamais les marges de KiWee, ni les prix négociés, ni les commentaires internes :
 * l'API ne les rend pas, et cette page ne peut pas les demander.
 */

interface Compte { id: string; reference: string | null; nom: string; siren: string | null; ville: string | null; code_postal: string | null; segment: string | null }
interface Contact { id: string; compte_id: string; civilite: string | null; prenom: string | null; nom: string; fonction: string | null; email: string | null; telephone: string | null; telephone_mobile: string | null; contact_principal: boolean | null }
interface Site { id: string; compte_id: string; nom: string; adresse: string | null; code_postal: string | null; ville: string | null; surface_m2: number | null }
interface Compteur { id: string; site_id: string; numero_point: string; libelle: string | null; consommation_annuelle_mwh: number | null; date_echeance: string | null }
interface Mandat { id: string; reference: string | null; numero: string | null; compte_id: string; date_signature: string | null; date_debut_validite: string | null; date_fin_validite: string | null; statut: { libelle: string } | null; signataire: { prenom: string | null; nom: string } | null }
interface Contrat { id: string; reference: string | null; compte_id: string; site_id: string | null; date_debut: string | null; date_fin: string | null; duree_mois: number | null; statut_signature: string | null; fournisseur: { nom: string } | null; energie: { libelle: string } | null }
interface Document { id: string; nom: string; nom_fichier: string | null; entite_type: string | null; entite_id: string | null; date_creation: string | null; type: { libelle: string } | null }
interface Recommandation { id: string; reference: string | null; nom: string; compte_id: string; date_ouverture: string | null; montant: number | null; duree_mois: number | null; marge_apporteur: number | null; etape: { libelle: string } | null; compte: { nom: string; ville: string | null } | null }

const CLE_SESSION = 'kimatch-partenaire-session'

function lireSession(): string {
  try {
    return localStorage.getItem(CLE_SESSION) ?? ''
  } catch {
    return ''
  }
}

function euros(n: number | null): string {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function jour(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR')
}

type Onglet = 'recommandations' | 'comptes' | 'contacts' | 'sites' | 'compteurs' | 'mandats' | 'contrats' | 'documents'

export default function EspacePartenaire() {
  const [session, setSession] = useState<string>(lireSession)
  const [email, setEmail] = useState('')
  const [demande, setDemande] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [onglet, setOnglet] = useState<Onglet>('recommandations')
  const [recherche, setRecherche] = useState('')
  const [nom, setNom] = useState<string | null>(null)

  const [reco, setReco] = useState<Recommandation[] | null>(null)
  const [comptes, setComptes] = useState<Compte[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [compteurs, setCompteurs] = useState<Compteur[]>([])
  const [mandats, setMandats] = useState<Mandat[]>([])
  const [contrats, setContrats] = useState<Contrat[]>([])
  const [documents, setDocuments] = useState<Document[]>([])

  const charger = useCallback(async (jeton: string) => {
    setEnCours(true)
    setErreur(null)
    try {
      const entete = { Authorization: 'Bearer ' + jeton }

      /* ON COMMENCE PAR LA RACINE : c'est elle qui valide l'accès et dit à qui il appartient. Deux
         appels qui échouent en parallèle donneraient deux messages pour une seule cause. */
      const racine = await fetch('/api/partenaire', { headers: entete })
      if (racine.status === 401) {
        const j = await racine.json().catch(() => ({}))
        throw new Error(j?.erreur ?? 'Votre accès a expiré. Saisissez votre adresse pour recevoir un nouveau lien.')
      }
      if (!racine.ok) throw new Error('Le service est momentanément indisponible. Réessayez dans un instant.')
      const info = await racine.json()
      setNom(typeof info?.votre_cle === 'string' ? info.votre_cle : null)

      const [rReco, rPat] = await Promise.all([
        fetch('/api/partenaire/recommandations', { headers: entete }),
        fetch('/api/partenaire/patrimoine', { headers: entete }),
      ])
      if (!rReco.ok || !rPat.ok) throw new Error('Vos données n’ont pas pu être chargées. Réessayez dans un instant.')

      const r = await rReco.json()
      const p = await rPat.json()
      setReco(r.recommandations ?? [])
      setComptes(p.comptes ?? [])
      setContacts(p.contacts ?? [])
      setSites(p.sites ?? [])
      setCompteurs(p.compteurs ?? [])
      setMandats(p.mandats ?? [])
      setContrats(p.contrats ?? [])
      setDocuments(p.documents ?? [])

      try {
        localStorage.setItem(CLE_SESSION, jeton)
      } catch {
        /* tant pis : l'accès vaudra pour cette visite */
      }
      setSession(jeton)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Quelque chose n’a pas fonctionné.')
      setReco(null)
      try {
        localStorage.removeItem(CLE_SESSION)
      } catch { /* rien à faire */ }
      setSession('')
    } finally {
      setEnCours(false)
    }
  }, [])

  /* ══ LE LIEN REÇU PAR MAIL S'ÉCHANGE À L'ARRIVÉE ══
     `?acces=…` est consommé aussitôt et RETIRÉ DE L'ADRESSE : un jeton dans l'URL finit dans
     l'historique, dans les journaux, et dans le `Referer` du moindre lien sortant. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const recu = params.get('acces')

    if (recu) {
      window.history.replaceState({}, '', window.location.pathname)
      setEnCours(true)
      void (async () => {
        try {
          const r = await fetch('/api/partenaire/ouvrir-acces', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jeton: recu }),
          })
          const j = await r.json()
          if (!r.ok) throw new Error(j?.erreur ?? 'Ce lien n’a pas pu être ouvert.')
          await charger(j.session)
        } catch (e) {
          setErreur(e instanceof Error ? e.message : 'Ce lien n’a pas pu être ouvert.')
          setEnCours(false)
        }
      })()
      return
    }

    if (session) void charger(session)
    // Au premier rendu seulement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function demanderUnLien() {
    setErreur(null)
    setDemande(null)
    setEnCours(true)
    try {
      const r = await fetch('/api/partenaire/demander-acces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const j = await r.json()
      setDemande(j?.message ?? 'Si cette adresse nous est connue, vous allez recevoir un lien.')
    } catch {
      setErreur('Votre demande n’a pas pu être envoyée. Réessayez dans un instant.')
    } finally {
      setEnCours(false)
    }
  }

  function quitter() {
    try {
      localStorage.removeItem(CLE_SESSION)
    } catch { /* rien à faire */ }
    setSession('')
    setReco(null)
    setNom(null)
    setEmail('')
    setDemande(null)
  }

  // ── LA RECHERCHE PORTE SUR CE QUI EST AFFICHÉ ──
  const q = recherche.trim().toLowerCase()
  const cherche = (...v: (string | null | undefined)[]) =>
    !q || v.some((x) => x && x.toLowerCase().includes(q))

  const vues = useMemo(() => ({
    recommandations: (reco ?? []).filter((r) => cherche(r.nom, r.reference, r.compte?.nom, r.etape?.libelle)),
    comptes: comptes.filter((c) => cherche(c.nom, c.reference, c.ville, c.siren)),
    contacts: contacts.filter((c) => cherche(c.prenom, c.nom, c.email, c.fonction)),
    sites: sites.filter((s) => cherche(s.nom, s.adresse, s.ville, s.code_postal)),
    compteurs: compteurs.filter((c) => cherche(c.numero_point, c.libelle)),
    mandats: mandats.filter((m) => cherche(m.reference, m.numero, m.statut?.libelle)),
    contrats: contrats.filter((c) => cherche(c.reference, c.fournisseur?.nom, c.energie?.libelle)),
    documents: documents.filter((d) => cherche(d.nom, d.nom_fichier, d.type?.libelle)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [reco, comptes, contacts, sites, compteurs, mandats, contrats, documents, q])

  const nomDuCompte = (id: string) => comptes.find((c) => c.id === id)?.nom ?? '—'
  const nomDuSite = (id: string | null) => (id ? sites.find((s) => s.id === id)?.nom ?? '—' : '—')

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // L'ÉCRAN D'ENTRÉE
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  if (!session && !enCours) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-km-bg p-4">
        <div className="w-full max-w-[420px] rounded-km border border-km-line bg-white p-7 shadow-[0_18px_40px_-24px_rgba(6,10,8,.4)]">
          <div className="mb-5 flex items-center gap-2.5">
            <img src={kiweePicto} alt="" className="h-8 w-8" />
            <div>
              <div className="text-km-body font-semibold text-km-text">KiWee Énergie</div>
              <div className="text-km-label text-km-faint">Espace partenaire</div>
            </div>
          </div>

          <p className="mb-4 text-km-xs leading-relaxed text-km-muted">
            Saisissez votre adresse e-mail : nous vous envoyons un lien d’accès. Il est valable
            24 heures, et votre navigateur gardera ensuite l’accès pendant 30 jours.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (email.trim()) void demanderUnLien()
            }}
            className="flex flex-col gap-2.5"
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-km-label font-semibold uppercase tracking-wide text-km-faint">
                Votre adresse e-mail
              </span>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-km-faint" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@votre-societe.fr"
                  autoFocus
                  className="w-full rounded-km border border-km-line bg-white py-2.5 pl-9 pr-3 text-[14px] text-km-text outline-none focus:border-km-green focus:ring-1 focus:ring-km-green"
                />
              </div>
            </label>

            {demande && (
              <p className="rounded-km-sm border border-km-green/30 bg-km-green-tint px-2.5 py-2 text-km-xs leading-snug text-km-text">
                {demande}
              </p>
            )}

            {erreur && (
              <p className="flex items-start gap-1.5 rounded-km-sm border border-km-red/30 bg-km-red-soft px-2.5 py-2 text-km-xs leading-snug text-km-red">
                <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" />
                {erreur}
              </p>
            )}

            <button
              type="submit"
              disabled={!email.trim() || enCours}
              className="flex h-[38px] items-center justify-center gap-2 rounded-km bg-km-green text-km-body font-semibold text-white transition-colors hover:bg-km-green/90 disabled:opacity-50"
            >
              {enCours ? <><Loader2 className="h-4 w-4 animate-spin" /> Envoi…</> : 'Recevoir mon lien'}
            </button>
          </form>

          <p className="mt-4 text-km-label leading-relaxed text-km-faint">
            Votre adresse doit être celle d’un contact déclaré chez KiWee. Si vous ne recevez rien,
            rapprochez-vous de votre interlocuteur.
          </p>
        </div>
      </div>
    )
  }

  if (enCours && !reco) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-km-bg">
        <div className="flex items-center gap-2 text-km-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Ouverture de votre espace…
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // L'ESPACE
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  const ONGLETS: { cle: Onglet; libelle: string; icone: typeof Building2; n: number }[] = [
    { cle: 'recommandations', libelle: 'Mes affaires', icone: Sparkle, n: reco?.length ?? 0 },
    { cle: 'comptes', libelle: 'Comptes', icone: Building2, n: comptes.length },
    { cle: 'contacts', libelle: 'Contacts', icone: Users, n: contacts.length },
    { cle: 'sites', libelle: 'Sites', icone: MapPin, n: sites.length },
    { cle: 'compteurs', libelle: 'Compteurs', icone: Gauge, n: compteurs.length },
    { cle: 'mandats', libelle: 'Mandats', icone: FileCheck2, n: mandats.length },
    { cle: 'contrats', libelle: 'Contrats', icone: FileSignature, n: contrats.length },
    { cle: 'documents', libelle: 'Documents', icone: Files, n: documents.length },
  ]

  const Tableau = ({ tetes, children }: { tetes: string[]; children: React.ReactNode }) => (
    <div className="overflow-x-auto rounded-km border border-km-line bg-white">
      <table className="w-full text-km-xs">
        <thead>
          <tr className="border-b border-km-line bg-km-bg/40 text-km-label uppercase tracking-wide text-km-faint">
            {tetes.map((t) => (
              <th key={t} className={cn('px-3 py-2 font-semibold', t.startsWith('>') ? 'text-right' : 'text-left')}>
                {t.replace(/^>/, '')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )

  const Vide = ({ quoi }: { quoi: string }) => (
    <p className="rounded-km border border-km-line bg-white px-4 py-6 text-center text-km-xs text-km-faint">
      {recherche ? `Aucun ${quoi} ne correspond à cette recherche.` : `Aucun ${quoi} pour le moment.`}
    </p>
  )

  return (
    <div className="min-h-screen bg-km-bg">
      <header className="border-b border-km-line bg-white">
        <div className="mx-auto flex max-w-[1180px] items-center gap-3 px-4 py-3 sm:px-6">
          <img src={kiweePicto} alt="" className="h-7 w-7" />
          <div className="min-w-0 flex-1">
            <div className="text-km-body font-semibold text-km-text">KiWee Énergie</div>
            <div className="text-km-label text-km-faint">
              Espace partenaire{nom ? ` · ${nom}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={quitter}
            className="shrink-0 rounded-km-sm border border-km-line px-2.5 py-1.5 text-km-label font-semibold text-km-muted transition-colors hover:border-km-red hover:text-km-red"
          >
            Quitter
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[1180px] px-4 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {ONGLETS.map(({ cle, libelle, icone: Icone, n }) => (
            <button
              key={cle}
              type="button"
              onClick={() => setOnglet(cle)}
              className={cn(
                'flex items-center gap-1.5 rounded-km px-2.5 py-1.5 text-km-body font-medium transition-colors',
                onglet === cle ? 'bg-kiwi-500/15 text-km-green' : 'text-km-muted hover:bg-white',
              )}
            >
              <Icone className="h-4 w-4" />
              {libelle}
              <span className="text-km-label text-km-faint">{n}</span>
            </button>
          ))}

          <span className="flex-1" />

          <div className="relative min-w-[180px] flex-1 sm:max-w-[260px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-km-faint" />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher…"
              className="h-[32px] w-full rounded-km border border-km-line bg-white pl-8 pr-2.5 text-km-body text-km-text outline-none focus:border-km-green"
            />
          </div>
        </div>

        {onglet === 'recommandations' && (
          vues.recommandations.length === 0 ? <Vide quoi="dossier" /> : (
            <Tableau tetes={['Affaire', 'Compte', 'Étape', 'Ouverte le', '>Montant', '>Votre marge']}>
              {vues.recommandations.map((r) => (
                <tr key={r.id} className="border-b border-km-line-soft last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-km-text">{r.nom}</div>
                    {r.reference && <div className="text-km-label text-km-faint">{r.reference}</div>}
                  </td>
                  <td className="px-3 py-2 text-km-muted">{r.compte?.nom ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-km-sm bg-km-soft px-2 py-0.5 text-km-label font-semibold text-km-muted">
                      {r.etape?.libelle ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-km-muted">{jour(r.date_ouverture)}</td>
                  <td className="px-3 py-2 text-right text-km-muted">{euros(r.montant)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-km-green">{euros(r.marge_apporteur)}</td>
                </tr>
              ))}
            </Tableau>
          )
        )}

        {onglet === 'comptes' && (
          vues.comptes.length === 0 ? <Vide quoi="compte" /> : (
            <Tableau tetes={['Compte', 'Ville', 'SIREN', 'Typologie', '>Sites']}>
              {vues.comptes.map((c) => (
                <tr key={c.id} className="border-b border-km-line-soft last:border-0">
                  <td className="px-3 py-2 font-semibold text-km-text">{c.nom}</td>
                  <td className="px-3 py-2 text-km-muted">{c.code_postal} {c.ville}</td>
                  <td className="px-3 py-2 font-mono text-km-faint">{c.siren ?? '—'}</td>
                  <td className="px-3 py-2 text-km-muted">{c.segment ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-km-muted">
                    {sites.filter((s) => s.compte_id === c.id).length}
                  </td>
                </tr>
              ))}
            </Tableau>
          )
        )}

        {onglet === 'contacts' && (
          vues.contacts.length === 0 ? <Vide quoi="contact" /> : (
            <Tableau tetes={['Nom', 'Fonction', 'Compte', 'E-mail', 'Téléphone']}>
              {vues.contacts.map((c) => (
                <tr key={c.id} className="border-b border-km-line-soft last:border-0">
                  <td className="px-3 py-2 font-semibold text-km-text">
                    {[c.civilite, c.prenom, c.nom].filter(Boolean).join(' ')}
                    {c.contact_principal && (
                      <span className="ml-1.5 rounded-km-sm bg-km-green-tint px-1.5 py-0.5 text-km-label font-semibold text-km-green">
                        principal
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-km-muted">{c.fonction ?? '—'}</td>
                  <td className="px-3 py-2 text-km-muted">{nomDuCompte(c.compte_id)}</td>
                  <td className="px-3 py-2 text-km-muted">{c.email ?? '—'}</td>
                  <td className="px-3 py-2 text-km-muted">{c.telephone ?? c.telephone_mobile ?? '—'}</td>
                </tr>
              ))}
            </Tableau>
          )
        )}

        {onglet === 'sites' && (
          vues.sites.length === 0 ? <Vide quoi="site" /> : (
            <Tableau tetes={['Site', 'Adresse', 'Compte', '>Surface', '>Compteurs']}>
              {vues.sites.map((s) => (
                <tr key={s.id} className="border-b border-km-line-soft last:border-0">
                  <td className="px-3 py-2 font-semibold text-km-text">{s.nom}</td>
                  <td className="px-3 py-2 text-km-muted">
                    {[s.adresse, s.code_postal, s.ville].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-3 py-2 text-km-muted">{nomDuCompte(s.compte_id)}</td>
                  <td className="px-3 py-2 text-right text-km-muted">{s.surface_m2 ? `${s.surface_m2} m²` : '—'}</td>
                  <td className="px-3 py-2 text-right text-km-muted">
                    {compteurs.filter((c) => c.site_id === s.id).length}
                  </td>
                </tr>
              ))}
            </Tableau>
          )
        )}

        {onglet === 'compteurs' && (
          vues.compteurs.length === 0 ? <Vide quoi="compteur" /> : (
            <Tableau tetes={['Point de livraison', 'Libellé', 'Site', '>Consommation', 'Échéance']}>
              {vues.compteurs.map((c) => (
                <tr key={c.id} className="border-b border-km-line-soft last:border-0">
                  <td className="px-3 py-2 font-mono font-semibold text-km-text">{c.numero_point}</td>
                  <td className="px-3 py-2 text-km-muted">{c.libelle ?? '—'}</td>
                  <td className="px-3 py-2 text-km-muted">{nomDuSite(c.site_id)}</td>
                  <td className="px-3 py-2 text-right text-km-muted">
                    {c.consommation_annuelle_mwh !== null ? `${c.consommation_annuelle_mwh} MWh` : '—'}
                  </td>
                  <td className="px-3 py-2 text-km-muted">{jour(c.date_echeance)}</td>
                </tr>
              ))}
            </Tableau>
          )
        )}

        {onglet === 'mandats' && (
          vues.mandats.length === 0 ? <Vide quoi="mandat" /> : (
            <Tableau tetes={['Référence', 'Compte', 'Statut', 'Signataire', 'Signé le', 'Validité']}>
              {vues.mandats.map((m) => (
                <tr key={m.id} className="border-b border-km-line-soft last:border-0">
                  <td className="px-3 py-2 font-semibold text-km-text">{m.numero ?? m.reference ?? '—'}</td>
                  <td className="px-3 py-2 text-km-muted">{nomDuCompte(m.compte_id)}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-km-sm bg-km-soft px-2 py-0.5 text-km-label font-semibold text-km-muted">
                      {m.statut?.libelle ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-km-muted">
                    {m.signataire ? `${m.signataire.prenom ?? ''} ${m.signataire.nom}`.trim() : '—'}
                  </td>
                  <td className="px-3 py-2 text-km-muted">{jour(m.date_signature)}</td>
                  <td className="px-3 py-2 text-km-muted">
                    {m.date_debut_validite ? `${jour(m.date_debut_validite)} → ${jour(m.date_fin_validite)}` : '—'}
                  </td>
                </tr>
              ))}
            </Tableau>
          )
        )}

        {onglet === 'contrats' && (
          vues.contrats.length === 0 ? <Vide quoi="contrat" /> : (
            <Tableau tetes={['Référence', 'Compte', 'Fournisseur', 'Énergie', 'Période', '>Durée']}>
              {vues.contrats.map((c) => (
                <tr key={c.id} className="border-b border-km-line-soft last:border-0">
                  <td className="px-3 py-2 font-semibold text-km-text">{c.reference ?? '—'}</td>
                  <td className="px-3 py-2 text-km-muted">{nomDuCompte(c.compte_id)}</td>
                  <td className="px-3 py-2 text-km-muted">{c.fournisseur?.nom ?? '—'}</td>
                  <td className="px-3 py-2 text-km-muted">{c.energie?.libelle ?? '—'}</td>
                  <td className="px-3 py-2 text-km-muted">
                    {c.date_debut ? `${jour(c.date_debut)} → ${jour(c.date_fin)}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-km-muted">
                    {c.duree_mois ? `${c.duree_mois} mois` : '—'}
                  </td>
                </tr>
              ))}
            </Tableau>
          )
        )}

        {onglet === 'documents' && (
          vues.documents.length === 0 ? <Vide quoi="document" /> : (
            <>
              <Tableau tetes={['Document', 'Type', 'Déposé le']}>
                {vues.documents.map((d) => (
                  <tr key={d.id} className="border-b border-km-line-soft last:border-0">
                    <td className="px-3 py-2 font-semibold text-km-text">{d.nom_fichier ?? d.nom}</td>
                    <td className="px-3 py-2 text-km-muted">{d.type?.libelle ?? '—'}</td>
                    <td className="px-3 py-2 text-km-muted">{jour(d.date_creation)}</td>
                  </tr>
                ))}
              </Tableau>
              {/* ON DIT POURQUOI ON NE PEUT PAS TÉLÉCHARGER, plutôt que de laisser chercher un
                  bouton qui n'existe pas. */}
              <p className="mt-2 text-km-label leading-relaxed text-km-faint">
                Les fichiers eux-mêmes ne sont pas téléchargeables depuis cet espace. Demandez-les à
                votre interlocuteur KiWee.
              </p>
            </>
          )
        )}

        <p className="mt-6 text-center text-km-label leading-relaxed text-km-faint">
          Ces informations sont en lecture seule. Pour toute modification, contactez votre
          interlocuteur KiWee.
        </p>
      </div>
    </div>
  )
}
