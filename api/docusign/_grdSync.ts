// Synchro GRD automatique déclenchée par le webhook DocuSign quand un mandat passe à SIGNE --
// remplace le polling navigateur fragile de Tools (useMandatPolling, 15s, tourne dans le
// navigateur de tous les utilisateurs connectés) par un vrai déclenchement serveur, sur
// l'événement réel de signature. Persiste directement via le client service_role (pas de
// session utilisateur disponible dans un webhook) -- logique d'écriture dupliquée depuis
// src/lib/data/compteurs.ts (useSyncCompteurElec/useSyncCompteurGaz) plutôt qu'importée, pour ne
// pas faire dépendre le code serveur de l'alias `@/` ni d'un module qui initialise un client
// Supabase côté navigateur.
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchElecData } from '../enedis/_client.js'
import { fetchGazData } from '../grd/_client.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any, any, any>

function classeInsertRow(prefix: 'conso' | 'puissance', suffix: 'mwh' | 'kva', values?: Record<string, number> | null) {
  const row: Record<string, number> = {}
  if (!values) return row
  for (const [code, v] of Object.entries(values)) {
    row[`${prefix}_${code.toLowerCase()}_${suffix}`] = v
  }
  return row
}

export interface GrdSyncSummary {
  succes: string[]
  echecs: { pdl: string; error: string }[]
}

async function persistElec(admin: Admin, compteurId: string, result: Awaited<ReturnType<typeof fetchElecData>>) {
  const now = new Date().toISOString()
  await admin
    .from('compteurs')
    .update({
      synchro_eneo: true,
      date_derniere_synchro_eneo: now,
      ...(result.consoTotaleMwh != null ? { consommation_annuelle_mwh: result.consoTotaleMwh } : {}),
    })
    .eq('id', compteurId)

  await admin.from('compteurs_electricite').upsert(
    {
      compteur_id: compteurId,
      segment: result.segment ?? null,
      tension: result.tensionLivraison ?? null,
      tarif_distribution: result.fta ?? null,
      ...classeInsertRow('conso', 'mwh', result.consoParClasseMwh),
      ...classeInsertRow('puissance', 'kva', result.puissancesParClasse),
    },
    { onConflict: 'compteur_id' },
  )

  if (result.consoParClasseMwh && result.periodeDebut && result.periodeFin) {
    await admin.from('consommations').delete().eq('compteur_id', compteurId).eq('source', 'Enedis')
    const rows = Object.entries(result.consoParClasseMwh)
      .filter(([, v]) => v > 0)
      .map(([classe, v]) => ({
        compteur_id: compteurId,
        date_debut_periode: result.periodeDebut,
        date_fin_periode: result.periodeFin,
        quantite: v,
        unite: 'MWh',
        poste_tarifaire: classe,
        type_valeur: 'MESUREE',
        source: 'Enedis',
        commentaire: null,
      }))
    if (rows.length) await admin.from('consommations').insert(rows)
  }
}

async function persistGaz(admin: Admin, compteurId: string, result: Awaited<ReturnType<typeof fetchGazData>>) {
  const now = new Date().toISOString()
  await admin
    .from('compteurs')
    .update({
      synchro_eneo: true,
      date_derniere_synchro_eneo: now,
      ...(result.carMwh != null ? { consommation_annuelle_mwh: result.carMwh } : {}),
    })
    .eq('id', compteurId)

  await admin.from('compteurs_gaz').upsert(
    {
      compteur_id: compteurId,
      car_mwh: result.carMwh ?? null,
      profil_consommation: result.profil ?? null,
      tarif_distribution: result.tarif ?? null,
    },
    { onConflict: 'compteur_id' },
  )
}

interface CompteurRow {
  id: string
  numero_point: string
  type_energie: { code: string } | null
  site: { code_postal: string | null } | null
}

/** Synchronise tous les PDL couverts par un mandat qui vient d'être signé. Best-effort par PDL --
 * un échec sur un compteur n'interrompt pas les autres (même esprit que Tools : la synchro
 * échoue silencieusement pour un PDL sans bloquer le reste, mais ici on remonte le détail pour la
 * notification Slack plutôt que de l'avaler). */
export async function runGrdSyncForMandat(admin: Admin, mandatId: string): Promise<GrdSyncSummary> {
  const summary: GrdSyncSummary = { succes: [], echecs: [] }

  const { data: liaisons } = await admin.from('mandats_compteurs').select('compteur_id').eq('mandat_id', mandatId)
  const compteurIds = [...new Set((liaisons ?? []).map((l) => l.compteur_id as string))]
  if (compteurIds.length === 0) return summary

  const { data: compteurs } = await admin
    .from('compteurs')
    .select('id, numero_point, type_energie:types_energies(code), site:sites(code_postal)')
    .in('id', compteurIds)

  for (const c of (compteurs ?? []) as unknown as CompteurRow[]) {
    const energie = (c.type_energie?.code ?? '').toLowerCase()
    try {
      if (energie === 'gaz') {
        const codePostal = c.site?.code_postal
        if (!codePostal) throw new Error('code postal du site manquant')
        const result = await fetchGazData(c.numero_point, codePostal)
        if (!result.success) throw new Error(result.error ?? 'échec GRDF')
        await persistGaz(admin, c.id, result)
      } else {
        const result = await fetchElecData(c.numero_point)
        if (!result.success) throw new Error(result.error ?? 'échec Enedis')
        await persistElec(admin, c.id, result)
      }
      summary.succes.push(c.numero_point)
    } catch (e) {
      summary.echecs.push({ pdl: c.numero_point, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return summary
}
