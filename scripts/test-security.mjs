// Tests hors réseau, sans clé privée et sans base de données.
// Exécuter : node --test scripts/test-security.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const verifier = read('verifier.html');

test('La publication Netlify doit être restreinte', () => {
  const config = read('netlify.toml');
  const build = read('scripts/build-public.sh');
  assert.match(config, /publish\s*=\s*"dist"/);
  assert.match(config, /scripts\/test-public\.sh/);
  assert.match(build, /for fichier in index\.html/);
  assert.doesNotMatch(build, /(?:cp|rsync)[^\n]*schema\.sql/);
  assert.doesNotMatch(build, /(?:cp|rsync)[^\n]*AGENTS\.md/);
  assert.doesNotMatch(build, /(?:cp|rsync)[^\n]*supabase\//);
  assert.match(config, /Content-Security-Policy/);
});

test('La configuration publique ne contient pas de clé privilégiée', () => {
  const config = read('config.js');
  assert.doesNotMatch(config, /service_role|sb_secret_/i);
  assert.match(config, /SUPABASE_ANON/);
});

test('Les scripts SQL sont explicitement séparés de la production', () => {
  const plan = read('supabase/security/proposition_durcissement.sql');
  const tests = read('supabase/security/controle_permissions.sql');
  assert.match(plan, /NON EXÉCUTÉE/);
  assert.match(plan, /GRANT SELECT ON public\.classes TO anon/i);
  assert.match(plan, /GRANT INSERT ON public\.online_registrations TO anon/i);
  assert.match(plan, /ALTER POLICY/i);
  assert.match(plan, /REVOKE EXECUTE ON ALL FUNCTIONS/i);
  assert.match(tests, /has_table_privilege/);
  assert.match(tests, /has_function_privilege/);
});

test('La page QR ne réactive pas le raccourci de démonstration', () => {
  assert.doesNotMatch(verifier, /atob\(|JSON\.parse\(decodeURIComponent/);
  assert.match(verifier, /if\(q\.has\('d'\)\)/);
  assert.match(verifier, /\[0-9a-f\]\{32\}/);
});

async function simulate(search, response) {
  const nodes = new Map();
  let rpcCalls = 0;
  const document = {
    getElementById: id => {
      if (!nodes.has(id)) nodes.set(id, {innerHTML:'', textContent:''});
      return nodes.get(id);
    }
  };
  const inline = [...verifier.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(match=>match[1]).filter(Boolean).at(-1);
  assert.ok(inline, 'script de vérification introuvable');
  const context = {
    window:{MDSS:{SUPABASE_URL:'https://exemple.supabase.co',SUPABASE_ANON:'anon-publique'}},
    location:{search}, document, URLSearchParams, console, Intl,
    supabase:{createClient:()=>({rpc:async()=>{
      rpcCalls++;
      return {data:response,error:null};
    }})}
  };
  await runInNewContext(inline,context,{timeout:3000});
  return {output:nodes.get('r')?.innerHTML ?? '', rpcCalls};
}

test('Un lien de démonstration ne peut plus valider un faux paiement', async()=>{
  const faux=Buffer.from(JSON.stringify({
    type:'paiement',valide:true,eleve:'ELEVE FICTIF',montant:999999
  })).toString('base64');
  const result=await simulate('?d='+encodeURIComponent(faux),null);
  assert.equal(result.rpcCalls,0);
  assert.match(result.output,/Code non reconnu/);
  assert.doesNotMatch(result.output,/Paiement confirmé/);
});

test('Un jeton mal formé ne déclenche pas de requête SQL',async()=>{
  const result=await simulate('?t=FAUX_TOKEN',null);
  assert.equal(result.rpcCalls,0);
  assert.match(result.output,/Code non reconnu/);
});

test('Un vrai jeton appelle le serveur et masque les données personnelles',async()=>{
  const result=await simulate('?t='+'a'.repeat(32),{
    type:'paiement',valide:true,recu:'MD-REC-000123',
    date:'2026-10-31',eleve:'ELEVE SECRET',montant:999999,motif:'Frais secret'
  });
  assert.equal(result.rpcCalls,1);
  assert.match(result.output,/Paiement confirmé/);
  assert.match(result.output,/MD-REC-000123/);
  assert.doesNotMatch(result.output,/ELEVE SECRET|999999|Frais secret/);
});

test('Le résultat rejeté par Supabase ne montre jamais un QR vert',async()=>{
  const result=await simulate('?t='+'b'.repeat(32),{type:'paiement',valide:false});
  assert.equal(result.rpcCalls,1);
  assert.match(result.output,/Paiement non confirmé/);
  assert.doesNotMatch(result.output,/<div class="ok">/);
});

test('Un changement de mot de passe demande au moins 12 caractères',()=>{
  const app=read('app.html');
  const version=JSON.parse(read('version.json')).version;
  assert.match(app,/Nouveau mot de passe \(12 caractères minimum\)/);
  assert.match(app,/if\(a\.length<12\)return toast\('12 caractères minimum\.',1\)/);
  assert.match(app,new RegExp("const APP_VERSION='"+version.replaceAll('.','\\.')+"'"));
});
