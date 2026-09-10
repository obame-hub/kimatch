/* LE CPU SE RECONSTITUE-T-IL ? Une instance qui vient de redémarrer repart avec peu de crédits et
   en regagne au fil des minutes. Trois mesures espacées disent si la courbe monte — auquel cas il
   suffit d'attendre — ou si elle plafonne, auquel cas Small ne suffit pas. */
const { Client } = require('pg'); const fs = require('fs')
const env=(c)=>{const l=fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith(c+'='));return l?l.slice(c.length+1).trim().replace(/^["'<]|[>"']$/g,''):null}
const dodo=(ms)=>new Promise(r=>setTimeout(r,ms))
;(async()=>{
  for (let i=1;i<=6;i++){
    const cl=new Client({connectionString:env('SUPABASE_DB_URL'),ssl:{rejectUnauthorized:false},statement_timeout:120000})
    await cl.connect()
    const t0=Date.now(); await cl.query('select count(*) from generate_series(1,3000000)'); const ms=Date.now()-t0
    const {rows:[c]}=await cl.query("select count(*)::int n from pg_stat_activity where state='active'")
    await cl.end()
    console.log(`${new Date().toLocaleTimeString('fr-FR')}  sonde=${String(ms).padStart(5)} ms   actives=${c.n}`)
    if (i<6) await dodo(180000)
  }
  console.log('FIN')
})().catch(e=>{console.error('ÉCHEC :',e.message);process.exit(1)})
