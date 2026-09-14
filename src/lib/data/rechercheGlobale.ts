import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { SearchEntry } from '@/lib/search'
import { useFrappePosee } from '@/lib/useFrappePosee'

/**
 * Recherche globale (⌘K) executee par la base, et non en memoire.
 *
 * Le composant de resultats construisait son index a partir de onze tables entieres -- environ
 * 100 000 lignes, dont 66 000 interactions et 130 Mo -- des la premiere lettre tapee. Le montage
 * differe evitait de le faire sur chaque page, mais la premiere frappe payait toujours la note.
 *
 * Ici, chaque famille fait une requete filtree et plafonnee : la base cherche, le navigateur
 * affiche. Le cout ne depend plus de la taille du CRM.
 *
 * `ilike` avec des jokers de part et d'autre ne peut pas utiliser un index B-tree classique, mais
 * sur des tables de quelques milliers de lignes le parcours reste bien plus rapide que de tout
 * transferer. Si la recherche devient lente en grandissant, l'etape suivante est un index trigramme
 * (pg_trgm) sur les colonnes concernees -- pas un retour au chargement complet.
 */

const PAR_FAMILLE = 5

/** Quatre mots suffisent a identifier une ligne ; au-dela on empilerait des filtres pour rien. */
const MOTS_MAX = 4

/** Decoupe la saisie en mots, en otant ce que PostgREST interprete dans un filtre `or(...)`. */
function mots(query: string): string[] {
  return query
    .replace(/[,()%]/g, ' ')
    .split(/\s+/)
    .filter((mot) => mot.length > 0)
    .slice(0, MOTS_MAX)
}

/**
 * Applique la recherche a une requete : CHAQUE mot doit se retrouver dans AU MOINS UN des champs.
 *
 * Le filtre portait auparavant la saisie entiere sur chaque champ pris isolement. Chercher
 * « Romain Hebrard » ne rendait donc rien : `prenom` vaut « Romain » et `nom` vaut « HEBRARD »,
 * aucun des deux ne contient « Romain Hebrard ». Toute recherche « prenom + nom » etait muette,
 * et le meme travers touchait « SDC 17 » sur un site ou un compte en plusieurs mots.
 *
 * Chaque appel a `.or()` ajoute un filtre, et PostgREST combine les filtres successifs par ET :
 * on obtient bien « (mot1 dans un champ) ET (mot2 dans un champ) ».
 */
function appliquer<T>(requete: T, listeMots: string[], champs: string[]): T {
  let r = requete
  for (const mot of listeMots) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r = (r as any).or(champs.map((c) => `${c}.ilike.%${mot}%`).join(','))
  }
  return r
}

