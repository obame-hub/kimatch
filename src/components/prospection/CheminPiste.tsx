import type { Piste } from '@/types/domain'
import { FriseJalons, contexteDe, type Jalon } from '@/components/parcours/FriseJalons'
import {
  PictoContact,
  PictoFacture,
  PictoLoupe,
  PictoRefuse,
  PictoValide,
} from '@/components/mandat/pictos'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE CHEMIN D'UNE PISTE — LA FRISE DU MANDAT, PAS UNE AUTRE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 16/09/2026 : « tu dois reprendre le format de chemin présent sur le mandat par exemple…
 * là c'est une toute nouvelle frise et c'est pas ce que je veux ».
 *
 * Il avait raison sur le fond : j'avais dessiné une quatrième frise. Kimatch en avait déjà deux de
 * trop avant que le mandat et le contrat ne soient réunis dans `FriseJalons` — c'est le composant
 * qui sert les deux, et c'est celui-ci. Ce fichier ne dessine rien : il dit seulement QUELS jalons
 * une piste a, et ce qui les rend franchis.
 *
 * ══ IL EST EN TÊTE DU VOLET DE GAUCHE, COMME CELUI DU MANDAT ══
 *
 * William, 16/09/2026 : « attention, le chemin doit être dans le volet de gauche, pas dans le
 * header ». Je l'avais mis sous la ligne d'identité pour qu'il survive au changement d'onglet ; il
 * y prenait la place du tiroir du parc, et faisait du bandeau du compte — qu'on venait de reprendre
 * à l'identique — quelque chose d'autre.
 *
 * LE PRIX EST ASSUMÉ : on ne le voit plus depuis les onglets Fichiers ou Historique. C'est ce que
 * fait le mandat, dont le chemin de conversion vit dans son premier onglet et nulle part ailleurs —
 * et c'est là qu'on le cherche, puisque c'est l'onglet où l'on travaille la piste.
 *
 * ══ QUATRE JALONS, JAMAIS CINQ ══
 *
 * William, 15/09/2026 : « Nouvelle > En cours de qualification > En attente de facture > Convertie
 * (vert) ou Disqualifiée (rouge) ». Convertie et Disqualifiée sont deux ISSUES du même parcours, pas
 * deux étapes qui se suivent : le quatrième jalon est l'un OU l'autre. C'est exactement la règle du
 * mandat, dont la quatrième étape est Actif, Refusé ou Annulé selon ce qui s'est passé.
 *
 * ══ CE QUI EST FRANCHI, ET COMMENT ON LE SAIT ══
 *
 * Par le rang dans le parcours, et c'est légitime ici — contrairement au mandat, où REFUSÉ porte un
 * ordre supérieur à ACTIF. Les trois états de travail d'une piste sont un vrai escalier : on ne peut
 * pas attendre une facture sans avoir qualifié. Les deux issues, elles, ne se déduisent pas d'un
 * rang : elles se lisent sur le statut lui-même.
 *
 * ══ LES DATES QU'ON A, ET CELLES QU'ON N'INVENTE PAS ══
 *
 * `pistes` ne date pas ses changements de statut. Deux jalons ont donc une date vraie — la création,
 * et le premier contact qui ouvre la qualification — les deux autres n'en ont aucune. La frise sait
 * déjà l'afficher : franchi, en gras, sans ligne de date. Inventer un horodatage serait pire que la
 * ligne vide.
 *
 * ══ LES TROIS PREMIERS SE CLIQUENT, LES DEUX ISSUES NON ══
 *
 * On avance et on recule d'un clic entre les états de travail : se tromper d'étape arrive, et rien
 * ne justifie d'ouvrir un menu pour le corriger.
 *
 * MAIS « CONVERTIE » NE S'ATTEINT PAS D'UN CLIC : elle se gagne en créant l'opportunité, et la base
 * l'écrit alors elle-même. Et « Disqualifiée » réclame son motif — Naoëlle, 01/09/2026 : « mettre un
 * commentaire pour disqualifié » — donc elle passe par le menu qui le demande. Un nœud qui
 * promettrait une action qu'il ne fait pas serait pire qu'un nœud inerte.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Les trois états de travail, dans l'ordre. L'issue est calculée à part. */
const ETAPES_TRAVAIL = [
  { code: 'NOUVELLE', libelle: 'Nouvelle', picto: PictoContact },
  { code: 'EN_QUALIFICATION', libelle: 'En cours de qualification', picto: PictoLoupe },
  { code: 'EN_ATTENTE_FACTURE', libelle: 'En attente de facture', picto: PictoFacture },
] as const

