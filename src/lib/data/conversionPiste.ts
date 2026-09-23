import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCreateCompte, useUpdateCompteScore } from '@/lib/data/comptes'
import { useCreateContact } from '@/lib/data/contacts'
import { useEllisphereScore } from '@/lib/data/ellisphere'
import { useReferenceTable } from '@/lib/data/referenceTables'
import type { Piste, TypeCompte } from '@/types/domain'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA CONVERSION D'UNE PISTE, ÉTAPE PAR ÉTAPE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 23/09/2026, en six points : le SIREN, le contact, les compteurs, l'opportunité, le
 * mandat, et le parcours se termine quand le mandat est parti.
 *
 * ══ POURQUOI UN FICHIER D'ORCHESTRATION, ET NON DU CODE DANS L'ÉCRAN ══
 *
 * Chacune de ces écritures existe déjà ailleurs — `useCreateCompte`, `useCreateContact`,
 * `CreationCompteurDialog`, `MandatWizard`. Ce qui manquait n'était aucune d'elles : c'était le FIL
 * qui les coud, et surtout ce qu'on fait quand il casse au milieu. Ce fil vit ici, pas dans le
 * rendu, pour qu'on puisse le lire d'un bloc.
 *
 * ══ LA RÈGLE QUI GOUVERNE TOUT LE PARCOURS ══
 *
 * William : « Si le commercial veut reprendre, il créera les compteurs depuis le compte et lancera
 * l'opportunité ultérieurement. »
 *
 * LA PISTE NE BASCULE DONC QU'À L'OPPORTUNITÉ. Le compte et le contact créés en chemin restent —
 * ils sont justes, et les recréer ferait le doublon. Mais tant qu'il n'y a pas d'opportunité, la
 * piste reste ouverte, dans le plan du jour, avec sa tâche : rien n'est perdu, rien n'est faussé,
 * et on reprend là où l'on s'est arrêté sans que Kimatch prétende que c'est fini.
 */

/** Le compte qui porte déjà ce SIREN, s'il existe. */
export async function chercherCompteParSiren(siren: string): Promise<{ id: string; nom: string } | null> {
  const propre = siren.replace(/\D/g, '')
  if (propre.length !== 9) return null

  /* ON CHERCHE AUSSI DANS LE SIRET. 2 724 comptes portent un SIREN, mais le SIRET le contient sur
     ses neuf premiers chiffres — et certains comptes n'ont que lui. Ignorer ce chemin créerait un
     doublon sur un compte qui existe, ce que la conversion est justement censée éviter. */
  const { data } = await supabase
    .from('comptes')
    .select('id, nom, siren, siret')
    .or(`siren.eq.${propre},siret.like.${propre}%`)
    .eq('actif', true)
    .limit(1)

  const trouve = (data as { id: string; nom: string }[] | null)?.[0]
  return trouve ? { id: trouve.id, nom: trouve.nom } : null
}

/** Le type de compte déduit du segment de la piste, avec la même table que la conversion actuelle. */
const SEGMENT_VERS_TYPE: Record<string, TypeCompte> = {
  'Syndic professionnel': 'client',
  'Syndic non professionnel': 'client',
  'Entreprise': 'client',
}

export interface CompteEtabli {
  id: string
  nom: string
  /** Vrai quand il existait déjà : l'écran le dit, pour qu'on sache qu'on rejoint un dossier. */
  existait: boolean
}

/** Ce que l'annuaire d'entreprises a renvoyé quand la piste n'avait pas de SIREN à elle. */
export interface IdentiteLegale {
  nom: string
  siren: string
  siret?: string | null
  rue?: string | null
  codePostal?: string | null
  ville?: string | null
  codeNaf?: string | null
  libelleApe?: string | null
}

/**
 * Étape 1 — le compte.
 *
 * ══ ELLIPRO PART EN ARRIÈRE-PLAN, ET N'ARRÊTE JAMAIS RIEN ══
 *
 * William : « déclenchement de la liaison Ellipro afin de récupérer les données du compte ainsi que
 * son score. Process en arrière-plan automatisé. »
 *
 * EN ARRIÈRE-PLAN VEUT DIRE QU'ON N'ATTEND PAS SA RÉPONSE. C'est un appel facturé vers un tiers,
 * qui met parfois plusieurs secondes et qui échoue comme tout appel réseau. Le faire bloquer la
 * conversion reviendrait à empêcher de créer un client parce qu'un service de notation est lent.
 * Le score se rattrape depuis la fiche du compte ; la conversion, elle, ne se rattrape pas.
 */
