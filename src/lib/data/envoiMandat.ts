import { useState } from 'react'
import { useCreateMandat, useMarkMandatEnvoye } from '@/lib/data/mandats'
import { sendMandatForSignature, DocusignNonConnecte } from '@/lib/data/docusign'
import type { Compte, Compteur, Contact } from '@/types/domain'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CRÉER LE MANDAT, PUIS OUVRIR DOCUSIGN — LA CHAÎNE, SANS L'ÉCRAN
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Cette suite d'appels vivait au fond de `MandatWizard`, mêlée à ses quatre étapes. Elle en sort
 * parce qu'un second écran en a besoin : le mandat en une page du parcours de conversion.
 *
 * ══ CE QUI SE DUPLIQUE ET CE QUI NE SE DUPLIQUE PAS ══
 *
 * L'ÉCRAN peut différer, et il le doit : l'assistant demande tout — quel contact, quels compteurs,
 * parmi tout ce que porte le compte. Le parcours de conversion, lui, ne demande rien : il vient de
 * créer le contact et les compteurs, il les CONFIRME. Deux besoins, deux présentations.
 *
 * LA CHAÎNE, EN REVANCHE, NE PEUT PAS DIVERGER. L'ordre des six appels porte des décisions qui se
 * paient cher si on les rejoue de travers — voir ci-dessous. Elle vit donc ici, à un seul endroit.
 *
 * ══ L'ORDRE IMPORTE, ET IL EST REPRIS DE TOOLS ══
 *
 * Le mandat est enregistré AVANT DocuSign. Si la signature échoue, le travail de saisie n'est pas
 * perdu — le mandat existe, et la signature se relance depuis sa fiche. L'inverse ferait
 * disparaître le périmètre à la moindre erreur DocuSign.
 *
 * ET L'ENVELOPPE PART EN BROUILLON. Tools le dit : « préparer l'enveloppe DocuSign et ouvrir
 * l'éditeur (ne pas envoyer directement) ». C'est un humain qui clique « Envoyer », après avoir vu
 * les champs. Le statut du mandat ne passe donc pas à ENVOYE ici : c'est le webhook DocuSign qui le
 * fera quand l'envoi aura réellement eu lieu.
 */
export interface EnvoiMandatInput {
  compte: Compte
  signataire: Contact
  compteurs: Compteur[]
  dureeMois: number
  avecEnergix: boolean
  /** Les identifiants de `types_courtiers_mandat`, résolus par l'appelant depuis la table. */
  courtierTypeIds: string[]
}

export interface EtatEnvoiMandat {
  /** Ce que la chaîne est en train de faire, à afficher tel quel. */
  etape: string | null
  erreur: string | null
  /** DocuSign n'est pas autorisé pour cet utilisateur : ce n'est pas un échec, c'est un geste à
   *  faire une fois. L'écran propose la connexion sur place plutôt qu'un message mort. */
  besoinConnexionDocusign: boolean
  enCours: boolean
}

export function useEnvoiMandat(onCree?: (mandatId: string) => void) {
  const createMandat = useCreateMandat()
  const markEnvoye = useMarkMandatEnvoye()

  const [etape, setEtape] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [besoinConnexionDocusign, setBesoin] = useState(false)
  const [enCours, setEnCours] = useState(false)

  async function envoyer(input: EnvoiMandatInput): Promise<void> {
    setEnCours(true)
    setErreur(null)
    setBesoin(false)
    try {
      setEtape('Création du mandat…')
      const resultat = await createMandat.mutateAsync({
        compte_id: input.compte.id,
        compte_nom: input.compte.nom,
        compteur_ids: input.compteurs.map((c) => c.id),
        compteurs: input.compteurs.map((c) => ({ id: c.id, site_id: c.site_id })),
        date_signature: null,
        duree_mois: input.dureeMois,
        contact_signataire_id: input.signataire.id,
        contact_signataire_nom: `${input.signataire.prenom} ${input.signataire.nom}`,
        courtier_codes: input.avecEnergix ? ['KIWI', 'ENERGIX'] : ['KIWI'],
        courtier_type_ids: input.courtierTypeIds,
      })

      onCree?.(resultat.mandat.id)

      if (!resultat.persisted) {
        setErreur('Mandat enregistré localement seulement — la signature ne peut pas être lancée.')
        return
      }
      if (!input.signataire.email) {
        setErreur(
          `Mandat créé, mais ${input.signataire.prenom} ${input.signataire.nom} n'a pas d'adresse e-mail : `
          + 'ajoutez-la puis lancez la signature depuis la fiche du mandat.',
        )
        return
      }

      setEtape('Génération des documents…')
      /* `jspdf` pèse 396 Ko : il ne se télécharge qu'au moment du clic, jamais à l'ouverture d'une
         fiche. Voir le commentaire d'origine dans `MandatWizard`. */
      const { generateMandatKiweePdf, generateMandatEnergixPdf } = await import('@/lib/mandatPdf')
      const documents = [
        await generateMandatKiweePdf({
          compte: input.compte, contact: input.signataire, compteurs: input.compteurs, dureeMois: input.dureeMois,
        }),
      ]
      if (input.avecEnergix) {
        documents.push(await generateMandatEnergixPdf({
          compte: input.compte, contact: input.signataire, compteurs: input.compteurs, dureeMois: input.dureeMois,
        }))
      }

      setEtape('Préparation de DocuSign…')
      const envoi = await sendMandatForSignature({
        mandatId: resultat.mandat.id,
        documents,
        signerEmail: input.signataire.email,
        signerName: `${input.signataire.prenom} ${input.signataire.nom}`,
        emailSubject: `KiWee Énergie — Mandat à signer (${input.compte.nom})`,
        draft: true,
        returnUrl: `${window.location.origin}/mandats/${resultat.mandat.id}`,
      })

      await markEnvoye.mutateAsync({ mandatId: resultat.mandat.id, envelopeId: envoi.envelopeId, statutId: null })

      if (envoi.senderViewUrl) {
        setEtape('Ouverture de l’éditeur DocuSign…')
        window.location.href = envoi.senderViewUrl
        return
      }
      setErreur('Enveloppe créée, mais DocuSign n’a pas renvoyé d’URL d’éditeur. Relancez depuis la fiche du mandat.')
    } catch (e) {
      if (e instanceof DocusignNonConnecte) {
        setBesoin(true)
        setErreur(e.message)
        return
      }
      /* Le mandat peut exister malgré l'échec : on le dit, plutôt que de laisser croire à une
         création manquée qui pousserait à recommencer et à créer un doublon. */
      setErreur(
        `${e instanceof Error ? e.message : 'Erreur inconnue'} — si le mandat a été créé, relancez la `
        + 'signature depuis sa fiche plutôt que de recommencer.',
      )
    } finally {
      setEnCours(false)
      setEtape(null)
    }
  }

  const etat: EtatEnvoiMandat = { etape, erreur, besoinConnexionDocusign, enCours }
  return { envoyer, etat }
}
