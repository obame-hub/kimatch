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
 * ══ ON CHERCHE DANS TOUTES LES BOÎTES, PAS SEULEMENT CHEZ L'AUTEUR — 20/09/2026 ══════════════
 *
 * Relevé du 20/09 : 982 fils sur 1 082 traduits, et les 100 derniers ARRÊTÉS POUR DE BON. La
 * version précédente ne cherchait un fil que chez son auteur — la boîte la plus probable, mais pas
 * la seule possible. Or 72 de ces fils N'ONT AUCUN AUTEUR : ni auteur, ni propriétaire, ni
 * créateur, les trois colonnes sont vides. Personne à qui les rattacher, donc aucune boîte où
 * chercher, donc jamais tentés — et ça n'aurait jamais changé. Les 28 restants, eux, étaient
 * retentés dans la même boîte à chaque passage horaire depuis le 17/09, sans succès et sans fin.
 *
 * Un fil se cherche désormais chez chacun, l'auteur d'abord quand il y en a un.
 * `gmail_fils_cherches` retient les couples (fil, boîte) déjà essayés : une recherche ne se refait
 * pas, et le jour où chaque fil restant a été cherché partout, plus rien n'est éligible — la
 * traduction s'éteint au lieu de tourner à vide pour toujours. Le rattrapage est borné : 100 fils
 * par 10 boîtes, quatre heures environ, puis plus rien.
 *
 * ══ POURQUOI UN PETIT LOT ═══════════════════════════════════════════════════════════════════
 *
 * Une recherche Gmail par fil, et une fonction Vercel ne tourne pas indéfiniment. Trente par
 * personne et par heure donnent ~270 par heure à neuf : tout est traduit en une demi-journée, sans
 * jamais approcher la limite de temps ni celle du quota Gmail.
 */

const PAR_PERSONNE_ET_PAR_PASSAGE = 30

/* Assez haut pour porter les 1 593 lignes du départ, et on se plaint si on le touche : une liste
   tronquée en silence laisserait des fils dehors sans que personne ne le sache. */
const PLAFOND_LECTURE = 5000

export interface BilanFils {
  tentes: number
  traduits: number
  introuvables: number
  droitRefuse: boolean
}

/**
 * Traduit quelques fils, cherchés dans la boîte de cette personne. Ne lève jamais : un échec de
 * traduction ne doit pas empêcher le rapatriement des réponses, qui est le travail principal de la
 * tâche horaire.
 */
