import { describe, expect, it } from 'vitest'
import { prochaineFiche } from '@/lib/sprintNavigation'
import { correspond } from '@/lib/recherche'

/**
 * ══ LE SPRINT NE SAUTE PLUS DE FICHE ══
 *
 * Thomas, 28/09/2026 : « dans certains cas — par exemple quand il vient d'appuyer sur Passer — la
 * prochaine fiche qui s'affiche est skip dès qu'il clique sur Appeler ».
 *
 * La fiche courante était un RANG dans une liste qui bougeait : appeler faisait sortir la fiche de
 * la liste « à contacter », tout remontait d'un cran, et le rang désignait la suivante. Ces tests
 * rejouent ce scénario sur la règle qui décide désormais — par identifiant.
 */
type Etat = 'A_CONTACTER' | 'CONTACTE' | undefined

function plan(etats: Record<string, Etat>) {
  return (id: string) => etats[id]
}

describe('prochaineFiche', () => {
  const ordre = ['a', 'b', 'c', 'd']

  it('passe à la fiche qui suit', () => {
    const etat = plan({ a: 'A_CONTACTER', b: 'A_CONTACTER', c: 'A_CONTACTER', d: 'A_CONTACTER' })
    expect(prochaineFiche(ordre, etat, 'a')).toBe('b')
  })

  it('le scénario de Thomas : Passer, puis Appeler, ne saute pas la fiche d’après', () => {
    // Passer sur A : on arrive sur B.
    let etats: Record<string, Etat> = { a: 'A_CONTACTER', b: 'A_CONTACTER', c: 'A_CONTACTER', d: 'A_CONTACTER' }
    const courante = prochaineFiche(ordre, plan(etats), 'a')
    expect(courante).toBe('b')

    // Appeler B : sa tâche est terminée, B quitte la liste « à contacter » au rechargement.
    etats = { ...etats, b: 'CONTACTE' }

    // La fiche courante est TOUJOURS B — elle est désignée par son identifiant, pas par un rang —
    // et la suivante est C, pas D.
    expect(prochaineFiche(ordre, plan(etats), courante)).toBe('c')
  })

  it('une fiche sortie du plan en cours de route ne décale rien', () => {
    // B est close pendant qu'on est sur A : elle disparaît du plan.
    const etat = plan({ a: 'A_CONTACTER', b: undefined, c: 'A_CONTACTER', d: 'A_CONTACTER' })
    expect(prochaineFiche(ordre, etat, 'a')).toBe('c')
  })

  it('revient au début pour reprendre les fiches passées', () => {
    const etat = plan({ a: 'A_CONTACTER', b: 'CONTACTE', c: 'CONTACTE', d: 'A_CONTACTER' })
    expect(prochaineFiche(ordre, etat, 'd')).toBe('a')
  })

  it('ne propose jamais une fiche déjà contactée ni close', () => {
    const etat = plan({ a: 'A_CONTACTER', b: 'CONTACTE', c: undefined, d: 'A_CONTACTER' })
    expect(prochaineFiche(ordre, etat, 'a')).toBe('d')
  })

  it('rend null quand plus rien n’est à contacter, en dehors de la courante', () => {
    const etat = plan({ a: 'A_CONTACTER', b: 'CONTACTE', c: 'CONTACTE', d: undefined })
    expect(prochaineFiche(ordre, etat, 'a')).toBeNull()
  })

  it('part de la première fiche à contacter quand il n’y a pas encore de courante', () => {
    const etat = plan({ a: 'CONTACTE', b: 'A_CONTACTER', c: 'A_CONTACTER', d: 'A_CONTACTER' })
    expect(prochaineFiche(ordre, etat, null)).toBe('b')
  })
})

describe('correspond', () => {
  it('ignore les accents et la casse', () => {
    expect(correspond(['Gérance Martin'], 'gerance')).toBe(true)
  })

  it('exige chaque mot, dans n’importe quel ordre', () => {
    expect(correspond(['12 rue Victor Hugo', 'Lyon'], 'victor rue')).toBe(true)
    expect(correspond(['12 rue Victor Hugo', 'Lyon'], 'victor paris')).toBe(false)
  })

  it('trouve un numéro tapé sans espaces', () => {
    expect(correspond(['06 12 34 56 78'], '0612')).toBe(true)
    expect(correspond(['06.12.34.56.78'], '06123456')).toBe(true)
  })

  it('une recherche vide laisse tout passer, un champ absent ne gêne pas', () => {
    expect(correspond([null, undefined], '   ')).toBe(true)
    expect(correspond([null, 'SAS TVPJ'], 'tvpj')).toBe(true)
  })
})
