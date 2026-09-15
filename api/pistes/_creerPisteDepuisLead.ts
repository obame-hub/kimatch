import type { SupabaseClient } from '@supabase/supabase-js'
import { analyseLeadSlack, estUnLead } from './_analyseLeadSlack.js'

/**
 * ══ CRÉER LA PISTE D'UN LEAD ANNONCÉ DANS SLACK ══
 *
 * Deux chemins mènent ici et doivent se comporter à l'identique :
 *
 *   `api/slack/evenements.ts`       Slack prévient à la seconde où le message arrive — le chemin normal.
 *   `api/slack/rattraper-leads.ts`  relit le canal, pour l'historique et pour ce qu'un événement aurait manqué.
 *
 * Écrire la création deux fois, c'est se garantir qu'elles divergeront : un correctif appliqué d'un
 * côté, oublié de l'autre, et le rattrapage se mettrait à produire des pistes différentes de celles
 * du temps réel. Elle vit donc ici, une seule fois.
 */

/** Le propriétaire des leads du formulaire : 74 des 77 pistes de cette source sont à lui. */
const PROPRIETAIRE_PAR_DEFAUT_EMAIL = 'f.dubarry@kiwee-energie.fr'

/** La même valeur que les 77 pistes déjà en base, pour qu'un rapport n'ait pas deux lignes. */
const SOURCE = 'Google Ads sans facture (Inbound)'

export type Resultat =
  | { etat: 'cree'; id: string; reference: string }
  | { etat: 'deja'; id: string; reference: string }
  | { etat: 'ignore'; raison: string }
  | { etat: 'illisible'; manques: string[] }

/**
 * Lit le message, crée la piste, et dit lequel des quatre cas s'est produit.
 *
 * ELLE NE LÈVE PAS D'EXCEPTION POUR UN MESSAGE QUI N'EST PAS UN LEAD. Le canal reçoit aussi des
 * arrivées de membres et ce que les gens y écrivent ; en faire des erreurs remplirait les journaux
 * de pannes qui n'en sont pas, et on finirait par ne plus les lire.
 *
 * ELLE REFUSE EN REVANCHE DE CRÉER UN LEAD INCOMPLET. C'est le signal que le format du message a
 * changé, et le seul cas où l'on veut que ça crie — une piste à moitié remplie qu'on croirait
 * complète serait pire qu'un message d'erreur.
 */
export async function creerPisteDepuisLead(
  admin: SupabaseClient,
  texte: string,
  ts: string,
): Promise<Resultat> {
  if (!estUnLead(texte)) return { etat: 'ignore', raison: "Ce message n'annonce pas un lead" }

  const lead = analyseLeadSlack(texte)
  if (lead.manques.length > 0) return { etat: 'illisible', manques: lead.manques }

  const { data: deja } = await admin
    .from('pistes').select('id, reference').eq('source_externe_id', ts).maybeSingle()
  if (deja) return { etat: 'deja', id: deja.id as string, reference: deja.reference as string }

  const [{ data: proprietaire }, { data: statut }] = await Promise.all([
    admin.from('profils').select('id').eq('email', PROPRIETAIRE_PAR_DEFAUT_EMAIL).maybeSingle(),
    admin.from('statuts_pistes').select('id').eq('code', 'NOUVELLE').maybeSingle(),
  ])

  /* LE LOT DU PROPRIÉTAIRE, CELUI DE SON SEGMENT. Une piste sans lot n'est pas invisible, mais elle
     est hors plan de travail : personne ne la rencontre en déroulant sa liste. */
  let lotId: string | null = null
  if (proprietaire) {
    const court = lead.segment === 'Syndic professionnel' ? 'Syndics' : 'Entreprises'
    const { data: lots } = await admin
      .from('lots_prospection').select('id, nom').eq('proprietaire_id', proprietaire.id)
    const candidat = (lots ?? []).find((l) => String(l.nom).includes(`· ${court}`))
    lotId = candidat ? (candidat.id as string) : null
  }

  const { data: creee, error } = await admin
    .from('pistes')
    .insert({
      societe: lead.societe,
      contact_nom: lead.contactNom,
      prenom: lead.prenom,
      nom: lead.nom,
      email: lead.email,
      telephone: lead.telephone,
      segment: lead.segment,
      commentaire: lead.commentaire,
      source: SOURCE,
      statut_salesforce: 'Nouvelle',
      statut_id: statut?.id ?? null,
      proprietaire_id: proprietaire?.id ?? null,
      lot_id: lotId,
      actif: true,
      source_externe_id: ts,
    })
    .select('id, reference')
    .single()

  if (error) {
    /* L'unicité a joué entre la lecture et l'écriture. C'est le cas NORMAL quand Slack réessaie :
       il renvoie le même événement plusieurs fois si notre réponse tarde. Ce n'est pas une panne. */
    if (/duplicate key|unique/i.test(error.message)) {
      const { data: existante } = await admin
        .from('pistes').select('id, reference').eq('source_externe_id', ts).maybeSingle()
      if (existante) {
        return { etat: 'deja', id: existante.id as string, reference: existante.reference as string }
      }
    }
    throw new Error(error.message)
  }

  return { etat: 'cree', id: creee.id as string, reference: creee.reference as string }
}