export function useEtablirCompte() {
  const creerCompte = useCreateCompte()
  const lireScore = useEllisphereScore()
  const ecrireScore = useUpdateCompteScore()
  const { data: typesComptes } = useReferenceTable('types_comptes')

  return useMutation({
    mutationFn: async ({ piste, identite }: { piste: Piste; identite: IdentiteLegale }): Promise<CompteEtabli> => {
      const propre = identite.siren.replace(/\D/g, '')
      if (propre.length !== 9) throw new Error('Le SIREN doit compter neuf chiffres.')

      const deja = await chercherCompteParSiren(propre)
      if (deja) return { ...deja, existait: true }

      const segment = piste.segment || 'Entreprise'
      const typeCompte = SEGMENT_VERS_TYPE[segment] ?? 'client'
      const typeCompteId = (typesComptes ?? []).find(
        (t) => t.code === typeCompte.toUpperCase(),
      )?.id ?? null

      const { compte } = await creerCompte.mutateAsync({
        segment,
        typeCompte,
        typeCompteId,
        /* L'ANNUAIRE PRIME SUR LA PISTE quand il a répondu : ses champs viennent de l'INSEE, ceux
           de la piste d'un import Salesforce jamais revérifié. Sur les pistes qui portent déjà leur
           SIREN, `identite` est justement construite depuis la piste — donc rien ne change. */
        nom: identite.nom || piste.societe || 'Compte sans nom',
        rue: identite.rue ?? piste.rue ?? null,
        codePostal: identite.codePostal ?? piste.code_postal ?? null,
        ville: identite.ville ?? piste.ville ?? null,
        siret: identite.siret ?? piste.siret ?? null,
        siren: propre,
        codeNaf: identite.codeNaf ?? piste.code_naf ?? null,
        libelleApe: identite.libelleApe ?? null,
      })

      /* SANS `await` : la conversion continue pendant qu'Ellipro répond, et un échec ne remonte
         nulle part. `catch` vide et assumé — le score n'est pas une donnée dont dépend la suite.
         On passe par les deux mutations existantes plutôt que par un `fetch` à la main : l'appel
         Ellipro exige le jeton d'authentification (`authHeader`), et l'écriture rafraîchit aussi
         le cache des comptes, pour que la fiche montre le score sans rechargement. */
      void lireScore
        .mutateAsync(propre)
        .then((score) => (score.score ? ecrireScore.mutateAsync({ compteId: compte.id, score }) : null))
        .catch(() => {})

      return { id: compte.id, nom: compte.nom, existait: false }
    },
  })
}

/**
 * Étape 2 — le contact, tel que la piste le décrit.
 *
 * William : « je mappe ainsi les champs Civilité + Prénom + Nom […] la fonction, le téléphone, le
 * mobile, le mail ».
 *
 * LE NOM SE RECOMPOSE QUAND LA PISTE NE L'A PAS DÉCOUPÉ. 4 490 pistes viennent d'imports qui n'ont
 * jamais séparé le prénom du nom : elles ne portent qu'un `contact_nom`. `decouperNomComplet` fait
 * la même lecture que le sprint — la civilité si elle ouvre, le premier mot en prénom, le reste en
 * nom — plutôt que d'écrire « Jean Dupont » dans la colonne `nom` et de laisser un prénom vide.
 *
 * LE RÔLE EST DÉCISIONNAIRE, PAS SIGNATAIRE. La validation d'une piste porte sur qui décide ; c'est
 * le mandat qui désigne qui paraphe, et il le demande à son étape 1.
 */
