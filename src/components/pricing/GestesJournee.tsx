import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Mail, Search } from 'lucide-react'
import { useContactsParCompte } from '@/lib/data/contacts'
import { useOuvrirEmail } from '@/lib/voletEmail'
import { cn } from '@/lib/utils'
import type { ActionJournee } from '@/lib/journeePricing'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LES GESTES : LES BOUTONS QUI FONT CE QUE LA LIGNE ANNONCE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 18/09/2026 : « il faut tout câbler, même les mails avec un corps vide pour le moment,
 * c'est pas grave, Erwan écrira à la main ».
 *
 * ══ UN MAIL VIDE VAUT MIEUX QU'UN MAIL INVENTÉ ══
 *
 * Le modèle de demande d'offre n'existe pas encore — « on n'a pas encore créé de modèle, ce sera à
 * faire plus tard ». Écrire à la place d'Erwan un texte plausible aurait fait partir chez un
 * fournisseur une formulation que personne n'a validée, et aurait surtout donné l'illusion d'un
 * modèle là où il n'y en a pas : personne ne l'aurait rédigé.
 *
 * Ce que le mail porte donc : le bon destinataire, un objet qui dit de quoi il s'agit, et les
 * rattachements — compte, fournisseur, recommandation, contrat — pour que l'échange se retrouve
 * depuis la fiche. Le corps est vide, et c'est dit.
 *
 * ══ LE DESTINATAIRE SE CHOISIT PARMI LES CONTACTS DU FOURNISSEUR ══
 *
 * William : « il faut proposer d'envoyer le mail à un des contacts du compte fournisseur en
 * question ; en fonction du choix, ça met le bon destinataire ». D'où ce petit sélecteur plutôt
 * qu'une adresse devinée — un fournisseur a un interlocuteur pricing, un commercial, parfois un
 * service. Kimatch ne sait pas lequel écrit les offres ; Erwan, si.
 *
 * ══ ET LE STATUT SUIT LE GESTE ══
 *
 * Envoyer la demande la passe à « Demande envoyée » — sans quoi Erwan ferait deux fois le même
 * travail, et la ligne réapparaîtrait le lendemain comme si rien n'était parti. Le statut se pose
 * APRÈS l'ouverture du volet d'e-mail : si le volet refuse de s'ouvrir, rien n'est écrit.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

export interface DemandeEnvoi {
  compteId: string
  fournisseurNom: string
  objet: string
  /** Les rattachements du futur échange. */
  recommandationId?: string
  contratId?: string
  /** Ce qu'on fait une fois le mail ouvert : poser le statut qui va avec. */
  apresEnvoi?: () => void | Promise<void>
}

/** Le bouton qui ouvre le sélecteur de destinataire. */
export function BoutonEcrire({
  libelle,
  ton = 'sombre',
  onOuvrir,
}: {
  libelle: string
  ton?: 'sombre' | 'rouge' | 'vert'
  onOuvrir: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOuvrir}
      className={cn(
        'inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-km px-3 text-km-body font-bold text-white transition hover:brightness-110',
        ton === 'rouge' && 'bg-km-red',
        ton === 'vert' && 'bg-km-green',
        ton === 'sombre' && 'bg-km-text',
      )}
    >
      <Mail className="h-3 w-3" />
      {libelle}
    </button>
  )
}

/** Un bouton de statut : il pose une valeur et fait disparaître la ligne. */
export function BoutonStatut({
  libelle,
  onCliquer,
  enCours,
  ton = 'vert',
}: {
  libelle: string
  onCliquer: () => void
  enCours?: boolean
  ton?: 'vert' | 'ambre'
}) {
  return (
    <button
      type="button"
      onClick={onCliquer}
      disabled={enCours}
      className={cn(
        'inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-km border px-3 text-km-body font-bold transition disabled:opacity-60',
        ton === 'vert' && 'border-km-green-line bg-km-green-soft text-km-green hover:brightness-[.97]',
        ton === 'ambre' && 'border-km-amber/40 bg-km-amber-soft text-km-amber hover:brightness-[.97]',
      )}
    >
      {enCours && <Loader2 className="h-3 w-3 animate-spin" />}
      {libelle}
    </button>
  )
}

/**
 * Le sélecteur de destinataire : les contacts du compte fournisseur, et rien d'autre.
 *
 * IL S'AFFICHE MÊME SANS CONTACT, et c'est le point : un fournisseur sans interlocuteur enregistré
 * est une lacune qu'il vaut mieux voir au moment d'écrire que découvrir en cherchant l'adresse
 * ailleurs. Le panneau le dit et mène à la fiche pour l'ajouter.
 */
