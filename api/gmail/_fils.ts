import type { SupabaseClient } from '@supabase/supabase-js'
import { filGmailDuMessageId, ErreurLectureGmail } from './_client.js'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * TRADUIRE LES FILS REPRIS DE SALESFORCE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 17/09/2026 : « c'est quoi le rattrapage des conversations, c'est un import de 1 082
 * conversations ? » Non — et le nom que j'employais était trompeur. RIEN N'EST IMPORTÉ.
 *
 * 1 593 mails déjà présents portent l'identifiant de LEUR MESSAGE (`<CAGtyFLx…@mail.gmail.com>`)
 * au lieu de l'identifiant de LEUR CONVERSATION chez Gmail (`1a0aadbdce8fcc30`). Le rapatriement
 * horaire les écarte donc explicitement : il ne saurait pas quoi demander. Résultat, les réponses
 * des clients à ces mails-là ne remontent jamais.
 *
 * On traduit un identifiant en l'autre, une fois. Ce qui est déjà là devient raccordé.
 *
 * ══ POURQUOI GREFFÉ SUR LE RAPATRIEMENT, ET NON UNE TÂCHE DE PLUS ═══════════════════════════
 *
 * Le rapatriement passe déjà toutes les heures sur chaque boîte, avec un jeton frais en main. Une
 * tâche séparée aurait refait ce travail — parcourir les jetons, les rafraîchir, gérer les refus —
 * pour le même résultat, et il aurait fallu l'arrêter une fois terminée. Greffée, la traduction
 * avance d'un lot par heure et par personne, puis ne coûte plus qu'une requête le jour où il ne
 * reste rien.
 *
 * ══ POURQUOI UN PETIT LOT ═══════════════════════════════════════════════════════════════════
 *
 * Une recherche Gmail par fil, et une fonction Vercel ne tourne pas indéfiniment. Trente par
 * personne et par heure donnent ~270 par heure à neuf : tout est traduit en une demi-journée, sans
 * jamais approcher la limite de temps ni celle du quota Gmail.
 */

const PAR_PERSONNE_ET_PAR_PASSAGE = 30

export interface BilanFils {
  tentes: number
  traduits: number
  introuvables: number
  droitRefuse: boolean
}

/**
 * Traduit quelques fils de cette personne. Ne lève jamais : un échec de traduction ne doit pas
 * empêcher le rapatriement des réponses, qui est le travail principal de la tâche horaire.
 */
export async function traduireQuelquesFils(
  admin: SupabaseClient,
  accessToken: string,
  profilId: string,
  journal: (m: string) => void,
): Promise<BilanFils> {
  const bilan: BilanFils = { tentes: 0, traduits: 0, introuvables: 0, droitRefuse: false }

  /* LES FILS DE CETTE PERSONNE. Un Message-ID ne se trouve que dans une boîte qui contient le
     message : on cherche donc chez l'AUTEUR du mail, seul à l'avoir dans ses « Envoyés ». */
  const { data, error } = await admin
    .from('interactions')
    .select('fil_discussion')
    .eq('auteur_profil_id', profilId)
    .like('fil_discussion', '<%')
    .limit(400)
  if (error || !data || data.length === 0) return bilan

  /* UN FIL PORTE SOUVENT PLUSIEURS MESSAGES. On dédoublonne avant de chercher, sinon on paie
     plusieurs recherches Gmail pour une seule conversation. */
  const fils = [...new Set(data.map((l) => l.fil_discussion as string))].slice(0, PAR_PERSONNE_ET_PAR_PASSAGE)

  for (const fil of fils) {
    bilan.tentes++
    let threadId: string | null
    try {
      threadId = await filGmailDuMessageId(accessToken, fil)
    } catch (e) {
      /* 403 = la connexion n'accorde pas la lecture. Inutile d'essayer les vingt-neuf suivants :
         ils échoueront tous pareil, et on aurait brûlé le quota pour rien. */
      if (e instanceof ErreurLectureGmail && (e.statut === 403 || e.statut === 401)) {
        bilan.droitRefuse = true
        break
      }
      journal(`fil ${fil.slice(0, 40)} : ${e instanceof Error ? e.message : 'erreur'}`)
      continue
    }

    if (!threadId) {
      /* INTROUVABLE N'EST PAS UNE PANNE : le message peut avoir été supprimé, ou appartenir à une
         autre boîte. On le laisse tel quel — le retenter demain ne coûte presque rien, et
         l'effacer ferait perdre la seule trace de la conversation d'origine. */
      bilan.introuvables++
      continue
    }

    /* L'ANCIEN IDENTIFIANT EST CONSERVÉ avant d'être remplacé. Si une recherche se trompait de
       message — deux mails au même objet, un transfert — on peut revenir en arrière. */
    const { error: err } = await admin
      .from('interactions')
      .update({ fil_origine_salesforce: fil, fil_discussion: threadId })
      .eq('fil_discussion', fil)
    if (err) { journal(`écriture ${fil.slice(0, 40)} : ${err.message}`); continue }
    bilan.traduits++
  }

  return bilan
}
