/**
 * ══ CE QU'ANTHROPIC RÉPOND QUAND ÇA NE MARCHE PAS, DIT EN FRANÇAIS ET EN ACTIONNABLE ══
 *
 * William, 24/09/2026, en déposant une facture : « j'ai un message m'indiquant "your credit balance
 * is too low to access the Anthropic API" ».
 *
 * Le message était juste — le compte n'avait plus de crédit — mais il était en anglais, technique,
 * et surtout il ne disait pas QUOI FAIRE. Un commercial qui le lit au milieu d'une création de
 * compteur ne peut qu'en conclure que Kimatch est cassé.
 *
 * ON NE TRADUIT QUE CE QU'ON RECONNAÎT. Les autres messages passent tels quels : une erreur
 * inconnue mal reformulée est pire qu'une erreur brute, parce qu'elle envoie chercher au mauvais
 * endroit. Les deux points d'entrée qui appellent Anthropic — l'extraction de facture et l'avis du
 * cockpit — partagent cette lecture : ils tombent en panne ensemble, pour les mêmes raisons.
 */
export function messageAnthropicLisible(statut: number, brut: string | undefined): string {
  const m = (brut ?? '').toLowerCase()

  if (m.includes('credit balance is too low') || m.includes('insufficient') || m.includes('quota')) {
    return 'Le compte Anthropic n’a plus de crédit. Rechargez-le sur console.anthropic.com, '
      + 'rubrique Billing — la lecture de facture et l’avis du cockpit repartiront aussitôt.'
  }
  if (statut === 401 || m.includes('invalid x-api-key') || m.includes('authentication')) {
    return 'La clé Anthropic est refusée : elle a été révoquée, ou recopiée de travers dans les '
      + 'variables d’environnement du serveur.'
  }
  if (statut === 429 || m.includes('rate limit')) {
    return 'Trop de demandes à la fois. Réessayez dans un instant.'
  }
  if (statut === 529 || m.includes('overloaded')) {
    return 'Le service Anthropic est saturé en ce moment. Réessayez dans un instant.'
  }
  return brut ?? `Erreur Anthropic (${statut})`
}
