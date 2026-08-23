import { Pencil, Sparkle } from 'lucide-react'
import { useHistorique, type HistoriqueEntry } from '@/lib/data/historique'
import { cn } from '@/lib/utils'

/**
 * Le flux d'actualité de la colonne de droite, au format de la maquette de William.
 *
 * SA STRUCTURE, RELEVÉE DANS SON FICHIER : un séparateur de journée (« Aujourd'hui »), puis des
 * cartes à trois étages — pastille d'icône, puis une puce de nature et le texte de l'événement, puis
 * une ligne de méta en chiffres fixes. Sa maquette y ajoutait des points (« +14 pts ») : ils
 * disparaissent, Michel ayant écarté le score le 23/08/2026. Le reste tient.
 *
 * CE QUE LE FLUX MONTRE VRAIMENT. Les interactions — appels, courriels — sont portées par le compte
 * et le contact, pas par l'opportunité : décider lesquelles lui appartiennent est un choix que
 * Michel n'a pas tranché. Le flux porte donc ce que cet objet produit réellement : sa création et
 * chacune de ses modifications, avec qui l'a faite. C'est déjà ce qu'on vient chercher ici — « où en
 * est ce dossier, et qui l'a touché en dernier ».
 */

/** Les champs techniques n'ont rien à dire à un commercial. */
const LIBELLES: Record<string, string> = {
  accord_client: 'Accord du client',
  compte_id: 'Compte',
  contact_id: 'Contact',
  origine: 'Origine',
  type_opportunite: 'Type',
  statut_id: 'Statut',
  qualification_fin: 'Qualification finale',
  motif_cloture: 'Motif de clôture',
  date_cloture: 'Date de clôture',
  date_reactivation: 'Réactivation',
  prochaine_action: 'Prochaine action',
  prochaine_action_echeance: 'Échéance',
  prochaine_action_faite_le: 'Action faite',
  commentaire: 'Commentaire',
  signal_libelle: 'Signal',
  reference: 'Référence',
  proprietaire_id: 'Propriétaire',
}

function libelleChamp(champ: string): string {
  return LIBELLES[champ] ?? champ.replace(/_/g, ' ')
}

/** `true`/`false` et les identifiants bruts ne se lisent pas : on les traduit ou on les tait. */
function valeurLisible(v: string | null): string {
  if (v === null || v === '') return '—'
  if (v === 'true') return 'oui'
  if (v === 'false') return 'non'
  // Un UUID ne dit rien à personne : la ligne indique déjà quel champ a changé.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return 'renseigné'
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(v).toLocaleDateString('fr-FR')
  return v.length > 60 ? v.slice(0, 57) + '…' : v
}

function libelleJour(iso: string): string {
  const jour = new Date(iso)
  const aujourdhui = new Date()
  const hier = new Date(aujourdhui)
  hier.setDate(hier.getDate() - 1)
  const memeJour = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (memeJour(jour, aujourdhui)) return "Aujourd'hui"
  if (memeJour(jour, hier)) return 'Hier'
  return jour.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

export function FluxActualite({ tableNom, ligneId, dateCreation }: {
  tableNom: string
  ligneId: string | undefined
  /** La création n'est pas dans l'historique des modifications : on la pose en pied de flux. */
  dateCreation: string
}) {
  const { data: entrees } = useHistorique(tableNom, ligneId)
  const liste: HistoriqueEntry[] = entrees ?? []

  // Regroupement par journée, du plus récent au plus ancien.
  const jours: { jour: string; entrees: HistoriqueEntry[] }[] = []
  for (const e of [...liste].sort((a, b) => b.date_modification.localeCompare(a.date_modification))) {
    const jour = libelleJour(e.date_modification)
    const dernier = jours[jours.length - 1]
    if (dernier && dernier.jour === jour) dernier.entrees.push(e)
    else jours.push({ jour, entrees: [e] })
  }

  return (
    <div className="flex flex-col gap-1.5">
      {jours.map((groupe) => (
        <div key={groupe.jour} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 px-0.5 pb-0.5 pt-2.5">
            <span className="rounded-md bg-navy-50 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.07em] text-navy-500">
              {groupe.jour}
            </span>
            <div className="h-[1.5px] flex-1 bg-kw-border" />
          </div>
          {groupe.entrees.map((e) => (
            <div key={e.id} className="flex gap-2 rounded-[11px] border border-kw-border bg-white px-2.5 py-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-500">
                <Pencil className="h-3 w-3" />
              </span>
              <div className="min-w-0 flex-1">
                <span className="mb-1 inline-block rounded-md bg-navy-50 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.06em] text-navy-500">
                  {libelleChamp(e.champ)}
                </span>
                <p className="text-[11px] leading-snug text-navy-700">
                  <span className="text-navy-400 line-through">{valeurLisible(e.ancienne_valeur)}</span>
                  {' → '}
                  <span className="font-semibold">{valeurLisible(e.nouvelle_valeur)}</span>
                </p>
                <p className="mt-1 font-mono text-[9.5px] text-navy-400">
                  {new Date(e.date_modification).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  {' · '}
                  {e.modifie_par_nom ?? 'Kimatch'}
                </p>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* LA CRÉATION FERME LE FLUX. Elle n'est pas dans `historique_modifications` — le déclencheur
          n'y écrit que les mises à jour — et un flux qui commence dans le vide se lit mal. */}
      <div className="flex items-center gap-2 px-0.5 pb-0.5 pt-2.5">
        <span className="rounded-md bg-navy-50 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.07em] text-navy-500">
          {libelleJour(dateCreation)}
        </span>
        <div className="h-[1.5px] flex-1 bg-kw-border" />
      </div>
      <div className={cn('flex gap-2 rounded-[11px] border border-opp-200 bg-opp-50/60 px-2.5 py-2')}>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-opp-600 to-opp-400 text-white">
          <Sparkle className="h-3 w-3" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold leading-snug text-navy-800">Opportunité créée</p>
          <p className="mt-1 font-mono text-[9.5px] text-navy-400">
            {new Date(dateCreation).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    </div>
  )
}