export function SelecteurDestinataire({
  demande,
  onFermer,
  signaler,
}: {
  demande: DemandeEnvoi
  onFermer: () => void
  signaler: (message: string) => void
}) {
  const { data: contacts, isLoading } = useContactsParCompte(demande.compteId)
  const ouvrirEmail = useOuvrirEmail()
  const [recherche, setRecherche] = useState('')

  const avecEmail = (contacts ?? []).filter((c) => c.email)
  const terme = recherche.trim().toLowerCase()
  const listes = avecEmail.filter(
    (c) => !terme || `${c.prenom} ${c.nom} ${c.fonction ?? ''} ${c.email}`.toLowerCase().includes(terme),
  )

  async function choisir(contact: { id: string; prenom: string; nom: string; email: string }) {
    if (!ouvrirEmail) {
      signaler('Le volet d’e-mail est indisponible — rechargez la page.')
      return
    }
    ouvrirEmail({
      a: contact.email,
      nom: `${contact.prenom} ${contact.nom}`.trim(),
      objet: demande.objet,
      contactId: contact.id,
      compteId: demande.compteId,
      recommandationId: demande.recommandationId,
      contratId: demande.contratId,
    })
    onFermer()
    /* LE STATUT SUIT L'OUVERTURE, pas l'envoi : Kimatch ne sait pas quand Erwan cliquera « envoyer »
       dans le volet, et attendre cet instant laisserait la ligne réapparaître entre-temps. C'est le
       même choix que « Consigner une relance » sur la recommandation — on enregistre le geste, pas
       son aboutissement. */
    if (demande.apresEnvoi) await demande.apresEnvoi()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-ink-900/25 p-4 pt-[12vh]">
      <button type="button" aria-label="Fermer" onClick={onFermer} className="absolute inset-0 cursor-default" />
      <div className="relative w-full max-w-[460px] animate-km-hub-pop overflow-hidden rounded-km-lg border border-km-line bg-white shadow-km-pop">
        <header className="border-b border-km-line-soft px-4 py-3">
          <p className="text-km-name font-extrabold text-km-text">Écrire à {demande.fournisseurNom}</p>
          <p className="mt-0.5 text-km-label text-km-muted">
            Choisissez le destinataire. Le message s'ouvrira <b>vide</b> — à vous de l'écrire.
          </p>
        </header>

        <div className="flex items-center gap-2 border-b border-km-line-soft px-3.5 py-2">
          <Search className="h-3 w-3 shrink-0 text-km-faint" />
          <input
            autoFocus
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un contact…"
            className="min-w-0 flex-1 border-0 bg-transparent text-km-body text-km-text outline-none placeholder:text-km-faint"
          />
        </div>

        <div className="max-h-[42vh] overflow-y-auto">
          {isLoading ? (
            <p className="px-4 py-4 text-km-body text-km-faint">Chargement des contacts…</p>
          ) : listes.length === 0 ? (
            <div className="px-4 py-4">
              <p className="text-km-body text-km-muted">
                {avecEmail.length === 0
                  ? `Aucun contact avec une adresse e-mail sur ${demande.fournisseurNom}.`
                  : 'Aucun contact ne correspond.'}
              </p>
              {avecEmail.length === 0 && (
                <Link
                  to={`/comptes/${demande.compteId}`}
                  onClick={onFermer}
                  className="mt-1.5 inline-block text-km-label font-bold text-km-green hover:underline"
                >
                  Ouvrir la fiche fournisseur pour en ajouter un →
                </Link>
              )}
            </div>
          ) : (
            listes.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => void choisir({ id: c.id, prenom: c.prenom, nom: c.nom, email: c.email as string })}
                className="flex w-full items-center gap-2.5 border-b border-km-line-soft px-4 py-2.5 text-left last:border-0 hover:bg-km-green-soft"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-km-body font-bold text-km-text">
                    {c.prenom} {c.nom}
                    {c.fonction && <span className="font-normal text-km-faint"> · {c.fonction}</span>}
                  </span>
                  <span className="block truncate font-mono text-km-label text-km-muted">{c.email}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/** Les libellés des gestes, pour que l'écran et le sélecteur disent la même chose. */
export function objetDuGeste(action: ActionJournee): string {
  switch (action.geste) {
    case 'ECRIRE_DEMANDE':
      return `Demande d'offre — ${action.contexte.split(' · ')[0]}`
    case 'RELANCER_CONFIRMATION':
      return `Relance — confirmation de notre demande d'offre`
    case 'RELANCER_OFFRE':
      return `Relance — offre attendue`
    case 'DEMANDER_CONTRAT':
      return `Demande de contrat — ${action.contexte.split(' · ')[0]}`
    case 'RELANCER_CONTRAT':
      return `Relance — contrat attendu`
    case 'TRANSMETTRE_CONTRAT':
      return `Contrat signé — pour enregistrement`
    default:
      return 'Kimatch'
  }
}
