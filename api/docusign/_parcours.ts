/**
 * ══ CE QUE L'ENVELOPPE RACONTE DE SON PARCOURS ══
 *
 * William, 08/09/2026 : « il faut que le webhook aille chercher ces infos et les remonte. » Le
 * chemin de conversion du mandat affiche, sous le jalon « Consulté », l'heure de première ouverture
 * et le nombre de consultations ; sous « Refusé », le motif. DocuSign les connaît tous les trois,
 * Kimatch n'en gardait aucun.
 *
 * ── DEUX SOURCES, PARCE QU'ELLES NE DISENT PAS LA MÊME CHOSE ──
 *
 * `/recipients` donne l'état de chaque destinataire : `deliveredDateTime` — l'instant où il a OUVERT
 * l'enveloppe, pas celui où le courriel est parti — et `declinedReason`, le motif qu'il a saisi en
 * refusant. Ce sont des faits que DocuSign tient à jour, et c'est l'appel qui fait foi.
 *
 * `/audit_events` est la piste d'audit complète. C'est le SEUL endroit où le nombre de consultations
 * se lit : l'état d'enveloppe passe à « delivered » à la première ouverture et n'en rebouge plus, si
 * bien que compter les notifications reçues donnerait toujours un. On y compte les entrées de
 * consultation.
 *
 * ── LES DEUX APPELS SONT FACULTATIFS, ET C'EST VOULU ──
 *
 * Ils enrichissent un affichage ; ils ne conditionnent rien. Une panne de l'un ou l'autre ne doit
 * pas empêcher un mandat de passer à « Actif » ni son PDF d'être archivé — le webhook doit répondre
 * à DocuSign, sans quoi DocuSign réessaie indéfiniment. Chaque lecture est donc encapsulée et rend
 * `null` en cas d'échec, ce que la base sait représenter : `nb_ouvertures` nul veut dire « DocuSign
 * n'a pas répondu », jamais « zéro ouverture ».
 */

type Session = { base_uri: string; account_id: string; access_token: string }

export interface ParcoursEnveloppe {
  /** Première ouverture par le destinataire. `null` s'il n'a pas encore ouvert. */
  dateConsultation: string | null
  /** Nombre de consultations relevées dans la piste d'audit. `null` si illisible. */
  nbOuvertures: number | null
  /** Motif saisi au refus. `null` s'il n'y a pas de refus, ou pas de motif. */
  motifRefus: string | null
}

async function lireJson(session: Session, chemin: string): Promise<unknown | null> {
  try {
    const res = await fetch(
      `${session.base_uri}/restapi/v2.1/accounts/${session.account_id}/${chemin}`,
      { headers: { Authorization: `Bearer ${session.access_token}` } },
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Le nombre de fois que l'enveloppe a été consultée.
 *
 * La piste d'audit est une liste d'événements décrits par des paires nom/valeur, et le libellé de
 * l'action arrive sous `Message` — en anglais, quelle que soit la langue du compte. On cherche donc
 * « viewed », qui couvre « Viewed » et « Envelope Viewed » sans dépendre de leur formulation exacte.
 *
 * Un nombre qu'on ne sait pas lire vaut `null`, pas zéro : le rail affiche alors l'heure seule, ce
 * qui est vrai, plutôt que « ouvert 0 fois », qui serait faux puisqu'on est justement dans le cas où
 * quelqu'un vient d'ouvrir.
 */
function compterConsultations(auditBrut: unknown): number | null {
  const audit = auditBrut as { auditEvents?: { eventFields?: { name?: string; value?: string }[] }[] } | null
  if (!audit?.auditEvents) return null
  let n = 0
  for (const evenement of audit.auditEvents) {
    const message = evenement.eventFields?.find((c) => c.name === 'Message')?.value ?? ''
    if (message.toLowerCase().includes('viewed')) n += 1
  }
  return n > 0 ? n : null
}

export async function lireParcoursEnveloppe(
  session: Session,
  envelopeId: string,
): Promise<ParcoursEnveloppe> {
  const [destinatairesBrut, auditBrut] = await Promise.all([
    lireJson(session, `envelopes/${envelopeId}/recipients`),
    lireJson(session, `envelopes/${envelopeId}/audit_events`),
  ])

  const destinataires = destinatairesBrut as {
    signers?: { deliveredDateTime?: string; declinedReason?: string }[]
  } | null

  // Un mandat n'a qu'un signataire chez Kiwee, mais l'API rend une liste : on prend la première
  // ouverture constatée et le premier motif saisi, ce qui reste juste s'il y en avait plusieurs.
  const signataires = destinataires?.signers ?? []
  const ouvertures = signataires
    .map((s) => s.deliveredDateTime)
    .filter((d): d is string => Boolean(d))
    .sort()
  const motif = signataires.map((s) => s.declinedReason).find((m) => m && m.trim())

  return {
    dateConsultation: ouvertures[0] ?? null,
    nbOuvertures: compterConsultations(auditBrut),
    motifRefus: motif?.trim() ?? null,
  }
}
