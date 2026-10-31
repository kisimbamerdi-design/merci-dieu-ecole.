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
