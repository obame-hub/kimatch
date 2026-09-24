/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * RÉGLER LES RÔLES — ET NON PLUS SEULEMENT LES REGARDER
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Naoëlle, 24/09/2026 : « la page de rôles et permissions est bien dans l'ensemble mais je la
 * trouve trop simple, fais en sorte qu'on puisse gérer aussi, pas seulement voir en mode lecture ».
 *
 * ══ CE QUI DIFFÈRE DES CASES À COCHER RETIRÉES LE 23/09 ══
 *
 * Il y avait ici une matrice de 24 permissions × 9 rôles. Elle a été retirée parce qu'elle
 * n'agissait sur rien : 121 attributions enregistrées, et AUCUN écran ni AUCUNE règle de base ne
 * les lisait. Recompté avant d'écrire ce module, pour ne pas croire le commentaire sur parole.
 *
 * CHAQUE ÉCRITURE DE CE FICHIER CHANGE UN DROIT RÉEL. Les quatre colonnes réglées ici sont
 * exactement celles que les six contrôles de l'application consultent (migration 20260924103000) :
 * la porte de l'administration, le périmètre visible, la suppression, le support.
 *
 * ══ POURQUOI UN FICHIER À PART ══
 *
 * `roles.ts` est un module de LECTURE appelé par onze autres. Y mêler les écritures
 * d'administration mélangerait deux durées de vie : ce qu'on lit à chaque rendu, et ce qu'on écrit
 * trois fois par an depuis un seul écran.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { viderCacheAcces } from '@/lib/data/roles'
import { viderCacheVisibilite, viderCacheMonPortefeuille } from '@/lib/data/visibility'


/**
 * Une écriture filtrée par les RLS n'est PAS un succès.
 *
 * ══ LE DÉFAUT QUE CECI CORRIGE, ÉPROUVÉ À L'ÉCRAN LE 24/09/2026 ══
 *
 * `roles_acces` avait `row level security` active et aucune policy d'écriture. Un `update` refusé
 * par une policy NE LÈVE PAS D'ERREUR : PostgREST répond 200 avec zéro ligne touchée. La mutation
 * réussissait donc, l'interrupteur basculait, et le droit ne changeait pas.
 *
 * C'est exactement le mensonge qu'on corrige en refaisant cette page. On demande donc à PostgREST
 * de RENDRE les lignes modifiées (`Prefer: return=representation`, ce que fait `.select()`), et
 * une liste vide devient une erreur.
 */
function exigerUneLigne(lignes: unknown[] | null, quoi: string): void {
  if (!lignes || lignes.length === 0) {
    throw new Error(
      `${quoi} : la base a refusé la modification. Votre rôle n'ouvre probablement plus l'administration — rechargez la page.`,
    )
  }
}

/** Les quatre droits réellement appliqués. Voir la migration 20260924103000 pour chacun. */
export interface CapacitesRole {
  voit_tous_les_comptes?: boolean
  ouvre_administration?: boolean
  supprime_tout?: boolean
  recoit_le_support?: boolean
}

/**
 * Vide tout ce qui garde un droit en mémoire.
 *
 * INDISPENSABLE APRÈS CHAQUE ÉCRITURE : `fetchCurrentAccess` et le périmètre de visibilité gardent
 * leur résultat pour toute la session — c'est ce qui évite 21 requêtes par fiche. Sans cette purge,
 * qui vient de modifier un droit continuerait de voir l'ancien jusqu'à sa prochaine connexion, et
 * conclurait que le réglage n'a pas pris.
 */
function purgerLesDroits(queryClient: ReturnType<typeof useQueryClient>) {
  viderCacheAcces()
  viderCacheVisibilite()
  viderCacheMonPortefeuille()
  void queryClient.invalidateQueries({ queryKey: ['roles-acces'] })
  void queryClient.invalidateQueries({ queryKey: ['current-access'] })
  void queryClient.invalidateQueries({ queryKey: ['profils-admin'] })
}

/**
 * Change ce qu'un rôle ouvre.
 *
 * LE MESSAGE DE LA BASE REMONTE TEL QUEL : le déclencheur `protege_dernier_administrateur` explique
 * précisément pourquoi il refuse — « ce rôle est le dernier à ouvrir l'administration ». Le
 * remplacer par « échec » perdrait la seule information dont on a besoin à ce moment-là.
 */
export function useModifierCapacitesRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, capacites }: { id: string; capacites: CapacitesRole }) => {
      const { data, error } = await supabase
        .from('roles_acces').update(capacites).eq('id', id).select('id')
      if (error) throw new Error(error.message)
      exigerUneLigne(data, 'Droits du rôle')
    },
    onSuccess: () => purgerLesDroits(queryClient),
  })
}

