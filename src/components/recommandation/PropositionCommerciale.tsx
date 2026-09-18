import { useRef, useState } from 'react'
import { FileCheck2, FileText, Loader2, Send } from 'lucide-react'
import { useDocumentsParEntites, useTeleverserDocuments } from '@/lib/data/documents'
import { useOuvrirEmail } from '@/lib/voletEmail'
import { cn } from '@/lib/utils'
import type { Contact, Recommandation, VersionRecommandation } from '@/types/domain'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA PROPOSITION COMMERCIALE — AU PIED DE SA VERSION
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 18/09/2026 : « finalement j'aimerais que la proposition commerciale ne soit pas dans un
 * hero, mais plutôt dans le bloc version lui-même. Essaie de lui trouver une place adaptée. »
 *
 * ══ LA PLACE ADAPTÉE EST LE BAS DU BLOC, ET C'EST UNE QUESTION D'ORDRE DE LECTURE ══
 *
 * Une version se lit comme une phrase en trois temps : ce qu'on a demandé (l'en-tête, ses durées et
 * sa date), qui a répondu (la grille des fournisseurs), et ce qu'on envoie au client. La proposition
 * est le troisième temps — c'est la SYNTHÈSE des cartes du dessus, le document qu'on fabrique une
 * fois qu'on les a lues. La mettre au-dessus de la grille l'aurait fait précéder ce dont elle
 * découle ; au pied du bloc, elle se lit à l'endroit où on arrive après avoir constaté que tout le
 * monde a répondu.
 *
 * ══ POURQUOI ELLE QUITTE LE HERO, ET CE QU'ON Y GAGNE ══
 *
 * Elle y était à ma suggestion, et l'argument tenait : sur 42 versions « Disponible », 8 seulement
 * ont leur proposition attachée — un écart qu'une cellule ambre en tête de fiche rendait impossible
 * à ignorer. Mais il avait un défaut que le déplacement corrige : DANS LE HERO, ELLE ÉTAIT LOIN DE
 * CE QU'ELLE RÉSUME. Le hero parle du dossier — combien il rapporte, à qui on s'adresse — et ces
 * deux-là ne changent pas quand une version est remplacée. La proposition, elle, meurt avec sa
 * version. Un objet qui a la durée de vie d'une version appartient au bloc version.
 *
 * L'ALERTE N'EST PAS PERDUE : quand la version est « Disponible » sans proposition, cette bande
 * passe en ambre, et elle est le dernier élément du bloc le plus regardé de la fiche.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Le type de document d'une proposition commerciale — 3 296 lignes déjà en base. */
const TYPE_PROPOSITION = 'Recommandation'

