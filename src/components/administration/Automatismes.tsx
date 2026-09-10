import { useQuery } from '@tanstack/react-query'
import { Clock, Webhook, Database, Cog, ExternalLink } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import cronsVercel from '../../../vercel.json'

/**
 * TOUT CE QUI TOURNE SANS QUE PERSONNE CLIQUE.
 *
 * Demandé par Naoëlle le 24/08/2026 : « il faudrait que quelque part dans administration on puisse
 * voir toutes les tâches et actions de ce genre, flow etc de l'app, pas forcément le gérer car ça je
 * le fais avec toi, mais qu'on puisse voir quoi tourne déjà afin de ne pas avoir de doublons. »
 *
 * DONC UNE PAGE QUI SE LIT, PAS UNE CONSOLE. Aucun bouton ne déclenche, ne suspend ni ne modifie
 * quoi que ce soit : le pilotage passe par le code, et un interrupteur ici donnerait l'illusion
 * qu'on peut arrêter une tâche sans que personne d'autre le sache.
 *
 * LES TÂCHES PLANIFIÉES SONT LUES DANS `vercel.json`, pas recopiées. C'est le seul moyen qu'elles ne
 * mentent jamais : le fichier EST la déclaration que Vercel exécute, importé ici au moment de la
 * construction. Ajouter une tâche la fait apparaître sur cette page sans y toucher.
 *
 * LE RESTE EST UN INVENTAIRE ÉCRIT À LA MAIN, et c'est dit à l'écran. Les déclencheurs en base et
 * les règles de l'application ne sont pas interrogeables depuis le navigateur — PostgREST n'expose
 * pas `pg_trigger`. Chaque entrée nomme donc son fichier source, pour qu'un doute se vérifie en dix
 * secondes. Toute nouvelle automatisation doit être ajoutée ici : c'est la contrepartie de ne pas
 * pouvoir la deviner.
 */

/** Ce que chaque tâche planifiée fait, indexé par son chemin — le seul contenu recopié. */
const SENS_DES_TACHES: Record<string, { titre: string; sens: string; fichier: string }> = {
  '/api/docusign/refresh-sessions': {
    titre: 'Sessions DocuSign',
    sens:
      'Renouvelle les jetons DocuSign de chacun. Le jeton de rafraîchissement vaut trente jours et ne se renouvelle qu’en s’utilisant : sans cette tâche, la session de quelqu’un qui n’envoie pas de mandat pendant un mois meurt en silence, et il l’apprend devant son client.',
    fichier: 'api/docusign/refresh-sessions.ts',
  },
  '/api/mandats/expirer': {
    titre: 'Expiration des mandats',
    sens:
      'Passe à « Expiré » les mandats actifs dont la date de fin est dépassée. Rien ne le faisait avant : un mandat périmé restait affiché « Actif », ce qui fait consulter des fournisseurs sans autorisation valable. Ne touche que les mandats actifs, et jamais un mandat sans date de fin.',
    fichier: 'api/mandats/expirer.ts',
  },
  '/api/docusign/rattraper-enveloppes': {
    titre: 'Rattrapage des signatures',
    sens:
      'Interroge DocuSign toutes les heures sur les enveloppes en attente, au lieu d’attendre que DocuSign nous prévienne. Cette notification dépend d’une configuration qui vit hors du dépôt et a déjà lâché deux fois — et son silence ne ressemble pas à une panne : un contrat signé s’affiche simplement « pas encore envoyé », et personne ne va chercher. Michel, 31/08/2026 : cinq mandats et un contrat étaient bloqués depuis dix-sept jours.',
    fichier: 'api/docusign/rattraper-enveloppes.ts',
  },
  '/api/contrats/reevaluer-statuts': {
    titre: 'Statuts de contrat',
    sens:
      'Fait passer à « Actif » les contrats dont la date de début est arrivée. Une seule transition, délibérément : « Actif » → « Terminé » attend la réponse de Michel sur la tacite reconduction, car dans l’énergie un contrat reconduit court au-delà de sa date de fin d’origine. Mesuré le 08/09/2026 : 19 contrats affichaient un statut que leurs propres dates contredisaient, 20 le lendemain — la dérive était en cours, à environ un contrat par jour.',
    fichier: 'api/contrats/reevaluer-statuts.ts',
  },
  '/api/signaux/echeances': {
    titre: 'Signaux d’échéance',
    sens:
      'Crée un signal par contact dont un compteur arrive à échéance dans les douze mois. Un signal par contact et non par compteur : 1 065 compteurs concernés, mais 593 contacts. N’ouvre pas de signal à un contact qui en a déjà un ouvert.',
    fichier: 'api/signaux/echeances.ts',
  },
}

