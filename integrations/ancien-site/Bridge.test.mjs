import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const s=readFileSync(new URL('./Bridge.gs',import.meta.url),'utf8');
function prepare({url='https://lotzbcvzvgtsvszbigek.supabase.co/functions/v1/legacy-bridge',secret='TEST_SECRET_NOT_REAL',status=200,body='{"ok":true}'}={}){
  const log=[],calls=[];
  const ctx={
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='BRIDGE_URL'?url:k==='BRIDGE_SECRET'?secret:''})},
    UrlFetchApp:{fetch:(url,opts)=>{calls.push({url,opts});return{getResponseCode:()=>status,getContentText:()=>body}}},
    Logger:{log:msg=>log.push(msg)},JSON,RegExp,String,
  };
  runInNewContext(s,ctx);
  return {...ctx,log,calls}
}
test('Un envoi autorisé attend la confirmation JSON du serveur',()=>{
 const t=prepare();assert.equal(t.envoyerVersApplication({type:'inscription',nom:'TEST FICTIF'}),true);
 assert.equal(t.calls.length,1);assert.equal(t.calls[0].opts.headers['x-bridge-secret'],'TEST_SECRET_NOT_REAL');
 assert.equal(JSON.parse(t.calls[0].opts.payload).type,'inscription');
});
test('Une réponse HTTP en erreur ne valide jamais un envoi',()=>{
 const t=prepare({status:401,body:'{"error":"Non autorisé"}'});
 assert.equal(t.envoyerVersApplication({type:'paiement',montant:100}),false);
 assert.equal(t.calls.length,1);
 assert.ok(t.log.every(s=>!s.includes('Non autorisé')));
});
test('On bloque tout type inconnu et les modifications directes',()=>{
 const t=prepare();
 assert.equal(t.envoyerVersApplication({type:'modification',ancienNom:'FAUX'}),false);
 assert.equal(t.envoyerVersApplication({type:'autreRetrait'}),false);
 assert.equal(t.calls.length,0);
});
test('Une configuration absente empêche la connexion',()=>{
 const t=prepare({secret:''});
 assert.equal(t.envoyerVersApplication({type:'inscription'}),false);
 assert.equal(t.calls.length,0);
});
test('Ne pas transmettre de secret dans les logs ou par URL',()=>{
 const t=prepare({body:'{"ok":false}'});
 assert.equal(t.envoyerVersApplication({type:'inscription',nom:'TEST FICTIF'}),false);
 assert.ok(t.log.every(x=>!x.includes('TEST_SECRET_NOT_REAL')&&!x.includes('TEST FICTIF')));
 assert.ok(t.calls.every(x=>!x.url.includes('TEST_SECRET_NOT_REAL')));
});
