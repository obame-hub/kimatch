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
/** Ce qui suffit à reconnaître deux fois la même personne. Exporté pour être testable seul. */
export interface PisteConnue {
  id: string
  reference: string
  email: string | null
  telephone: string | null
  contact_nom: string | null
  societe: string | null
  source_externe_id: string | null
}

const neufDerniers = (t: string | null | undefined): string => (t ?? '').replace(/\D/g, '').slice(-9)
const pareil = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const x = (a ?? '').trim().toLowerCase()
  return x.length > 0 && x === (b ?? '').trim().toLowerCase()
}

/**
 * ══ EST-CE QUELQU'UN QU'ON CONNAÎT DÉJÀ ? ══
 *
 * L'E-MAIL SUFFIT. Deux personnes ne partagent pas une adresse ; si elle correspond, c'est la même.
 *
 * LE TÉLÉPHONE NE SUFFIT PAS, et la vérification du 16/09 l'a prouvé : deux leads d'essai portaient
 * tous deux `06 12 34 56 78`, avec des noms et des sociétés différents. Les confondre aurait fait
 * REFUSER un vrai lead en croyant le connaître — une piste jamais créée ne se remarque pas, ce qui
 * est pire qu'un doublon. On exige donc, pour un appariement par téléphone, que le nom du contact
 * ou la société concorde aussi. Un standard de syndic partagé par dix copropriétés ne suffit pas.
 *
 * LE FILTRE FINAL SE FAIT ICI, pas dans la requête : PostgREST ne sait pas exprimer « ceci OU (cela
 * ET (ceci OU cela)) » sans devenir illisible. On rapatrie une poignée de candidats et on tranche
 * dans du code qu'un test peut lire.
 */
export function choisirLaMemePersonne(
  candidats: PisteConnue[],
  lead: { email: string | null; telephone: string | null; contactNom: string | null; societe: string | null },
): PisteConnue | null {
  const tel = neufDerniers(lead.telephone)
  for (const c of candidats) {
    if (pareil(c.email, lead.email)) return c
    if (tel.length === 9 && neufDerniers(c.telephone) === tel
        && (pareil(c.contact_nom, lead.contactNom) || pareil(c.societe, lead.societe))) {
      return c
    }
  }
  return null
}

async function chercherLaMemePersonne(
  admin: SupabaseClient,
  lead: { email: string | null; telephone: string | null; contactNom: string | null; societe: string | null },
): Promise<PisteConnue | null> {
  const tel = neufDerniers(lead.telephone)
  const critere = [
    lead.email ? `email.ilike.${lead.email}` : null,
    tel.length === 9 ? `telephone.ilike.%${tel}` : null,
  ].filter(Boolean).join(',')
  if (!critere) return null

  const { data } = await admin
    .from('pistes')
    .select('id, reference, email, telephone, contact_nom, societe, source_externe_id')
    .or(critere)
    .order('date_creation', { ascending: true })
    .limit(10)
  return choisirLaMemePersonne((data ?? []) as unknown as PisteConnue[], lead)
}

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

  /* ══ LA MÊME PERSONNE EXISTE-T-ELLE DÉJÀ, VENUE D'AILLEURS ? ══
   *
   * 16/09/2026, 4 h 50 : la relecture du canal a créé 93 pistes, dont 64 doublaient une piste déjà
   * présente — les mêmes prospects, arrivés par l'import Salesforce. Des commerciaux allaient
   * rappeler des gens déjà en cours.
   *
   * LA CAUSE ÉTAIT ICI. `source_externe_id` rend l'opération idempotente pour UN MESSAGE SLACK —
   * rejouer le même message ne crée rien deux fois. Mais les pistes venues de Salesforce n'ont pas
   * d'horodatage Slack : pour cette clé, elles n'existaient pas. Une clé d'idempotence ne protège
   * que des rejeux de sa propre source ; elle ne dit rien de ce qui est entré par une autre porte.
   *
   * ON COMPARE DONC AUSSI LA PERSONNE : e-mail identique, ou neuf derniers chiffres du téléphone —
   * la même règle que le webhook Allo, qui doit reconnaître un numéro écrit de six façons.
   *
   * ET ON MARQUE LA PISTE TROUVÉE avec l'horodatage du message. Sans ça, la relecture de demain
   * retrouverait le même message, referait la même recherche, et le canal serait relu en pure perte
   * chaque nuit. */
  const memePersonne = await chercherLaMemePersonne(admin, lead)
  if (memePersonne) {
    if (!memePersonne.source_externe_id) {
      await admin.from('pistes').update({ source_externe_id: ts }).eq('id', memePersonne.id)
    }
    return { etat: 'deja', id: memePersonne.id, reference: memePersonne.reference }
  }

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
