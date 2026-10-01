import { ShieldCheck, Target } from 'lucide-react'

/* ══ CLIENT OU PROSPECT — William, 01/10/2026 ══
   « Si le dernier contrat renseigné est un contrat client, alors le compteur doit être "Client". Si
   c'est un contrat prospect, il doit être "Prospect". » La valeur vient de la base
   (`compteurs.statut_contractuel`), qui suit la même règle que l'échéance. Puis, le même jour : « si
   le dernier contrat est un contrat client mais que ce dernier est expiré, alors le compteur sera
   prospect », et enfin : « s'il n'y a aucun contrat, alors le compteur est prospect ». Les couleurs sont celles de la frise : vert pour KiWee, violet hachuré pour le prospect. */
export function CartoucheStatutContractuel({ statut }: { statut: 'CLIENT' | 'PROSPECT' | null }) {
  if (statut === 'CLIENT') {
    return (
      <span
        title="Le dernier contrat connu de ce compteur est un contrat KiWee, en cours ou à venir."
        className="inline-flex items-center gap-1.5 rounded-[8px] bg-[linear-gradient(90deg,#0D7A5F,#199B78)] py-[3px] pl-[5px] pr-2.5 text-[11.5px] font-bold text-white shadow-[0_2px_8px_rgba(13,122,95,.28)]"
      >
        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] bg-white/20"><ShieldCheck className="h-[12px] w-[12px]" strokeWidth={2.4} /></span>
        Client
      </span>
    )
  }
  /* Tout le reste est prospect — y compris sans aucun contrat (William, 01/10/2026 : « s'il n'y a
     aucun contrat, alors le compteur est prospect »). */
  return (
    <span
      title="Aucun contrat KiWee en cours ou à venir : le dernier contrat connu a été signé sans nous, notre contrat est expiré, ou aucun contrat n'est connu."
      className="inline-flex items-center gap-1.5 rounded-[6px] border-2 border-[#9A7CCB] bg-[repeating-linear-gradient(135deg,#F2ECFB_0_8px,#E6DAF7_8px_16px)] py-[2px] pl-[4px] pr-2.5 text-[11.5px] font-bold text-[#5E3F94]"
    >
      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[4px] bg-[#5E3F94] text-white"><Target className="h-[12px] w-[12px]" strokeWidth={2.4} /></span>
      Prospect
    </span>
  )
}
