import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac, webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const uuid='550e8400-e29b-41d4-a716-446655440000';
const endpoint='https://example.supabase.co/functions/v1/legacy-registration-bridge';
const secret='c'.repeat(48);

function build(){
  const source=read('supabase/functions/legacy-registration-bridge/index.ts').replace(/^import \{ createClient \} from .*;\s*/,'');
  let handler,insertCount=0,stored=null,duplicate=false;
  const ctx={
    crypto:webcrypto,TextEncoder,URL,Request,Response,Date,console,
    Deno:{serve:fn=>{handler=fn},env:{get:key=>({
      MDSS_LEGACY_SYNC_SECRET:secret,
      SUPABASE_URL:'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY:'placeholder-only-test'
    })[key]}},
    createClient:()=>({from:table=>{assert.equal(table,'online_registrations');return {
      insert:row=>{insertCount++;stored=row;return {
        select:()=>({single:async()=>duplicate?
          {error:{code:'23505'},data:null}:
          {error:null,data:{id:'test-uuid'}}})
      }}
    }}})
  };
  runInNewContext(source,ctx,{timeout:3000,filename:'legacy-registration-bridge'});
  assert.equal(typeof handler,'function');
  const sign=(ts,body)=>createHmac('sha256',secret).update(ts+'.'+body).digest('hex');
  const send=async(event,{timestamp=Math.floor(Date.now()/1000),signature,origin,method='POST'}={})=>{
    const body=typeof event==='string'?event:JSON.stringify(event);
    return handler(new Request(endpoint,{method,headers:{
      'content-type':'application/json',
      'x-mdss-timestamp':String(timestamp),
      'x-mdss-signature':signature??sign(String(timestamp),body),
      ...(origin?{'Origin':origin}:{})
    },...(method==='POST'?{body}:{})}));
  };
  const registration={event:'registration.created',event_id:uuid,
    registration:{full_name:'TEST ELEVE FICTIF',class_label:'7ÈME · EB',parent_phone:'+243812345678'}};
  return {send,registration,get count(){return insertCount},get stored(){return stored},setDuplicate:()=>{duplicate=true}};
}
test('Enregistrement sécurisé seulement pour une inscription valide',async()=>{
  const env=build();
  const r=await env.send(env.registration);
  assert.equal(r.status,200);
  const body=await r.json();
  assert.equal(body.ok,true);
  assert.equal(env.count,1);
  assert.equal(env.stored.processed,false);
  assert.equal(env.stored.payload.source,'ancien-site-google-sheets');
  assert.equal(env.stored.payload.legacy_event_id,uuid);
  assert.equal(env.stored.payload.full_name,'TEST ELEVE FICTIF');
  assert.equal(env.stored.payload.parent_phone,'+243812345678');
});
test('Signature fausse ou requête périmée sont rejetées sans écriture',async()=>{
  const e=build();
  const invalid=await e.send(e.registration,{signature:'0'.repeat(64)});
  assert.equal(invalid.status,401);
  const expired=await e.send(e.registration,{timestamp:Math.floor(Date.now()/1000)-600});
  assert.equal(expired.status,401);
  const wrong=await e.send({...e.registration,event:'payment.approved'});
  assert.equal(wrong.status,422);
  assert.equal(e.count,0);
});
test('Tentative dupliquée ne crée pas de nouveau dossier',async()=>{
 const e=build();e.setDuplicate();
 const r=await e.send(e.registration);
 assert.equal(r.status,200);
 assert.equal((await r.json()).duplicate,true);
 assert.equal(e.count,1);
});
test('L’API n’accepte ni lecture GET ni absence de JSON',async()=>{
 const e=build();
 const r=await e.send(e.registration,{method:'GET'});
 assert.equal(r.status,405);
 assert.equal(e.count,0);
});
test('Le code Apps Script ne contient aucun jeton privé et persiste une clé idempotente',()=>{
 const gs=read('integrations/ancien-site/AppsScript_PONT_A_INSTALLER.gs');
 assert.match(gs,/PropertiesService\.getScriptProperties\(\)/);
 assert.match(gs,/getRange\(numeroLigne,colonne\)/);
 assert.match(gs,/Utilities\.computeHmacSha256Signature/);
 assert.doesNotMatch(gs,/\d{9,12}:AA[A-Za-z0-9_-]{25,}/);
 assert.doesNotMatch(gs,/getRange\(numeroLigne,1,1,61\)/);
 assert.match(gs,/mdssSynchroniserInscriptionApresEnregistrement\(nouvelleLigneNum\)/);
});
test('L’index unique préparé garantit l’idempotence sans changer les données',()=>{
 const sql=read('integrations/ancien-site/proposition_index_dedoublonnage.sql');
 assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS/);
 assert.match(sql,/payload ->> 'legacy_event_id'/);
 assert.match(sql,/NE PAS exécuter/);
});