interface FluxEntrant {
  titre: string
  sens: string
  fichier: string
  declencheur: string
}

const FLUX_ENTRANTS: FluxEntrant[] = [
  {
    titre: 'Webhook DocuSign',
    declencheur: 'Appelé par DocuSign à chaque changement d’enveloppe',
    sens:
      'Fait avancer le statut d’un mandat quand l’enveloppe est envoyée, consultée ou signée. La signature HMAC est vérifiée sur les octets exacts reçus — analyser puis re-sérialiser le corps invalidait toutes les notifications, et aucun mandat ne passait « Signé ».',
    fichier: 'api/docusign/webhook.ts',
  },
  {
    titre: 'Retour OAuth DocuSign',
    declencheur: 'Appelé par DocuSign après une autorisation',
    sens: 'Enregistre la session DocuSign de la personne qui vient d’autoriser Kimatch.',
    fichier: 'api/docusign/callback.ts',
  },
  {
    titre: 'Retour OAuth Gmail',
    declencheur: 'Appelé par Google après une autorisation',
    sens: 'Enregistre la session Gmail utilisée pour envoyer les demandes de cotation.',
    fichier: 'api/gmail/callback.ts',
  },
  {
    titre: 'Dépôt Pilot',
    declencheur: 'Appelé par Kimatch quand quelqu’un envoie une demande de support',
    sens:
      'Dépose la demande chez Pilot côté serveur, parce que l’appel exige une clé d’API : lue depuis le navigateur, elle serait en clair dans le bundle et n’importe qui pourrait déposer des demandes en notre nom.',
    fichier: 'api/pilot/intake.ts',
  },
]

interface Declencheur {
  nom: string
  sens: string
  portee: string
  fichier: string
}

/* RELEVÉ EN BASE LE 10/09/2026, et non de mémoire :
   `select tgname, count(*) from pg_trigger where not tgisinternal group by tgname`.
   34 déclencheurs distincts, dont 8 que cette page ne mentionnait pas — la corbeille et le
   garde-fou des interactions compris, alors que ce sont eux qui décident du sort des données
   quand on supprime quelque chose.

   Et `trg_audit_trace` était annoncé sur 16 tables : il en couvre 22. Un inventaire tenu à la
   main vieillit ; le seul remède est de le relever, pas de s'en souvenir. */