async function chercher(query: string): Promise<SearchEntry[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const listeMots = mots(q)
  if (listeMots.length === 0) return []

  /* ══ IL N'Y A PLUS DE FAMILLE « SITE » DANS LES RÉSULTATS ══════════════════════════════════
     Réunion du 09/09/2026 : l'objet site est retiré. Le laisser dans la recherche rendrait le
     retrait sans effet — c'est justement par la recherche qu'on retombait dessus, et proposer
     « SDC Plaisance » comme un objet à part entière est exactement ce qui a fait sélectionner
     des sites à la place des compteurs.

     Taper un nom d'adresse remonte donc désormais SES COMPTEURS (famille ci-dessous), c'est-à-dire
     les objets sur lesquels on travaille vraiment. Relevé du jour : 33 sites ne portent aucun
     compteur et ne remonteront plus ; 28 d'entre eux sont des coquilles vides (0 contrat,
     0 document, 0 action, 0 signal), et les 5 autres restent atteignables par leur contrat. */
  const [comptes, pistes, contacts, compteurs, mandats, opportunites, recommandations, contrats] = await Promise.all([
    appliquer(supabase.from('comptes').select('id, nom, ville, siren'), listeMots, ['nom', 'siren', 'ville']).limit(PAR_FAMILLE),
    /* ══ LA PISTE MANQUAIT TOUT ENTIÈRE ════════════════════════════════════════════════════════
       Naoëlle, 14/09/2026 : elle cherche « VEDRENNE » et la barre répond « aucun résultat », alors
       que la piste PST-2026-10102 existe, avec le nom VEDRENNE en toutes lettres. Sept familles y
       étaient ; `pistes` n'en faisait pas partie — les 5 145 lignes du premier écran du cycle
       commercial étaient introuvables autrement qu'en ouvrant la page et en refiltrant à la main.

       ON CHERCHE SUR LES TROIS CHAMPS D'IDENTITÉ ET PAS SEULEMENT SUR `contact_nom` : depuis la
       reprise du 14/09, le nom vit en civilité + prénom + nom, et `contact_nom` garde la forme
       Salesforce. Chercher l'un sans les autres redonnerait le trou d'à côté. */
    appliquer(
      supabase.from('pistes').select('id, reference, reference_precedente, societe, contact_nom, prenom, nom, email, telephone'),
      listeMots,
      /* `reference_precedente` EST LÀ POUR UNE RAISON PRÉCISE. La renumérotation chronologique du
         14/09/2026 a changé 5 144 références : qui a noté « PST-2026-10102 » sur un carnet tape
         aujourd'hui un numéro qui ne désigne plus rien. La colonne garde l'ancienne, et la barre
         la cherche comme la nouvelle — sinon la décision de renuméroter coûterait à tout le monde
         pendant des semaines. */
      ['reference', 'reference_precedente', 'societe', 'contact_nom', 'prenom', 'nom', 'email', 'telephone'],
    ).limit(PAR_FAMILLE),
    appliquer(supabase.from('contacts').select('id, prenom, nom, email, telephone, compte:comptes(nom)'), listeMots, ['nom', 'prenom', 'email', 'telephone']).limit(PAR_FAMILLE),
    /* ══ LE COMPTEUR SE CHERCHE AUSSI PAR SON SITE ════════════════════════════════════════════
       Naoëlle, 09/09/2026 : « si par exemple un commercial recherche un site qui s'appelle SDC
       Plaisance, il le retrouvera dans le libellé de site du compteur qui lui était attribué ? »

       La réponse était NON, et c'était un trou à retardement. Le compteur ne se cherchait que par
       son numéro de PDL et son libellé propre ; « SDC Plaisance » ne remontait que par la famille
       « site ». Le jour où la table `sites` disparaît — décision du 09/09/2026 — cette recherche
       serait devenue muette sans que rien ne le signale.

       On cherche donc désormais dans `libelle_site` et `adresse_site`, les deux colonnes que le
       compteur porte depuis la migration 20260909100000. Vérifié : « SDC PLAISANCE » remonte son
       compteur, et aucun des 6 067 noms de site n'est absent des compteurs. */
    appliquer(
      supabase.from('compteurs').select('id, numero_point, libelle, libelle_site, adresse_site, site:sites(nom)'),
      listeMots,
      ['numero_point', 'libelle', 'libelle_site', 'adresse_site'],
    ).limit(PAR_FAMILLE),
    appliquer(supabase.from('mandats').select('id, reference, compte:comptes(nom)'), listeMots, ['reference']).limit(PAR_FAMILLE),
    /* L'OPPORTUNITÉ MANQUAIT, ET SA RÉFÉRENCE EST FAITE POUR ÊTRE TAPÉE.
       Naoëlle, 12/09/2026 : elle cherche « OPP-2026-018 » et la barre répond « aucun résultat ».
       Neuf familles y étaient, pas celle-là — alors que c'est le seul objet dont on se transmet la
       référence à l'oral pour se retrouver. On cherche aussi sur le type, qui est le seul autre
       texte libre qu'elle porte. */
    appliquer(supabase.from('opportunites').select('id, reference, type_opportunite, compte:comptes(nom)'), listeMots, ['reference', 'type_opportunite']).limit(PAR_FAMILLE),
    // `!<contrainte>` obligatoire ici : recommandations et contrats ont CHACUNE deux cles
    // etrangeres vers comptes (le compte du dossier et le fournisseur). Un embed non qualifie
    // rend PGRST201 « relation ambigue » et fait echouer toute la famille de resultats.
    appliquer(supabase.from('recommandations').select('id, nom, compte:comptes!recommandations_compte_id_fkey(nom)'), listeMots, ['nom']).limit(PAR_FAMILLE),
    appliquer(supabase.from('contrats').select('id, reference, reference_fournisseur, compte:comptes!contrats_compte_id_fkey(nom)'), listeMots, ['reference', 'reference_fournisseur']).limit(PAR_FAMILLE),
  ])

  const nomDe = (v: unknown): string => {
    const x = Array.isArray(v) ? v[0] : v
    return (x as { nom?: string } | null)?.nom ?? ''
  }

  const entrees: SearchEntry[] = []
  for (const c of comptes.data ?? []) {
    entrees.push({ kind: 'compte', id: c.id, label: c.nom, sublabel: c.ville ?? '', to: `/comptes/${c.id}`, fields: [] })
  }
  /** La saisie tombe-t-elle sur l'ANCIENNE référence, et pas sur la nouvelle ? */
  const trouveeParSonAncienNumero = (p: { reference?: string | null; reference_precedente?: string | null }) => {
    const ancienne = (p.reference_precedente ?? '').toLowerCase()
    if (!ancienne) return false
    const courante = (p.reference ?? '').toLowerCase()
    return listeMots.some((m) => ancienne.includes(m.toLowerCase()) && !courante.includes(m.toLowerCase()))
  }

  for (const p of pistes.data ?? []) {
    /* LA SOCIÉTÉ EN TITRE, LA PERSONNE EN SOUS-TITRE : c'est l'ordre des cartes du kanban, et
       c'est par la société qu'on cherche neuf fois sur dix. La référence complète la ligne pour
       les fois où c'est elle qu'on se transmet. */
    entrees.push({
      kind: 'piste',
      id: p.id,
      label: p.societe || [p.prenom, p.nom].filter(Boolean).join(' ') || p.contact_nom || 'Piste',
      sublabel: [
        [p.prenom, p.nom].filter(Boolean).join(' ') || p.contact_nom,
        p.reference,
        /* ON DIT POURQUOI ÇA A MATCHÉ. 485 anciens numéros sont aujourd'hui la référence COURANTE
           d'une autre piste : taper l'un d'eux rend donc deux résultats. Sans cette mention, les
           deux se ressemblent et l'on choisit au hasard ; avec elle, on voit lequel répond à ce
           qu'on a noté et lequel porte le numéro aujourd'hui. */
        trouveeParSonAncienNumero(p) ? `ancienne réf. ${p.reference_precedente}` : null,
      ].filter(Boolean).join(' · '),
      to: `/pistes/${p.id}`,
      fields: [],
    })
  }
  for (const c of contacts.data ?? []) {
    entrees.push({
      kind: 'contact',
      id: c.id,
      label: `${c.prenom ?? ''} ${c.nom ?? ''}`.trim(),
      sublabel: [nomDe(c.compte), c.email].filter(Boolean).join(' · '),
      to: `/contacts/${c.id}`,
      fields: [],
    })
  }
  for (const c of compteurs.data ?? []) {
    /* LA LIGNE SECONDAIRE MONTRE L'ADRESSE DE SITE, et non plus seulement le nom du site : c'est
       ce qui permet de distinguer deux « SDC Plaisance » dans deux communes. `adresse_site` la
       contient déjà (nom, code postal, ville), on retombe sur le nom du site tant que la table
       existe encore. */
    entrees.push({
      kind: 'compteur',
      id: c.id,
      label: c.numero_point,
      sublabel: [c.adresse_site ?? nomDe(c.site), c.libelle].filter(Boolean).join(' · '),
      to: `/compteurs/${c.id}`,
      fields: [],
    })
  }
  for (const m2 of mandats.data ?? []) {
    entrees.push({ kind: 'mandat', id: m2.id, label: m2.reference ?? 'Mandat', sublabel: nomDe(m2.compte), to: `/mandats/${m2.id}`, fields: [] })
  }
  for (const o of opportunites.data ?? []) {
    entrees.push({
      kind: 'opportunite',
      id: o.id,
      label: o.reference ?? 'Opportunité',
      sublabel: [nomDe(o.compte), o.type_opportunite].filter(Boolean).join(' · '),
      to: `/opportunites/${o.id}`,
      fields: [],
    })
  }
  for (const r of recommandations.data ?? []) {
    entrees.push({ kind: 'recommandation', id: r.id, label: r.nom, sublabel: nomDe(r.compte), to: `/recommandations/${r.id}`, fields: [] })
  }
  for (const c of contrats.data ?? []) {
    entrees.push({
      kind: 'contrat',
      id: c.id,
      label: c.reference ?? c.reference_fournisseur ?? 'Contrat',
      sublabel: nomDe(c.compte),
      to: `/contrats/${c.id}`,
      fields: [],
    })
  }
  return entrees
}

export function useRechercheGlobale(query: string) {
  const terme = useFrappePosee(query.trim())
  return useQuery({
    queryKey: ['recherche-globale', terme],
    queryFn: () => chercher(terme),
    enabled: terme.length >= 2,
    // La frappe change la cle a chaque lettre : garder les resultats precedents evite que la liste
    // clignote entre deux caracteres.
    placeholderData: (precedent) => precedent,
    staleTime: 30 * 1000,
  })
}
