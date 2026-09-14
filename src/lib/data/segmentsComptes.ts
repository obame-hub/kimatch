// ════════════════════════════════════════════════════════════════════════════════════════════════
// LES TYPOLOGIES DE COMPTE PROPOSÉES AU CHOIX
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// William, 14/09/2026 : « j'ai l'impression que le champ typologie est un champ texte alors que ça
// devrait être une liste déroulante plutôt non ? »
//
// ══ POURQUOI UN CROCHET DÉDIÉ ET NON `useReferenceTable` ══
//
// Le crochet générique rend `{ id, code, libelle, ordre, couleur, icone }` et rien d'autre : il ne
// sait pas transporter `types_comptes`, la colonne qui dit à quel type de compte une typologie est
// proposée. L'élargir servirait une seule table et obligerait toutes les autres à porter un champ
// qui ne les concerne pas.
//
// ══ UNE VALEUR HORS LISTE RESTE CHOISISSABLE ══
//
// William, même échange : « Ne jamais rendre une valeur inqualifiable = Oui ». Un compte peut
// porter une typologie absente de la liste — parce qu'elle vient d'un import, parce qu'elle a été
// désactivée depuis, ou parce que la migration n'est pas encore passée sur cet environnement. Elle
// est alors ajoutée en tête des options : sans ça, ouvrir le menu puis enregistrer suffirait à
// l'effacer sans que personne ne l'ait demandé.
// ════════════════════════════════════════════════════════════════════════════════════════════════

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { supabase } from '@/lib/supabase'

export interface SegmentCompte {
  code: string
  libelle: string
  ordre: number
  /** Types de compte auxquels cette typologie est proposée. « Courtier » en porte deux. */
  types_comptes: string[]
}

async function fetchSegments(): Promise<SegmentCompte[]> {
  // `select('*')` pour la même raison que dans referenceTables.ts : `types_comptes` vient d'une
  // migration du 14/09/2026, et un select nommé sur une colonne absente ferait échouer la requête
  // en 400 — ce qui viderait la liste au lieu de la dégrader.
  const { data, error } = await supabase.from('segments_comptes').select('*').order('ordre')
  if (error || !data) return []
  return (data as Record<string, unknown>[])
    .filter((r) => r.actif !== false)
    .map((r) => ({
      code: r.code as string,
      libelle: r.libelle as string,
      ordre: (r.ordre as number) ?? 0,
      // Colonne absente = typologie de client, qui était le seul cas avant la migration.
      types_comptes: (r.types_comptes as string[] | null) ?? ['client'],
    }))
}

export function useSegmentsComptes() {
  return useQuery({
    queryKey: ['segments-comptes'],
    // Une table de référence de six lignes qui bouge une fois par an : inutile de la relire.
    staleTime: 60 * 60 * 1000,
    queryFn: fetchSegments,
  })
}

/**
 * Les options du menu pour un compte donné, la valeur actuelle comprise même hors liste.
 *
 * `valeurActuelle` n'est pas un détail d'affichage : c'est la garde qui empêche le menu d'effacer
 * une typologie qu'il ne connaît pas.
 */
export function useOptionsTypologie(typeCompte: string | null | undefined, valeurActuelle: string | null | undefined) {
  const { data: segments } = useSegmentsComptes()

  return useMemo(() => {
    const proposes = (segments ?? [])
      .filter((s) => !typeCompte || s.types_comptes.includes(typeCompte))
      .map((s) => ({ value: s.libelle, label: s.libelle }))

    const actuelle = (valeurActuelle ?? '').trim()
    const horsListe = actuelle.length > 0 && !proposes.some((o) => o.value === actuelle)

    return [
      { value: '', label: '—' },
      // La valeur hors liste passe en tête et se signale : on la garde, mais on ne fait pas croire
      // qu'elle fait partie du vocabulaire courant.
      ...(horsListe ? [{ value: actuelle, label: `${actuelle} (hors liste)` }] : []),
      ...proposes,
    ]
  }, [segments, typeCompte, valeurActuelle])
}