const DECLENCHEURS_BASE: Declencheur[] = [
  {
    nom: 'trg_audit_trace',
    portee: '22 tables métier',
    sens:
      'Renseigne à chaque écriture qui a créé, qui a modifié et quand. Ne s’applique qu’aux tables qui portent les colonnes correspondantes : posé sur une table qui n’en a pas, il fait échouer TOUTE écriture — c’est ce qui empêchait Agathe d’attacher un fichier à un compteur.',
    fichier: 'migration 20260823100000',
  },
  {
    nom: 'trg_reference_chaine',
    portee: 'listes, pistes, opportunités, requêtes, rémunérations',
    sens: 'Attribue la référence lisible à la création — OPP-2026-001, PST-2026-014, et ainsi de suite.',
    fichier: 'migration 20260823190000',
  },
  {
    nom: 'mettre_a_jour_date_modification',
    portee: '14 tables de référentiel',
    sens: 'Tient à jour la date de modification des référentiels : rôles, permissions, postes, formules TURPE, moteurs de calcul.',
    fichier: 'migrations du référentiel',
  },
  {
    nom: 'trg_journaliser_suppression',
    portee: '16 tables métier',
    sens:
      'Écrit dans la corbeille tout ce qui se supprime, y compris ce qui part en cascade. C’est ce qui permet de remettre en place un compte effacé par erreur avec ses contacts, ses compteurs et ses contrats — voir l’onglet Corbeille.',
    fichier: 'migration 20260907160000',
  },
  {
    nom: 'trg_interactions_orphelines',
    portee: '11 tables : comptes, contacts, mandats, recommandations, pistes, signaux, actions, sites, opportunités, suivis, versions',
    sens:
      'Supprime les interactions dont l’objet effacé était le DERNIER rattachement — une interaction que rien ne porte n’apparaît sur aucune fiche et devient introuvable. Corrigé le 10/09/2026 : chaque déclencheur vide désormais sa propre colonne avant de passer la main, sans quoi deux d’entre eux se renvoyaient la responsabilité pendant une cascade et personne ne gardait — ce qui rendait la suppression d’un compte impossible.',
    fichier: 'migrations 20260907240000 et 20260910280000',
  },
  {
    nom: 'trg_compteur_herite_de_son_site',
    portee: 'compteurs',
    sens:
      'Donne son adresse et son client à un compteur qui vient d’être créé, et les fait suivre quand il change de groupe d’adresse. Avant le 10/09/2026, un nouveau compteur naissait sans adresse et un compteur déplacé gardait celle de son ancien site.',
    fichier: 'migrations 20260910120000 et 20260910140000',
  },
  {
    nom: 'trg_propager_contrat_vers_recommandation',
    portee: 'contrats',
    sens: 'Marque la recommandation gagnée quand son contrat est signé — le résultat commercial se déduit du contrat, il ne se saisit pas deux fois.',
    fichier: 'migrations de propagation',
  },
  {
    nom: 'trg_propager_contrat_vers_suivi',
    portee: 'contrats',
    sens: 'Fait avancer le suivi de contrat quand le contrat change, pour que le service client n’ait pas à recopier l’information.',
    fichier: 'migrations de propagation',
  },
  {
    nom: 'trg_propager_version_vers_recommandation, trg_propager_offre_vers_consultation, trg_propager_cloture_vers_statut, trg_propager_finalite_vers_statut',
    portee: 'versions de recommandation, offres, recommandations',
    sens: 'Tiennent alignés les statuts d’une recommandation et de ses versions : ce qui se décide sur une offre remonte à la version, et ce qui se décide sur la version remonte à la recommandation.',
    fichier: 'migrations de propagation',
  },
  {
    nom: 'trg_garde_fou_version_sans_offre',
    portee: 'offres_fournisseurs',
    sens: 'Refuse une offre qui ne se rattache à aucune version de cotation — une offre sans version ne se compare à rien et ne s’affiche nulle part.',
    fichier: 'migration du garde-fou des offres',
  },
  {
    nom: 'trg_piste_convertie_statut',
    portee: 'pistes',
    sens: 'Passe la piste à « Convertie » quand le compte est créé depuis elle.',
    fichier: 'migration de conversion des pistes',
  },
  {
    nom: 'trg_regenerer_signature',
    portee: 'profils_signatures_email',
    sens: 'Reconstruit la signature de courriel quand le profil change de poste ou de téléphone.',
    fichier: 'migration des signatures',
  },
]

interface RegleApp {
  titre: string
  sens: string
  fichier: string
}

