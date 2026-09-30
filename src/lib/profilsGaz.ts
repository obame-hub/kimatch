/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA RÉPARTITION MENSUELLE DE LA CAR, SELON LE PROFIL GAZ
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 30/09/2026 : « sur le gaz, la consommation des 12 derniers mois on ne peut pas l'avoir.
 * En revanche, par rapport aux profils, on connaît quel pourcentage de la CAR est consommé en
 * moyenne chaque mois. C'est ça qu'on veut pour le gaz. » Tableau fourni par William, recopié tel
 * quel : un mois par ligne, un profil par colonne, en pour cent de la CAR. Chaque profil fait 100 %
 * sur l'année — `__tests__/profilsGaz.test.ts` le vérifie.
 *
 * C'EST UNE ESTIMATION, et l'écran le dit (« Estimé · profil P016 ») : le profil décrit une
 * saisonnalité moyenne, pas ce que ce PCE-là a réellement consommé.
 */

export const PROFILS_GAZ = ['P011', 'P012', 'P013', 'P014', 'P015', 'P016', 'P017', 'P018', 'P019'] as const
export type ProfilGaz = (typeof PROFILS_GAZ)[number]

/** Index du mois : 0 = janvier … 11 = décembre. */
const PARTS: Record<ProfilGaz, number[]> = {
  //          janv  févr  mars  avr   mai   juin  juil  août  sept  oct   nov   déc
  P011: [11.7, 10.4, 10.3, 8.5, 7.3, 5.9, 5.4, 5.5, 6.3, 7.9, 9.4, 11.4],
  P012: [18.5, 16.3, 13.3, 7.2, 3.3, 1.4, 1.2, 1.1, 1.6, 6.2, 12.7, 17.2],
  P013: [5.3, 6.1, 7.0, 7.7, 8.2, 9.4, 8.4, 8.1, 10.1, 12.7, 10.5, 6.5],
  P014: [9.7, 9.4, 9.3, 8.1, 7.8, 7.9, 6.8, 6.5, 7.7, 9.2, 9.2, 8.4],
  P015: [12.3, 11.3, 10.7, 8.5, 7.0, 5.6, 5.0, 4.6, 5.9, 8.0, 9.7, 11.4],
  P016: [15.5, 13.8, 12.2, 8.3, 5.2, 3.2, 2.8, 2.7, 3.6, 7.2, 11.1, 14.4],
  P017: [17.4, 15.3, 12.9, 7.9, 3.8, 1.9, 1.7, 1.7, 2.5, 6.8, 11.9, 16.2],
  P018: [19.6, 17.0, 13.8, 7.5, 2.5, 0.7, 0.6, 0.6, 1.1, 5.9, 12.7, 18.0],
  P019: [21.3, 18.4, 14.3, 6.7, 1.1, 0.2, 0.2, 0.1, 0.3, 5.2, 13.0, 19.2],
}

/** La part de la CAR consommée ce mois-là (en pour cent), ou `null` pour un profil inconnu. */
export function partMensuelleCar(profil: string | null | undefined, mois: number): number | null {
  if (!profil) return null
  const cle = profil.trim().toUpperCase() as ProfilGaz
  return PARTS[cle]?.[mois] ?? null
}

/** Pour les tests : les douze parts d'un profil. */
export function partsDuProfil(profil: ProfilGaz): number[] {
  return PARTS[profil]
}
