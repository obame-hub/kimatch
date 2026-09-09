import { useState } from 'react'
import type { Mandat } from '@/types/domain'
import { FriseJalons, contexteDe, type Jalon } from '@/components/parcours/FriseJalons'
import {
  PictoAnnule,
  PictoBrouillon,
  PictoConsulte,
  PictoEnvoye,
  PictoExpire,
  PictoMandat,
  PictoRefuse,
} from './pictos'

/**
 * ══ LE CHEMIN DE CONVERSION D'UN MANDAT ══
 *
 * LE DESSIN DE LA FRISE A ÉTÉ EXTRAIT dans `@/components/parcours/FriseJalons` le 09/09/2026, pour
 * que le contrat puisse l'utiliser sans le recopier — William demandait ce jour-là « inspire-toi de
 * ce que j'ai fait sur mon mandat pour récupérer le design », et signalait par ailleurs un
 * composant DocuSign dupliqué entre les deux objets. Une seconde copie du même dessin aurait
 * produit la même remarque une semaine plus tard.
 *
 * CE FICHIER GARDE CE QUI EST PROPRE AU MANDAT : quels jalons il a, ce qui les rend franchis, son
 * badge de vie, et son bouton de copie d'enveloppe. Rien de tout cela n'est partageable — un
 * contrat a six jalons et les déduit d'autres colonnes.
 *
 * Maquette de William, 08/09/2026. Quatre jalons dans le cas nominal — Brouillon, Envoyé, Consulté,
 * Actif — et une cinquième, Expiré, qui n'apparaît que lorsqu'elle a un sens.
 *
 * ── IL RESTE EN PLEINE LARGEUR, EN TÊTE DE VOLET ──
 *
 * Il a été passé à la verticale le 09/09/2026, sur un malentendu : c'était la frise de VALIDITÉ que
 * William voulait voir rejoindre la rangée des cartes d'identité, pas celle-ci. « Le parcours était
 * parfait tout en haut, il ne fallait surtout pas y toucher. » La forme horizontale est rétablie —
 * et elle est la bonne : sur un quart de largeur, « Brouillon » et « Consulté » se coupaient en deux
 * lignes sous une date en chasse fixe.
 *
 * ── POURQUOI DES STYLES EN LIGNE ICI, ALORS QUE TOUT LE RESTE EST EN TAILWIND ──
 *
 * Le handoff est explicite : « les valeurs numériques et hexadécimales doivent être respectées
 * exactement ». Plusieurs n'ont pas d'équivalent dans l'échelle du projet — un dégradé à cinq
 * paliers, des nœuds de 26 et 30 px, un interlettrage `-.01em`. Les exprimer en classes obligerait à
 * arrondir, ou à étendre la configuration de jetons qui ne serviraient qu'ici.
 *
 * ── CE QUI EST FRANCHI, ET COMMENT ON LE SAIT ──
 *
 * Pas par comparaison d'ordre dans le référentiel : un mandat REFUSÉ a forcément été envoyé, alors
 * que son ordre (65) est supérieur à celui d'ACTIF (50). Chaque jalon dit donc lui-même ce qui le
 * rend franchi — une date observée, ou un statut qui l'implique.
 *
 * UN JALON FRANCHI SANS DATE RESTE FRANCHI, en gras, sans ligne de date. Le cas se produit sur les
 * 1 380 mandats antérieurs au suivi du parcours, et sur ceux validés à la main : leur signature est
 * un fait, l'heure de leur consultation n'a jamais été observée. Inventer un horodatage serait pire
 * que la ligne vide.
 */

