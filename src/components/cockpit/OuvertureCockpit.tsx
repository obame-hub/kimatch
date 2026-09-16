import { HardHat } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LA PAGE AFFICHÉE TANT QUE LE COCKPIT N'EST PAS OUVERT
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * William, 16/09/2026 : « j'aimerais que tu push pour éviter d'avoir de trop gros push à la fin du
 * projet mais en attendant, en prod, j'aimerais que le clic sur Cockpit affiche une page en
 * construction. En local en revanche je pourrai faire toutes les modifs. Et quand je te dirais, tu
 * pourras Ouvrir la fonctionnalité. »
 *
 * ══ POURQUOI UN INTERRUPTEUR ET NON UNE BRANCHE ══
 *
 * Le dépôt travaille en commits directs sur `master`, sans branche ni relecture — c'est le choix
 * assumé du projet tant que l'équipe reste petite. Garder le Cockpit hors de `master` jusqu'à son
 * ouverture voudrait donc dire ne pas le pousser du tout, et c'est précisément ce qu'on veut
 * éviter : un seul gros versement en fin de projet, impossible à relire.
 *
 * L'interrupteur permet de pousser chaque jour ce qui est écrit, sans que personne ne tombe sur un
 * écran inachevé. C'est l'idiome du dépôt : `AFFICHER_LES_LISTES = false` dans `Prospection.tsx`
 * masque l'onglet des listes depuis le 25/08 exactement de cette façon.
 *
 * ══ CE QUI DÉCIDE, ET CE QUI N'EST PAS UN RÉGLAGE ══
 *
 * `import.meta.env.DEV` est vrai sous `npm run dev` et `npm run dev:sandbox`, faux dans tout ce que
 * Vite construit — donc faux sur Vercel. Le Cockpit est ainsi ENTIÈREMENT utilisable en local sans
 * qu'aucune variable d'environnement n'existe, et fermé en ligne sans qu'on ait à y penser.
 *
 * CE N'EST DÉLIBÉRÉMENT PAS UN DROIT NI UNE PRÉFÉRENCE. Un réglage en base, ou une permission par
 * rôle, se règle depuis l'administration — et se dérègle. Ici l'ouverture est une décision de
 * publication : elle appartient au code, pas aux données.
 *
 * L'interrupteur lui-même vit dans `src/lib/cockpitOuvert.ts`, avec le raisonnement complet.
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * La page affichée en production tant que le Cockpit n'est pas ouvert.
 *
 * ELLE DIT CE QUI ARRIVE, ET NON « PAGE EN CONSTRUCTION ». Un écran qui annonce des travaux sans
 * dire lesquels donne l'impression d'une panne ; celui-ci donne envie d'y revenir, et coupe court
 * aux questions à celui qui tombe dessus par curiosité.
 */
export function CockpitEnConstruction() {
  return (
    <div className="flex min-h-screen flex-col">
      <Topbar title="Cockpit" />
      <div className="flex flex-1 flex-col justify-center gap-7 bg-km-side px-5 py-14 text-km-side-text sm:px-10">
        <span className="inline-flex items-center gap-2.5 self-start rounded-km bg-km-amber/15 px-3 py-1.5 font-mono text-km-label uppercase tracking-[0.16em] text-km-amber">
          <HardHat className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          En construction
        </span>

        <h1 className="max-w-[26ch] text-balance font-mono text-[clamp(26px,4.6vw,48px)] font-semibold leading-[1.02] tracking-tight">
          Le Cockpit arrive.
        </h1>

        <p className="max-w-[62ch] text-km-lead leading-relaxed text-km-side-muted">
          Toute la prospection dans un seul écran : un plan du jour de soixante actions, figé le
          matin, et un vivier où dorment les échéances que personne ne travaille. Puis un sprint
          chronométré qui fait défiler les fiches une à une, du premier appel à la prochaine action.
        </p>

        <dl className="grid max-w-[720px] grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5">
          {[
            ['Le plan du jour', 'Soixante actions, dans l’ordre, qui ne se rechargent pas'],
            ['Le vivier', 'Les contacts à échéance dont aucune opportunité ne s’occupe'],
            ['Le sprint', 'Une fiche, un appel, une suite — et on passe à la suivante'],
          ].map(([titre, quoi]) => (
            <div key={titre} className="rounded-km border border-km-side-line bg-km-side-bas px-4 py-3.5">
              <dt className="font-mono text-km-label uppercase tracking-[0.14em] text-km-side-muted">{titre}</dt>
              <dd className="mt-1.5 text-km-body leading-snug">{quoi}</dd>
            </div>
          ))}
        </dl>

        <p className="max-w-[62ch] text-km-body text-km-side-muted">
          L’écran est déjà utilisable en local pour ceux qui développent. Il s’ouvrira ici quand il
          aura été essayé pour de bon — pas avant.
        </p>
      </div>
    </div>
  )
}