const REGLES_APP: RegleApp[] = [
  {
    titre: 'Le statut d’une opportunité se calcule',
    sens:
      'Nouvelle, En qualification, Couverture mandat, Prête à convertir, Convertie, Abandonnée : le palier se déduit des objets réunis, il ne se choisit pas dans une liste. « La maturité se fait si les objets sont valides » (Michel).',
    fichier: 'src/lib/data/opportunites.ts',
  },
  {
    titre: 'Échéance prouvée ou estimée',
    sens:
      'Prouvée si un contrat en cours est rattaché au compteur, estimée si la date est seulement déclarée. Déduit, jamais stocké — une case à cocher « prouvée » se cocherait sans preuve.',
    fichier: 'src/lib/echeance.ts',
  },
  {
    titre: 'Suggestion de relance à deux jours ouvrés',
    sens:
      'Propose de relancer quand la version actuelle est présentée depuis deux jours ouvrés sans réponse. Kimatch propose, il n’agit pas : rien ne part tout seul, et le bouton consigne l’échange réellement eu.',
    fichier: 'src/lib/relance.ts',
  },
  {
    titre: 'Un signal converti passe à « Converti »',
    sens:
      'Le statut change APRÈS la création de l’opportunité, jamais avant : dans l’autre ordre, un échec laisserait un signal marqué converti sans rien derrière, invisible dans les listes à traiter.',
    fichier: 'src/components/signal/DialogConversionSignal.tsx',
  },
  {
    titre: 'Le contrat suit deux chemins, pas un',
    sens:
      'La signature (Brouillon → Demandé → Réceptionné → Envoyé → Consulté → Signé) et la vie du contrat (À venir / En cours / Expiré, plus Résilié) sont deux progressions distinctes. William, 09/09/2026 : « tant qu’il n’est pas signé, tu ne peux pas lui donner un statut [de vie] ». Le statut de vie se CALCULE à la lecture depuis les deux dates : sur 1 561 contrats, 14 portaient une valeur stockée que leurs propres dates démentaient — personne ne les avait saisies, c’est la colonne qui avait vieilli en silence.',
    fichier: 'src/lib/statutVieContrat.ts',
  },
  {
    titre: 'L’application se recharge quand un de ses morceaux a disparu',
    sens:
      'Après une mise en ligne, un onglet resté ouvert demande des fichiers qui n’existent plus et reste blanc. Kimatch le détecte et recharge une fois, avec un garde-fou de dix secondes contre la boucle. Ce n’est pas un rechargement à chaque clic : ce serait repayer le démarrage complet à chaque navigation pour un incident qui n’arrive qu’après un déploiement.',
    fichier: 'src/lib/chargerPage.ts',
  },
  {
    titre: 'Un mandat signé devient actif',
    sens:
      'Signalé par Michel : « c’est signé, mais il est toujours pas actif, et ça ne montre pas ce compte quand je veux créer une recommandation. » Rien ne le faisait — ni le webhook, ni l’application, ni un déclencheur.',
    fichier: 'migration 20260821110000',
  },
]

/** Traduit une expression cron en phrase. Ne couvre que nos trois formes, et le dit. */
function heureLisible(cron: string): string {
  const [minute, heure, jour, mois, semaine] = cron.split(' ')
  if (jour === '*' && mois === '*' && semaine === '*' && /^\d+$/.test(heure) && /^\d+$/.test(minute)) {
    // UTC, et affiché comme tel plus l'heure de Paris : une tâche « à 3 h » qui tourne à 5 h chez
    // nous est la source d'erreur classique quand on vient vérifier qu'elle a tourné.
    const hUtc = Number(heure)
    const hParis = (hUtc + 2) % 24
    // La minute se complète aussi : « 03 h 0 UTC » se lisait à l'écran, ce qui a l'air d'un bug
    // d'affichage et fait douter du reste de la page.
    const mm = minute.padStart(2, '0')
    return `chaque nuit à ${String(hUtc).padStart(2, '0')} h ${mm} UTC — ${String(hParis).padStart(2, '0')} h ${mm} à Paris`
  }
  /* UNE PLAGE D'HEURES — « 0 7-20 * * * ». Le rattrapage des signatures tourne toutes les heures
     de la journée, et la page affichait crûment « expression cron : 0 7-20 * * * ». Une page qui
     existe pour qu'on sache ce qui tourne ne peut pas laisser son entrée la plus fréquente en
     langage de machine. */
  const plage = /^(\d+)-(\d+)$/.exec(heure)
  if (jour === '*' && mois === '*' && semaine === '*' && plage && /^\d+$/.test(minute)) {
    const mm = minute.padStart(2, '0')
    const pDebut = (Number(plage[1]) + 2) % 24
    const pFin = (Number(plage[2]) + 2) % 24
    return `chaque heure de ${plage[1]} h à ${plage[2]} h UTC — ${pDebut} h à ${pFin} h à Paris, à la minute ${mm}`
  }
  return `expression cron : ${cron}`
}