/** Le vert des actions positives (`--km-green`) et le rouge des refus, déjà celui du mandat. */
const VERT_CONVERTIE = '#0d7a5f'
const ROUGE_DISQUALIFIEE = '#c2452d'

/** Le premier geste vers la piste : c'est lui qui a ouvert la qualification. */
function premierContact(piste: Piste): string | null {
  const dates = [piste.date_premier_appel, piste.date_premier_email].filter(Boolean) as string[]
  if (dates.length === 0) return null
  return dates.sort()[0]
}

function jalonsDeLaPiste(
  piste: Piste,
  action?: { peutModifier: boolean; enCours?: boolean; onChoisir: (code: string) => void },
): Jalon[] {
  const courant = piste.statut_code ?? 'NOUVELLE'
  const disqualifiee = courant === 'DISQUALIFIEE'
  const convertie = courant === 'CONVERTIE'
  const close = disqualifiee || convertie

  /* Sur une piste close, les trois états de travail sont tous derrière : on les montre franchis
     plutôt que d'en désigner un au hasard. */
  const rang = close ? ETAPES_TRAVAIL.length : ETAPES_TRAVAIL.findIndex((e) => e.code === courant)

  const contact = premierContact(piste)

  const jalons: Jalon[] = ETAPES_TRAVAIL.map((etape, i) => {
    const franchi = rang >= 0 && i <= rang
    const date = i === 0 ? piste.date_creation ?? null : i === 1 && franchi ? contact : null
    const cliquable = Boolean(action?.peutModifier && !action?.enCours && !close && i !== rang)
    return {
      cle: etape.code,
      libelle: etape.libelle,
      picto: etape.picto,
      franchi,
      date,
      contexte: contexteDe(date),
      onChoisir: cliquable ? () => action?.onChoisir(etape.code) : undefined,
      titre: cliquable
        ? `Passer la piste à « ${etape.libelle} »`
        : i === rang && !close
          ? `Statut actuel : ${etape.libelle}`
          : etape.libelle,
    }
  })

  jalons.push(
    disqualifiee
      ? {
          cle: 'DISQUALIFIEE',
          libelle: 'Disqualifiée',
          picto: PictoRefuse,
          franchi: true,
          couleur: ROUGE_DISQUALIFIEE,
          /* Aucune colonne ne date la disqualification : on affiche le motif, qui est l'information
             utile, plutôt qu'une date de modification qui bougerait à la prochaine retouche. */
          date: null,
          contexte: piste.motif_disqualification ?? null,
          titre: 'Piste écartée',
        }
      : {
          cle: 'CONVERTIE',
          libelle: 'Convertie',
          picto: PictoValide,
          franchi: convertie,
          couleur: convertie ? VERT_CONVERTIE : undefined,
          date: null,
          contexte: convertie ? 'opportunité créée' : null,
          titre: convertie
            ? 'Cette piste a produit son opportunité'
            : 'Convertie s’obtient en créant l’opportunité ; Disqualifiée passe par le menu, qui demande son motif.',
        },
  )

  return jalons
}

export function CheminPiste({
  piste,
  peutModifier,
  onChoisir,
  enCours,
}: {
  piste: Piste
  peutModifier: boolean
  onChoisir: (code: string) => void
  enCours?: boolean
}) {
  /* LA MÊME BOÎTE QUE SUR LE MANDAT : carte blanche, bord `#e7e6e2`, rayon 13. Les valeurs sont
     reprises au chiffre près — c'est ce qui fait qu'on reconnaît un parcours d'un objet à l'autre.

     ══ SANS INTITULÉ, ET C'EST CE QUI PERMET LE CENTRAGE ══

     William, 16/09/2026 : « supprime le texte "Chemin de la piste" pour permettre au chemin d'être
     repositionné avec un centrage vertical parfait ». Le mandat garde le sien parce que sa carte
     porte aussi un badge de vie et l'ID d'enveloppe : il y a une ligne d'en-tête à nommer. Ici il
     n'y avait que l'étiquette, au-dessus d'une frise qui se désigne toute seule — quatre nœuds et
     leurs libellés ne se confondent avec rien.

     LE CREUX EST DONC SYMÉTRIQUE, 14 px en haut comme en bas, et la frise ne porte plus de marge
     verticale propre : ce sont les deux conditions pour que le bloc soit réellement centré et pas
     seulement posé haut. */
  return (
    <div style={{ background: '#fff', border: '1px solid #e7e6e2', borderRadius: 13, padding: '14px 24px' }}>
      <FriseJalons compact jalons={jalonsDeLaPiste(piste, { peutModifier, enCours, onChoisir })} />
    </div>
  )
}