export function useEtablirContact() {
  const creerContact = useCreateContact()

  return useMutation({
    mutationFn: async ({ piste, compte, identite }: {
      piste: Piste
      compte: { id: string; nom: string }
      identite: { civilite: string | null; prenom: string; nom: string; fonction: string | null
                  telephone: string | null; mobile: string | null; email: string | null }
    }): Promise<{ id: string; nom: string }> => {
      if (!identite.nom.trim()) throw new Error('Le nom du contact est obligatoire.')

      const { contact } = await creerContact.mutateAsync({
        compte_id: compte.id,
        compte_nom: compte.nom,
        civilite: identite.civilite,
        prenom: identite.prenom,
        nom: identite.nom,
        fonction: identite.fonction,
        telephone: identite.telephone,
        telephone_mobile: identite.mobile,
        email: identite.email,
        roles: ['DECISIONNAIRE'],
        site_ids: [],
        sites: [],
      })

      /* LA PISTE GARDE LA TRACE de ce qu'elle a produit : sans cela, reprendre une conversion
         interrompue recréerait un second contact pour la même personne. */
      await supabase.from('pistes')
        .update({ compte_id: compte.id, contact_id: contact.id, date_modification: new Date().toISOString() })
        .eq('id', piste.id)

      return { id: contact.id, nom: `${identite.prenom} ${identite.nom}`.trim() }
    },
  })
}

/**
 * Étape 4 — l'opportunité, et c'est ELLE qui convertit la piste.
 *
 * William : « à la suite de la création du ou de ces compteurs, une opportunité est automatiquement
 * créée et liée à ce compte, ce contact et ce ou ces compteurs ».
 *
 * TROIS CHOSES SE FONT SEULES EN BASE, et il faut le savoir en lisant ce code :
 *   · le statut part en COUVERTURE MANDAT (déclencheur `trg_opportunite_nee_d_une_piste`) ;
 *   · la tâche « Relance mandat » se pose à J+2, minuit heure de Paris ;
 *   · la piste passe en CONVERTIE dès qu'elle reçoit son `opportunite_id`.
 *
 * On n'écrit donc ici que ce que la base ne peut pas deviner : les liens, et le périmètre.
 *
 * ══ PAS DE SIGNAL ══
 *
 * William, 23/09/2026 : « oublie toute la partie concernant le signal positif, c'est inutile. » Il
 * était demandé depuis la règle de Michel (23/08/2026), mais il se saisissait sur un écran qui ne
 * demandait plus rien d'autre au commercial — une case à cocher pour la forme, à un endroit où le
 * parcours est justement censé enchaîner tout seul. `signal_libelle` reste nullable en base et
 * l'écran de l'opportunité continue de l'afficher quand il est renseigné par ailleurs.
 */
export function useCreerOpportuniteDepuisPiste() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ piste, compteId, contactId, compteurIds }: {
      piste: Piste
      compteId: string
      contactId: string
      compteurIds: string[]
    }): Promise<string> => {
      if (compteurIds.length === 0) {
        throw new Error('Une opportunité ne se crée pas sans périmètre : créez au moins un compteur.')
      }

      const { data, error } = await supabase
        .from('opportunites')
        .insert({
          origine: 'PISTE',
          piste_id: piste.id,
          compte_id: compteId,
          contact_id: contactId,
          proprietaire_id: piste.proprietaire_id ?? null,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      const opportuniteId = (data as { id: string }).id

      /* LE PÉRIMÈTRE, dans la foulée : c'est ce qui distingue cette opportunité des 99 sur 132 qui
         n'en ont aucun. Une erreur ici laisserait une opportunité vide — on la signale plutôt que
         de la laisser croire complète. */
      const { error: erreurPerimetre } = await supabase
        .from('opportunites_compteurs')
        .insert(compteurIds.map((compteur_id) => ({ opportunite_id: opportuniteId, compteur_id })))
      if (erreurPerimetre) throw new Error(`Périmètre : ${erreurPerimetre.message}`)

      /* C'EST CETTE ÉCRITURE QUI CONVERTIT LA PISTE — le déclencheur pose le statut. Elle vient en
         dernier, pour qu'une piste ne soit jamais close devant une opportunité incomplète. */
      const { error: erreurPiste } = await supabase
        .from('pistes')
        .update({ opportunite_id: opportuniteId, date_modification: new Date().toISOString() })
        .eq('id', piste.id)
      if (erreurPiste) throw new Error(`Clôture de la piste : ${erreurPiste.message}`)

      void qc.invalidateQueries({ queryKey: ['pistes'] })
      void qc.invalidateQueries({ queryKey: ['opportunites'] })
      void qc.invalidateQueries({ queryKey: ['cockpit'] })
      return opportuniteId
    },
  })
}