/**
 * Le dernier EFFET observé de chaque tâche, et non sa dernière exécution.
 *
 * La distinction n'est pas de la pinaillerie : une tâche qui tourne et ne trouve rien à faire ne
 * laisse aucune trace en base. Une date ancienne ici ne prouve donc PAS qu'elle ne tourne pas — elle
 * dit seulement que rien n'a changé depuis. Écrire « dernière exécution » serait faux, et la
 * première conclusion qu'on en tirerait — « la tâche est cassée » — le serait aussi.
 */
function useDerniersEffets() {
  return useQuery({
    queryKey: ['automatismes', 'derniers-effets'],
    queryFn: async () => {
      const [signaux, mandats] = await Promise.all([
        supabase
          .from('signaux')
          .select('date_creation')
          .eq('origine', 'AUTOMATIQUE')
          .order('date_creation', { ascending: false })
          .limit(1),
        supabase
          .from('mandats')
          .select('date_modification, statut:statuts_mandats(code)')
          .order('date_modification', { ascending: false })
          .limit(50),
      ])
      const expire = (mandats.data ?? []).find((m) => {
        const s = m.statut as { code: string } | { code: string }[] | null
        return (Array.isArray(s) ? s[0]?.code : s?.code) === 'EXPIRE'
      })
      return {
        '/api/signaux/echeances': signaux.data?.[0]?.date_creation ?? null,
        '/api/mandats/expirer': expire?.date_modification ?? null,
      } as Record<string, string | null>
    },
  })
}

function Titre({ icone: Icone, children, aide }: { icone: typeof Clock; children: string; aide: string }) {
  return (
    <div className="mb-2.5 mt-6 flex items-start gap-2.5 first:mt-0">
      <span className="mt-0.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-km-soft text-km-muted">
        <Icone className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <h3 className="text-km-name font-bold tracking-[-.01em] text-km-text">{children}</h3>
        <p className="text-km-body text-km-muted">{aide}</p>
      </div>
    </div>
  )
}

function Ligne({
  titre,
  meta,
  sens,
  source,
  ton = 'neutre',
}: {
  titre: string
  meta?: string
  sens: string
  source: string
  ton?: 'neutre' | 'planifie'
}) {
  return (
    <div className={cn('border-t border-km-line px-4 py-3 first:border-t-0', ton === 'planifie' && 'bg-km-soft/40')}>
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="text-km-body font-bold text-km-text">{titre}</span>
        {meta && <span className="font-mono text-km-label text-km-muted">{meta}</span>}
      </div>
      <p className="mt-1 max-w-[85ch] text-km-body leading-relaxed text-km-muted">{sens}</p>
      <p className="mt-1.5 font-mono text-km-label text-km-faint">{source}</p>
    </div>
  )
}

