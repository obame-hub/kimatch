import { describe, expect, it } from 'vitest'
import { analyseLeadSlack, estUnLead } from './_analyseLeadSlack.js'

/**
 * ══ LIRE UN LEAD DANS SON MESSAGE SLACK ══
 *
 * Ces deux messages sont RÉELS : ils viennent du canal #leads, relevés le 15/09/2026. On teste sur
 * ce que la fonction `google-sheets-lead` écrit vraiment, pas sur un exemple reconstitué — c'est la
 * seule façon de savoir que l'analyse marchera lundi matin.
 *
 * Le reste des cas porte sur ce qui arrive quand le format bouge : c'est là qu'une lecture de texte
 * casse, et c'est là qu'elle doit le DIRE au lieu de créer une piste à moitié remplie.
 */

const BRUNO = [
  '🔔 Nouveau lead — Comparateur',
  '👤 Nom : Bruno  Athea',
  '📧 Email : gestion@etikimmo.com',
  '🏢 Entreprise : ETIK IMMO',
  '📋 Type : Syndic',
  '⚡ Consommation : 1 000 - 2 000 €/mois',
  '💬 Message : Énergie: Électricité | Coût: 1 000 - 2 000 €/mois€ | Tél: 0695428787 | Structure: Syndic',
].join('\n')

const MEGANE = [
  '🔔 Nouveau lead — Comparateur',
  '👤 Nom : Mégane El baraka',
  '📧 Email : apperemeghan@hotmail.fr',
  '🏢 Entreprise : VIRG’IN CLEAN',
  '📋 Type : Entreprise',
  '⚡ Consommation : Moins de 500 €/mois',
  '💬 Message : Énergie: Électricité | Coût: Moins de 500 €/mois€ | Tél: 0651470222 | Structure: Entreprise',
].join('\n')

describe('un vrai message du canal #leads', () => {
  it('lit tous les champs de Bruno Athea', () => {
    const l = analyseLeadSlack(BRUNO)
    expect(l.prenom).toBe('Bruno')
    expect(l.nom).toBe('ATHEA')
    expect(l.societe).toBe('ETIK IMMO')
    expect(l.email).toBe('gestion@etikimmo.com')
    expect(l.telephone).toBe('0695428787')
    expect(l.segment).toBe('Syndic professionnel')
    expect(l.manques).toEqual([])
  })

  it('lit Mégane El baraka, dont le nom tient en deux mots', () => {
    const l = analyseLeadSlack(MEGANE)
    expect(l.prenom).toBe('Mégane')
    expect(l.nom).toBe('EL BARAKA')
    expect(l.societe).toBe('VIRG’IN CLEAN')
    expect(l.segment).toBe('Entreprise')
    expect(l.telephone).toBe('0651470222')
  })

  /* Le double espace de « Bruno  Athea » vient du formulaire, qui colle prénom et nom avec deux
     séparateurs. Sans normalisation, `contact_nom` porterait ce trou et la recherche par nom
     complet ne trouverait rien. */
  it('resserre les espaces du nom complet', () => {
    expect(analyseLeadSlack(BRUNO).contactNom).toBe('Bruno Athea')
  })

  /* La consommation et le message disent tous deux le budget : les séparer obligerait à lire deux
     champs pour une seule question. */
  it('garde la consommation et le message dans le commentaire', () => {
    const l = analyseLeadSlack(BRUNO)
    expect(l.commentaire).toContain('1 000 - 2 000 €/mois')
    expect(l.commentaire).toContain('Énergie: Électricité')
  })
})

describe('ce qui n’est pas un lead', () => {
  it('ignore l’arrivée d’un membre dans le canal', () => {
    expect(estUnLead('Naoëlle a été ajouté(e) à #leads par Michel OBAME.')).toBe(false)
  })

  it('reconnaît le message de lead', () => {
    expect(estUnLead(BRUNO)).toBe(true)
  })
})

describe('quand le format bouge, ça se dit', () => {
  it('nomme les champs manquants au lieu de créer une piste vide', () => {
    const l = analyseLeadSlack('🔔 Nouveau lead — Comparateur\n👤 Nom : Bruno Athea')
    expect(l.manques).toContain('Entreprise')
    expect(l.manques).toContain('Email ou Tél')
  })

  /* Un lead sans e-mail arrive vraiment — Philippe Lefebvre, 09/09, n'avait qu'un téléphone. Le
     téléphone seul suffit donc : on peut le joindre, c'est tout ce qui compte. */
  it('accepte un lead joignable par téléphone seulement', () => {
    const l = analyseLeadSlack([
      '🔔 Nouveau lead — Comparateur',
      '👤 Nom : Philippe Lefebvre',
      '🏢 Entreprise : Copropriété',
      '💬 Message : Énergie: Gaz | Tél: 0612345678 | Structure: Syndic',
    ].join('\n'))
    expect(l.manques).toEqual([])
    expect(l.telephone).toBe('0612345678')
    expect(l.email).toBeNull()
  })

  /* Slack peut rendre une adresse en lien cliquable. Sans nettoyage, `email` vaudrait
     « <mailto:a@b.fr|a@b.fr> » et aucun envoi ne partirait jamais. */
  it('déshabille un e-mail que Slack a transformé en lien', () => {
    const l = analyseLeadSlack([
      '🔔 Nouveau lead',
      '👤 Nom : Jean Dupont',
      '📧 Email : <mailto:jean@dupont.fr|jean@dupont.fr>',
      '🏢 Entreprise : DUPONT SAS',
    ].join('\n'))
    expect(l.email).toBe('jean@dupont.fr')
  })

  /* Le séparateur est « : », mais la ligne Message en contient trois autres. Couper au dernier, ou
     sur tous, rendrait « Électricité | Coût » au lieu de la ligne entière. */
  it('coupe au premier deux-points, pas aux suivants', () => {
    expect(analyseLeadSlack(BRUNO).commentaire)
      .toContain('Énergie: Électricité | Coût: 1 000 - 2 000 €/mois€ | Tél: 0695428787')
  })

  it('survit à un émoji absent ou remplacé par son code', () => {
    const l = analyseLeadSlack([
      'Nouveau lead',
      ':bust_in_silhouette: Nom : Jean Dupont',
      'Entreprise : DUPONT SAS',
      'Message : Tél: 0611223344',
    ].join('\n'))
    expect(l.nom).toBe('DUPONT')
    expect(l.societe).toBe('DUPONT SAS')
  })

  /* Un type inconnu ne s'écarte pas : mieux vaut une valeur à corriger qu'une piste sans segment,
     et elle se verra dans la liste. */
  it('laisse passer un type qu’il ne connaît pas', () => {
    const l = analyseLeadSlack([
      '🔔 Nouveau lead', '👤 Nom : Jean Dupont', '🏢 Entreprise : X',
      '📋 Type : Collectivité', '💬 Message : Tél: 0611223344',
    ].join('\n'))
    expect(l.segment).toBe('Collectivité')
  })

  it('traite un nom d’un seul mot comme un nom, pas comme un prénom', () => {
    const l = analyseLeadSlack([
      '🔔 Nouveau lead', '👤 Nom : Dupont', '🏢 Entreprise : X', '💬 Message : Tél: 0611223344',
    ].join('\n'))
    expect(l.prenom).toBeNull()
    expect(l.nom).toBe('DUPONT')
  })
})