export async function traduireQuelquesFils(
  admin: SupabaseClient,
  accessToken: string,
  profilId: string,
  journal: (m: string) => void,
): Promise<BilanFils> {
  const bilan: BilanFils = { tentes: 0, traduits: 0, introuvables: 0, droitRefuse: false }

  /* CE QU'ON A DÉJÀ CHERCHÉ DANS CETTE BOÎTE. Une recherche infructueuse ne se refait pas : c'est
     ce qui permet d'élargir à toutes les boîtes sans multiplier le coût par dix à chaque passage,
     et c'est ce qui fait que la file finit par se vider. */
  const { data: cherches, error: erreurCherches } = await admin
    .from('gmail_fils_cherches')
    .select('fil')
    .eq('profil_id', profilId)
    .limit(PLAFOND_LECTURE)
  if (erreurCherches) {
    /* Sans cette mémoire on rechercherait des fils déjà écartés — coûteux et sans résultat. On
       s'abstient pour ce passage plutôt que de repartir de zéro. */
    journal(`mémoire des recherches illisible : ${erreurCherches.message}`)
    return bilan
  }
  const dejaCherches = new Set((cherches ?? []).map((l) => l.fil as string))

  /* LES FILS ENCORE À TRADUIRE, DE TOUT LE MONDE. On ne filtre plus par auteur — c'était la cause
     du blocage — mais on retient qui en est l'auteur pour commencer par sa boîte, la plus
     probable : un fil trouvé du premier coup économise les neuf autres recherches. */
  const { data, error } = await admin
    .from('interactions')
    .select('fil_discussion, auteur_profil_id')
    .like('fil_discussion', '<%')
    .limit(PLAFOND_LECTURE)
  if (error || !data || data.length === 0) return bilan
  if (data.length === PLAFOND_LECTURE) journal(`plafond de lecture atteint (${PLAFOND_LECTURE} lignes)`)

  /* UN FIL PORTE SOUVENT PLUSIEURS MESSAGES. On dédoublonne avant de chercher, sinon on paie
     plusieurs recherches Gmail pour une seule conversation. */
  const sien = new Map<string, boolean>()
  for (const l of data) {
    const f = l.fil_discussion as string
    if (dejaCherches.has(f)) continue
    sien.set(f, (sien.get(f) ?? false) || l.auteur_profil_id === profilId)
  }
  if (sien.size === 0) return bilan

  const fils = [...sien.entries()]
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, PAR_PERSONNE_ET_PAR_PASSAGE)
    .map(([f]) => f)

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
      /* ON NE NOTE RIEN : une panne réseau n'est pas une réponse de Gmail. La noter ferait
         renoncer définitivement à un fil qui n'a, en fait, jamais été cherché. */
      journal(`fil ${fil.slice(0, 40)} : ${e instanceof Error ? e.message : 'erreur'}`)
      continue
    }

    if (!threadId) {
      /* INTROUVABLE DANS CETTE BOÎTE-LÀ, ce qui ne dit rien des autres : le message peut vivre
         chez un collègue, ou avoir été supprimé. On note la recherche pour ne pas la refaire, et
         les autres boîtes prennent le relais aux passages suivants. L'ancien identifiant reste en
         place — l'effacer ferait perdre la seule trace de la conversation d'origine. */
      bilan.introuvables++
      await noterLaRecherche(admin, fil, profilId, false, journal)
      continue
    }

    /* L'ANCIEN IDENTIFIANT EST CONSERVÉ avant d'être remplacé. Si une recherche se trompait de
       message — deux mails au même objet, un transfert — on peut revenir en arrière. */
    const { error: err } = await admin
      .from('interactions')
      .update({ fil_origine_salesforce: fil, fil_discussion: threadId })
      .eq('fil_discussion', fil)
    if (err) { journal(`écriture ${fil.slice(0, 40)} : ${err.message}`); continue }

    /* ══ LE FIL EST DANS CETTE BOÎTE : ELLE EN DEVIENT LE SUIVI ══
       Sans ça, traduire un fil orphelin n'aurait servi à rien. Le rapatriement horaire demande à
       Gmail les fils rattachés à la personne dont il tient le jeton ; un fil sans personne ne
       serait relu par aucune boîte et ses réponses resteraient dehors — le problème même qu'on
       vient de corriger, d'un cran plus loin.

       PROPRIÉTAIRE ET NON AUTEUR : on sait que la conversation est dans sa boîte, on ne sait pas
       qu'elle l'a écrite — elle a pu y être mise en copie. Le propriétaire dit qui suit l'échange,
       et ça, c'est vrai. On ne touche qu'aux lignes qui n'ont ni l'un ni l'autre. */
    const { error: errSuivi } = await admin
      .from('interactions')
      .update({ proprietaire_id: profilId })
      .eq('fil_origine_salesforce', fil)
      .is('auteur_profil_id', null)
      .is('proprietaire_id', null)
    if (errSuivi) journal(`suivi ${fil.slice(0, 40)} : ${errSuivi.message}`)

    await noterLaRecherche(admin, fil, profilId, true, journal)
    bilan.traduits++
  }

  return bilan
}

/**
 * Retient qu'on a cherché ce fil dans cette boîte.
 *
 * `ignoreDuplicates` parce que deux passages qui se chevauchent ne sont pas une anomalie : le
 * couple est déjà noté, c'est tout ce qu'on voulait.
 */
async function noterLaRecherche(
  admin: SupabaseClient,
  fil: string,
  profilId: string,
  trouve: boolean,
  journal: (m: string) => void,
): Promise<void> {
  const { error } = await admin
    .from('gmail_fils_cherches')
    .upsert({ fil, profil_id: profilId, trouve }, { onConflict: 'fil,profil_id', ignoreDuplicates: true })
  if (error) journal(`mémoire ${fil.slice(0, 40)} : ${error.message}`)
}