/** Renommer un rôle, ou dire à quoi il sert. Le code, lui, ne bouge jamais — voir `useCreerRole`. */
export function useRenommerRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, libelle, description }: {
      id: string; libelle: string; description: string | null
    }) => {
      const propre = libelle.trim()
      if (!propre) throw new Error('Un rôle sans nom ne se reconnaît pas dans une liste.')
      const { data, error } = await supabase
        .from('roles_acces')
        .update({ libelle: propre, description: description?.trim() || null })
        .eq('id', id)
        .select('id')
      if (error) throw new Error(error.message)
      exigerUneLigne(data, 'Nom du rôle')
    },
    onSuccess: () => purgerLesDroits(queryClient),
  })
}

/**
 * Créer un rôle.
 *
 * ══ LE CODE EST DÉRIVÉ DU NOM, ET NE CHANGE PLUS JAMAIS ══
 *
 * C'est lui qui identifie le rôle dans les données. Le laisser suivre le libellé casserait tout
 * rapprochement le jour où quelqu'un corrige une faute de frappe. Le libellé, lui, se modifie
 * librement : c'est ce qu'on lit à l'écran.
 *
 * ══ UN RÔLE NAÎT SANS AUCUN DROIT ══
 *
 * Et c'est voulu, même si cela demande un geste de plus. Un rôle qui naîtrait avec des droits par
 * commodité ouvrirait l'administration à qui le reçoit, sans que personne l'ait décidé.
 */
export function useCreerRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ libelle, description, niveauHierarchique }: {
      libelle: string; description: string | null; niveauHierarchique: number
    }) => {
      const propre = libelle.trim()
      if (!propre) throw new Error('Un rôle sans nom ne se reconnaît pas dans une liste.')
      // Les accents tombent : un code sert de clé, il reste en ASCII.
      const code = propre
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40)
      if (!code) throw new Error('Ce nom ne donne aucun code utilisable : ajoutez des lettres.')
      const { data, error } = await supabase.from('roles_acces').insert({
        code,
        libelle: propre,
        description: description?.trim() || null,
        niveau_hierarchique: niveauHierarchique,
        actif: true,
        voit_tous_les_comptes: false,
        ouvre_administration: false,
        supprime_tout: false,
        recoit_le_support: false,
      }).select('id')
      if (error) {
        // 23505 : le code est déjà pris. Postgres parle d'index unique ; ceci dit quoi faire.
        if (error.code === '23505') throw new Error('Un rôle porte déjà ce nom.')
        throw new Error(error.message)
      }
      exigerUneLigne(data, 'Création du rôle')
    },
    onSuccess: () => purgerLesDroits(queryClient),
  })
}

/**
 * Activer ou désactiver un rôle.
 *
 * ON NE SUPPRIME PAS, ET CE N'EST PAS UNE PRUDENCE DE PRINCIPE : des profils le portent peut-être,
 * et l'effacer les laisserait SANS RÔLE — donc sans aucun droit, d'un coup, sans que rien ne le
 * signale à l'écran. Désactiver le retire des choix à venir sans toucher à qui l'a déjà.
 *
 * Le déclencheur en base refuse de désactiver le dernier rôle qui ouvre l'administration.
 */
export function useActiverRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, actif }: { id: string; actif: boolean }) => {
      const { data, error } = await supabase
        .from('roles_acces').update({ actif }).eq('id', id).select('id')
      if (error) throw new Error(error.message)
      exigerUneLigne(data, actif ? 'Réactivation du rôle' : 'Désactivation du rôle')
    },
    onSuccess: () => purgerLesDroits(queryClient),
  })
}

/**
 * Donner un rôle à quelqu'un — ou changer le sien.
 *
 * UNE SEULE LIGNE PAR PROFIL, donc on supprime avant d'insérer. `profils_roles_acces` n'a pas de
 * contrainte d'unicité sur `profil_id` : deux insertions laisseraient deux rôles à la même
 * personne, et `maybeSingle()` — qui les lit dans `calculerCurrentAccess` — échouerait alors en
 * rendant « aucun rôle ». La personne perdrait TOUS ses droits, sans message.
 */
export function useChangerRoleDe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ profilId, roleId }: { profilId: string; roleId: string }) => {
      const suppr = await supabase.from('profils_roles_acces').delete().eq('profil_id', profilId)
      if (suppr.error) throw new Error(suppr.error.message)
      const { data, error } = await supabase
        .from('profils_roles_acces')
        .insert({ profil_id: profilId, role_acces_id: roleId })
        .select('profil_id')
      if (error) throw new Error(error.message)
      /* ICI L'ENJEU EST PLUS GRAVE QU'AILLEURS : la suppression au-dessus a pu passer alors que
         l'insertion est refusée. La personne se retrouverait SANS AUCUN RÔLE, donc sans droits,
         sans que rien ne le signale. On le dit, et on dit quoi faire. */
      if (!data || data.length === 0) {
        throw new Error(
          'Le rôle n’a pas pu être attribué et la personne se retrouve sans rôle : rechargez la page et réessayez.',
        )
      }
    },
    onSuccess: () => purgerLesDroits(queryClient),
  })
}
