import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {Script} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const htmlNames=['index.html','connexion.html','app.html','verifier.html','confidentialite.html','reglement.html'];
const allPublic=[...htmlNames,'config.js','sw.js','manifest.webmanifest','version.json','logo.png'];

test('Tous les fichiers autorisés de la publication sont présents',()=>{
 for(const f of allPublic) assert.ok(existsSync(new URL('../'+f,import.meta.url)),f);
 const build=read('scripts/build-public.sh'),check=read('scripts/test-public.sh');
 for(const f of allPublic) {assert.ok(build.includes(f),f+' absent de build');assert.ok(check.includes(f),f+' absent du contrôle');}
 assert.doesNotMatch(build,/schema\.sql|AGENTS\.md|supabase\/migrations/);
});

test('Toutes les pages JavaScript ont une syntaxe valide',()=>{
 for(const f of ['app.html','connexion.html','verifier.html']){
  const contents=read(f);
  const blocks=[...contents.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(x=>x.trim().length);
  assert.ok(blocks.length,f+' doit inclure un script');
  for(const [i,block] of blocks.entries()) assert.doesNotThrow(()=>new Script(block,{filename:f+' #'+i}),f+' script '+i);
 }
 new Script(read('config.js'),{filename:'config.js'});
 new Script(read('sw.js'),{filename:'sw.js'});
});

test('Les 21 tables exploitées ont un écran ou un usage et les modules existent',()=>{
 const app=read('app.html');
 const raw=app.match(/const TABLES=\[([\s\S]*?)\];/);
 assert.ok(raw,'TABLES introuvable');
 const tables=[...raw[1].matchAll(/'([a-z_]+)'/g)].map(x=>x[1]);
 assert.equal(tables.length,21);
 for(const t of ['students','grades','payments','agenda_events','school_documents','circulars','treasury_entries'])assert.ok(tables.includes(t),t);
 for(const module of ['dash','eleves','rapports','notes','presences','paiements','tresorerie','circulaires','documents','archives','bibliotheque','agenda','caisse','reglement','params']){
  assert.match(app,new RegExp('P\\.'+module+'\\s*='),module);
 }
 assert.doesNotMatch(app,/\['(?:📁|🗓)','(?:Documents|Agenda scolaire)',null\]/);
});
test('Les erreurs Supabase ne se changent plus en tableaux à zéro',()=>{
 const app=read('app.html');
 assert.match(app,/if\(error\)throw new Error\('Chargement '/);
 assert.doesNotMatch(app,/if\(error\|\|!data\)return out/);
 assert.match(app,/Données momentanément indisponibles/);
});
test('Rapports pédagogiques sans montant financier pour les autres rôles',()=>{
 const app=read('app.html');
 assert.match(app,/finance=can\('promoteur','comptable'\)/);
 assert.match(app,/const sd=can\('promoteur','comptable'\)\?soldes\(\):\[\]/);
 assert.match(app,/Moyenne notes \(%\)/);
});
test('CSV échappe les valeurs pouvant être des formules',()=>{
 const app=read('app.html');
 assert.match(app,/if\(\/\^\\s\*\[=\+@-\]\//);
});
test('Le service worker ne met jamais en cache les requêtes sensibles',()=>{
 const sw=read('sw.js');
 assert.match(sw,/if\(url\.origin!==self\.location\.origin\|\|url\.search\)return/);
 assert.match(sw,/if\(!ASSETS\.includes\(name\)\)return/);
 assert.doesNotMatch(sw,/cache\.put\(request,c\).*app\.html/);
 for(const path of ['app.html','connexion.html','verifier.html','config.js'])assert.doesNotMatch(sw,new RegExp("'"+path+"'"));
 assert.match(sw,/keys\.filter\(key=>key\.startsWith\('mdss-'\)/);
});
test('Versions synchronisées entre application et version.json',()=>{
 const app=read('app.html');
 const version=JSON.parse(read('version.json'));
 assert.match(version.version,/^\d{4}\.\d{2}\.\d{2}\.\d+$/);
 assert.ok(app.includes("const APP_VERSION='"+version.version+"';"));
});
test('Liens publics orientés vers les pages livrées et ancien formulaire identifié',()=>{
 const home=read('index.html');
 for(const page of ['connexion.html','verifier.html','confidentialite.html','reglement.html'])assert.ok(home.includes('href="'+page+'"'),page);
 assert.ok(home.includes('https://college-merci-dieu-kasumbalesa.netlify.app/'));
 assert.ok(read('reglement.html').includes('En attente du document officiel'));
});


test('Le portail expose uniquement des statistiques publiques vérifiées',()=>{
 const page=read('index.html'),source=read('supabase/functions/school-public-stats/index.ts');
 assert.match(page,/L'école en chiffres/);
 for(const s of ['stat-eleves','stat-classes','stat-personnel']) assert.ok(page.includes('id="'+s+'"'),s);
 assert.match(page,/Statistiques momentanément indisponibles/);
 assert.match(source,/admin\.from\("students"\)\.select\("id",\{head:true,count:"exact"\}\)\.eq\("status","valide"\)/);
 assert.match(source,/admin\.from\("classes"\)/);
 assert.match(source,/admin\.from\("staff"\)/);
 assert.doesNotMatch(page,/SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
 assert.doesNotMatch(source,/select\("\*"\)/);
});
test('L’API statistiques refuse les méthodes et origines interdites',async()=>{
 const file=read('supabase/functions/school-public-stats/index.ts');
 const program=file.replace(/^import \{ createClient \} from .+;\n/, 'const createClient = globalThis.__createClient;\n');
 let handler;
 let invoked=0;
 const env={SUPABASE_URL:'https://exemple.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fake-only-in-test'};
 const globals={
   __createClient:()=>({from:table=>{
     invoked++;
     return {select:()=>table==='students'?
       {eq:async()=>({count:3,error:null})}:
       Promise.resolve({count:2,error:null})};
   }}),
   Deno:{serve:fn=>{handler=fn},env:{get:name=>env[name]}},
   Request,Response,URL,Date,console
 };
 const {runInNewContext}=await import('node:vm');
 runInNewContext(program,globals,{timeout:3000});
 const endpoint='https://exemple.supabase.co/functions/v1/school-public-stats';
 const valid='https://merci-dieu-smart-school.netlify.app';
 const evil=await handler(new Request(endpoint,{headers:{Origin:'https://autre-site.example'}}));
 assert.equal(evil.status,403);
 const post=await handler(new Request(endpoint,{method:'POST',headers:{Origin:valid}}));
 assert.equal(post.status,405);
 const params=await handler(new Request(endpoint+'?table=profiles',{headers:{Origin:valid}}));
 assert.equal(params.status,400);
 assert.equal(invoked,0,'Aucune lecture de base pour une demande refusée');
 const good=await handler(new Request(endpoint,{headers:{Origin:valid}}));
 assert.equal(good.status,200);
 assert.equal(good.headers.get('access-control-allow-origin'),valid);
 const body=await good.json();
 assert.deepEqual(JSON.parse(JSON.stringify({
  eleves_inscrits:body.eleves_inscrits,classes_enregistrees:body.classes_enregistrees,personnel_enregistre:body.personnel_enregistre
 })),{eleves_inscrits:3,classes_enregistrees:2,personnel_enregistre:2});
 assert.ok(!('eleves' in body)&&!('emails' in body)&&!('payments' in body));
 const cached=await handler(new Request(endpoint,{headers:{Origin:valid}}));
 assert.equal(cached.status,200);
 assert.equal(invoked,3,'Réutilisation du cache pendant 5 minutes');
});