export function PropositionCommerciale({
  reco,
  version,
  contactSignataire,
  typeDocumentPropositionId,
  peutModifier,
  signaler,
  onPresentationEnvoyee,
}: {
  reco: Recommandation
  version: VersionRecommandation
  contactSignataire: Contact | null | undefined
  typeDocumentPropositionId: string | null
  peutModifier: boolean
  signaler: (message: string) => void
  /** Appelé quand la proposition part chez le client : c'est ce geste qui date la présentation. */
  onPresentationEnvoyee: () => void
}) {
  const ouvrirEmail = useOuvrirEmail()
  const { data: documents } = useDocumentsParEntites([version.id])
  const televerser = useTeleverserDocuments()
  const champFichier = useRef<HTMLInputElement>(null)
  const [depotEnCours, setDepotEnCours] = useState(false)

  /* LA PROPOSITION EST CELLE DE CETTE VERSION, et d'aucune autre. Deux versions d'un même dossier
     proposent deux choses différentes ; une proposition rangée sur le dossier ne dirait plus
     laquelle. Les 3 296 déjà en base sont d'ailleurs toutes portées par une version. */
  const proposition = (documents ?? [])
    .filter((d) => d.type_document === TYPE_PROPOSITION)
    .sort((a, b) => b.date_creation.localeCompare(a.date_creation))[0] ?? null

  /**
   * ══ UNE VERSION CLÔTURÉE NE PROPOSE PLUS RIEN ══
   *
   * William, 18/09/2026 : « si je crée une nouvelle version ou si je clôture la version en cours, la
   * proposition commerciale disparaît et je suis dans l'attente d'une autre propre à la prochaine
   * version. En revanche tu gardes cette proposition au format PDF dans l'historique. »
   *
   * Sans cette règle, le PDF d'une version close continuait de s'offrir sous un bouton vert
   * « Envoyer au client » : non seulement on ne voyait pas qu'on attendait la suite, mais on pouvait
   * envoyer au client une offre qui n'a plus cours. Le document n'est pas perdu — il reste attaché à
   * sa version, et le comparatif de versions le montre, cliquable.
   */
  const close = version.statut === 'CLOTUREE'
  const disponible = version.statut === 'DISPONIBLE'
  const etat: 'prete' | 'manque' | 'attente' =
    close ? 'attente' : proposition ? 'prete' : disponible ? 'manque' : 'attente'

  async function deposer(liste: FileList | null) {
    const choisis = Array.from(liste ?? [])
    if (choisis.length === 0) return
    setDepotEnCours(true)
    try {
      await televerser.mutateAsync({
        fichiers: choisis.slice(0, 1),
        entite_type: 'version_recommandation',
        entite_id: version.id,
        type_document_id: typeDocumentPropositionId,
        type_document_libelle: TYPE_PROPOSITION,
      })
      signaler('✓ Proposition commerciale attachée à la version')
    } catch (e) {
      signaler(`Erreur : ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setDepotEnCours(false)
      if (champFichier.current) champFichier.current.value = ''
    }
  }

  /**
   * « Envoyer au client » : le volet d'e-mail s'ouvre avec l'adresse du contact ET la proposition
   * déjà en pièce jointe (William, 18/09/2026).
   *
   * LE FICHIER N'EST PAS RETÉLÉVERSÉ : il vit déjà dans le seau public `documents`, donc son adresse
   * suffit. Et il y reste — le nettoyage d'après-envoi ne touche que le dossier `emails/`.
   *
   * LE GESTE DATE AUSSI LA PRÉSENTATION. C'est le fait dont dépend la suggestion de relance : sans
   * lui, `date_presentation_client` resterait vide et Kimatch ne saurait jamais qu'on attend une
   * réponse. Le mail qu'on écrit EST la présentation ; la consigner ailleurs serait la refaire.
   */
  function envoyerAuClient() {
    if (!ouvrirEmail || !contactSignataire?.email || !proposition) return
    ouvrirEmail({
      a: contactSignataire.email,
      nom: `${contactSignataire.prenom} ${contactSignataire.nom}`.trim(),
      objet: `Proposition commerciale — ${reco.compte_nom}`,
      contactId: contactSignataire.id,
      compteId: reco.compte_id,
      recommandationId: reco.id,
      piecesJointes: [{
        nom: proposition.nom_fichier || proposition.nom,
        url: proposition.url,
        type: 'application/pdf',
        taille: 0,
      }],
    })
    onPresentationEnvoyee()
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 border-t px-[17px] py-3',
        etat === 'prete' && 'border-km-green-line bg-km-green-tint',
        etat === 'manque' && 'border-km-amber/40 bg-km-amber-soft',
        etat === 'attente' && 'border-km-line-soft bg-km-soft/60',
      )}
    >
      {etat === 'prete' ? (
        <FileCheck2 className="h-[18px] w-[18px] shrink-0 text-km-green" />
      ) : (
        <FileText className={cn('h-[18px] w-[18px] shrink-0', etat === 'manque' ? 'text-km-amber' : 'text-km-faint')} />
      )}

      <span className="text-km-body font-extrabold text-km-text">Proposition commerciale</span>

      {etat === 'prete' && proposition ? (
        <>
          <span className="flex h-[30px] w-[25px] shrink-0 items-center justify-center rounded border border-km-red-line bg-km-red-soft text-km-tiny font-extrabold text-km-red">
            PDF
          </span>
          <a
            href={proposition.url}
            target="_blank"
            rel="noreferrer"
            title={`Ouvrir ${proposition.nom_fichier || proposition.nom}`}
            className="min-w-0 max-w-[280px]"
          >
            <span className="block truncate text-km-body font-bold text-km-text hover:text-km-green hover:underline">
              {proposition.nom_fichier || proposition.nom}
            </span>
            <span className="block truncate text-km-label text-km-faint">
              déposée le {new Date(proposition.date_creation).toLocaleDateString('fr-FR')}
              {proposition.auteur ? ` par ${proposition.auteur}` : ''}
            </span>
          </a>
          {peutModifier && (
            <button
              type="button"
              onClick={() => champFichier.current?.click()}
              disabled={depotEnCours}
              className="inline-flex items-center rounded-km-sm border border-dashed border-km-line px-2 py-[3px] text-km-label font-semibold text-km-faint hover:border-km-green hover:text-km-green disabled:opacity-60"
            >
              {depotEnCours ? <Loader2 className="h-3 w-3 animate-spin" /> : 'remplacer'}
            </button>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={envoyerAuClient}
            disabled={!contactSignataire?.email || !ouvrirEmail}
            title={
              !contactSignataire?.email
                ? 'Le contact signataire n’a pas d’adresse e-mail — désignez-en un autre ou complétez sa fiche.'
                : 'Ouvre un e-mail au client, proposition déjà jointe'
            }
            className="inline-flex h-[34px] shrink-0 items-center gap-[7px] rounded-km bg-km-green px-3.5 text-km-body font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Send className="h-3.5 w-3.5" />
            Envoyer au client
          </button>
        </>
      ) : etat === 'manque' ? (
        <>
          <span className="min-w-[200px] flex-1 text-km-body text-km-muted">
            La version est <b>Disponible</b> mais aucune proposition n'y est jointe — il n'y a donc
            rien à envoyer au client.
          </span>
          {peutModifier && (
            <button
              type="button"
              onClick={() => champFichier.current?.click()}
              disabled={depotEnCours}
              className="inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-km bg-km-amber px-3 text-km-body font-bold text-white hover:brightness-110 disabled:opacity-60"
            >
              {depotEnCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              Déposer la proposition
            </button>
          )}
        </>
      ) : (
        <>
          <span className="min-w-[200px] flex-1 text-km-body text-km-faint">
            {close
              ? `${version.nom || `V${version.numero_version ?? ''}`} est clôturée — la prochaine version portera sa propre proposition.`
              : 'Elle se joindra ici quand la version sera prête à partir.'}
          </span>
          {peutModifier && !close && (
            <button
              type="button"
              onClick={() => champFichier.current?.click()}
              disabled={depotEnCours}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-km-sm border border-dashed border-km-line px-2.5 py-1 text-km-label font-semibold text-km-faint hover:border-km-green hover:text-km-green disabled:opacity-60"
            >
              {depotEnCours ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              déposer dès maintenant
            </button>
          )}
        </>
      )}

      <input
        ref={champFichier}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => void deposer(e.target.files)}
      />
    </div>
  )
}