export function Automatismes() {
  const crons = (cronsVercel as { crons?: { path: string; schedule: string }[] }).crons ?? []
  const { data: effets } = useDerniersEffets()

  const dateHeure = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : null

  return (
    <div>
      <div className="mb-4 rounded-km-md border border-km-line bg-km-soft px-4 py-3">
        <p className="text-km-body leading-relaxed text-km-muted">
          Tout ce qui s’exécute sans que personne clique. <strong className="font-semibold">Cette page se lit, elle ne pilote pas</strong> :
          il n’y a aucun bouton pour déclencher ou suspendre quoi que ce soit, le pilotage passe par le
          code. Elle existe pour qu’on sache ce qui tourne déjà avant d’en ajouter.
        </p>
        <p className="mt-2 text-km-label leading-relaxed text-km-muted">
          Les tâches planifiées sont <strong className="font-semibold">lues dans <span className="font-mono">vercel.json</span></strong>, donc elles
          ne peuvent pas mentir. Le reste est un inventaire écrit à la main : les déclencheurs de la
          base ne sont pas interrogeables depuis le navigateur. Chaque ligne nomme son fichier — et
          toute nouvelle automatisation doit être ajoutée ici.
        </p>
      </div>

      <Titre icone={Clock} aide={`${crons.length} tâches, exécutées par Vercel`}>Tâches planifiées</Titre>
      <Card className="overflow-hidden">
        {crons.map((c) => {
          const info = SENS_DES_TACHES[c.path]
          const effet = dateHeure(effets?.[c.path])
          return (
            <Ligne
              key={c.path}
              ton="planifie"
              titre={info?.titre ?? c.path}
              meta={heureLisible(c.schedule)}
              sens={
                (info?.sens ?? 'Tâche déclarée dans vercel.json sans description ici — à documenter.') +
                (effet ? ` · Dernier effet observé en base le ${effet}.` : '')
              }
              source={`${c.path}${info ? ` — ${info.fichier}` : ''}`}
            />
          )
        })}
      </Card>
      <p className="mt-1.5 px-1 text-km-label italic text-km-faint">
        « Dernier effet observé » et non « dernière exécution » : une tâche qui tourne et ne trouve
        rien à faire ne laisse aucune trace. Une date ancienne ne prouve donc pas qu’elle est en panne.
      </p>

      <Titre icone={Webhook} aide="Déclenchés par un service extérieur, pas par nous">Flux entrants</Titre>
      <Card className="overflow-hidden">
        {FLUX_ENTRANTS.map((f) => (
          <Ligne key={f.fichier} titre={f.titre} meta={f.declencheur} sens={f.sens} source={f.fichier} />
        ))}
      </Card>

      <Titre icone={Database} aide="Exécutés par PostgreSQL à chaque écriture concernée">Déclencheurs en base</Titre>
      <Card className="overflow-hidden">
        {DECLENCHEURS_BASE.map((d) => (
          <Ligne key={d.nom} titre={d.nom} meta={d.portee} sens={d.sens} source={d.fichier} />
        ))}
      </Card>

      <Titre icone={Cog} aide="Calculées à l’affichage ou déclenchées par une action">Règles automatiques de l’application</Titre>
      <Card className="overflow-hidden">
        {REGLES_APP.map((r) => (
          <Ligne key={r.fichier} titre={r.titre} sens={r.sens} source={r.fichier} />
        ))}
      </Card>

      <div className="mt-5 flex items-start gap-2 rounded-km-md border border-dashed border-km-line px-4 py-3">
        <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-km-muted" />
        <p className="text-km-body leading-relaxed text-km-muted">
          Les journaux d’exécution des tâches planifiées sont chez Vercel, dans{' '}
          <span className="font-mono">Settings → Cron Jobs</span> puis l’onglet des journaux de chaque
          fonction. C’est le seul endroit qui dise si une tâche a été appelée — Kimatch ne voit que ce
          qu’elle a écrit.
        </p>
      </div>

      <div className="mt-3 px-1">
        <Badge tone="neutral">
          {crons.length} tâches planifiées · {FLUX_ENTRANTS.length} flux entrants ·{' '}
          {DECLENCHEURS_BASE.length} déclencheurs · {REGLES_APP.length} règles
        </Badge>
      </div>
    </div>
  )
}