export function jalonsDuMandat(mandat: Mandat): Jalon[] {
  const statut = mandat.statut ?? ''
  const finies = ['ACTIF', 'EXPIRE', 'REFUSE', 'ANNULE']
  const envoye = Boolean(mandat.date_envoi) || ['ENVOYE', 'CONSULTE', ...finies].includes(statut)
  // Une consultation ne se déduit pas d'un refus : le signataire peut refuser sans ouvrir.
  const consulte = Boolean(mandat.date_consultation) || ['CONSULTE', 'ACTIF', 'EXPIRE'].includes(statut)

  const jalons: Jalon[] = [
    {
      cle: 'brouillon',
      libelle: 'Brouillon',
      picto: PictoBrouillon,
      franchi: true,
      date: mandat.date_creation ?? null,
      contexte: contexteDe(mandat.date_creation),
    },
    {
      cle: 'envoye',
      libelle: 'Envoyé',
      picto: PictoEnvoye,
      franchi: envoye,
      date: mandat.date_envoi,
      contexte: contexteDe(mandat.date_envoi),
    },
    {
      cle: 'consulte',
      libelle: 'Consulté',
      picto: PictoConsulte,
      franchi: consulte,
      date: mandat.date_consultation ?? null,
      contexte: contexteDe(
        mandat.date_consultation,
        // `null` et 0 ne disent pas la même chose : sans relevé, on n'écrit rien.
        mandat.nb_ouvertures ? `ouvert ${mandat.nb_ouvertures} fois` : null,
      ),
    },
  ]

  /* LA QUATRIÈME ÉTAPE CHANGE DE NATURE selon l'issue. Une seule des trois s'affiche : montrer
     « Refusé » en gris à côté d'« Actif » dessinerait deux avenirs pour un mandat qui n'en a qu'un. */
  if (statut === 'REFUSE') {
    jalons.push({
      cle: 'refuse',
      libelle: 'Refusé',
      picto: PictoRefuse,
      franchi: true,
      couleur: '#c2452d',
      // Aucune colonne ne porte la date de refus : on affiche le motif, qui est l'information utile,
      // plutôt qu'une date de modification qui bougerait à la prochaine retouche de la fiche.
      date: null,
      contexte: mandat.motif_refus ?? null,
    })
  } else if (statut === 'ANNULE') {
    jalons.push({
      cle: 'annule',
      libelle: 'Annulé',
      picto: PictoAnnule,
      franchi: true,
      couleur: '#83868f',
      date: null,
      contexte: 'par l’expéditeur',
    })
  } else {
    jalons.push({
      cle: 'actif',
      libelle: 'Actif',
      picto: PictoMandat,
      franchi: ['ACTIF', 'EXPIRE'].includes(statut),
      couleur: '#0d7a5f',
      date: mandat.date_signature,
      contexte: contexteDe(mandat.date_signature, 'signature du mandat'),
    })

    /* EXPIRÉ N'EST PAS UNE ISSUE, C'EST UNE SUITE : le mandat a bien été actif, l'étape a eu lieu.
       Elle n'apparaît donc qu'après elle, et « Actif » reste vert. */
    const fin = mandat.date_fin_validite
    const perime = Boolean(fin) && (fin as string) < new Date().toISOString().slice(0, 10)
    if (statut === 'EXPIRE' || (statut === 'ACTIF' && perime)) {
      jalons.push({
        cle: 'expire',
        libelle: 'Expiré',
        picto: PictoExpire,
        franchi: true,
        couleur: '#6d7078',
        date: fin,
        contexte: 'fin de validité',
      })
    }
  }

  return jalons
}

/** Le badge de vie — calculé, jamais saisi. */
export function badgeVie(mandat: Mandat): { texte: string; couleur: string; fond: string; bordure: string } {
  const statut = mandat.statut ?? ''
  if (statut === 'REFUSE') return { texte: 'REFUSÉ', couleur: '#c2452d', fond: '#fbeae5', bordure: '#eed7cd' }
  if (statut === 'ANNULE') return { texte: 'ANNULÉ', couleur: '#5c5f66', fond: '#f0efec', bordure: '#e0dfdb' }
  const fin = mandat.date_fin_validite
  const perime = Boolean(fin) && (fin as string) < new Date().toISOString().slice(0, 10)
  if (statut === 'EXPIRE' || perime) {
    return { texte: 'EXPIRÉ — INACTIF', couleur: '#5c5f66', fond: '#f0efec', bordure: '#dcdad5' }
  }
  if (statut === 'ACTIF') return { texte: 'ACTIF', couleur: '#0d7a5f', fond: '#eaf4f0', bordure: '#d3e5de' }
  return { texte: 'EN ATTENTE DE SIGNATURE', couleur: '#b57a24', fond: '#fdf9f0', bordure: '#f0e4cd' }
}

export function CheminConversion({
  mandat,
  onCopie,
}: {
  mandat: Mandat
  onCopie: (message: string) => void
}) {
  const [copie, setCopie] = useState(false)
  const jalons = jalonsDuMandat(mandat)
  const badge = badgeVie(mandat)

  return (
    <div style={{ background: '#fff', border: '1px solid #e7e6e2', borderRadius: 13, padding: '14px 24px 16px' }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
        <span
          className="uppercase"
          style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', color: '#a3a5a0' }}
        >
          Chemin de conversion
        </span>
        <span className="flex-1" />

        {mandat.docusign_envelope_id && (
          <button
            type="button"
            title="Copier l’ID d’enveloppe DocuSign"
            onClick={() => {
              void navigator.clipboard.writeText(mandat.docusign_envelope_id as string)
              setCopie(true)
              onCopie('⧉ Copié')
              window.setTimeout(() => setCopie(false), 1200)
            }}
            className="font-mono transition-colors"
            style={{
              fontSize: 9.5,
              color: copie ? '#16181d' : '#83868f',
              background: copie ? '#eceae6' : '#f6f6f4',
              borderRadius: 5,
              padding: '3px 8px',
              cursor: 'copy',
            }}
          >
            {mandat.docusign_envelope_id.slice(0, 18).toUpperCase()} ⧉
          </button>
        )}

        <span
          style={{
            fontSize: 8.5,
            fontWeight: 800,
            letterSpacing: '.05em',
            borderRadius: 11,
            padding: '2px 9px',
            color: badge.couleur,
            background: badge.fond,
            border: `1px solid ${badge.bordure}`,
          }}
        >
          {badge.texte}
        </span>
      </div>

      <FriseJalons jalons={jalons} />
    </div>
  )
}
