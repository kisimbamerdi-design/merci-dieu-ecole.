import { createClient } from "npm:@supabase/supabase-js@2.45.4";

/**
 * Pont serveur-à-serveur : Google Apps Script -> Supabase.
 * Uniquement inscription.created -> online_registrations (processed=false).
 * Aucun paiement, reçu, salaire ou statut élève n'est confirmé ici.
 * Ne pas déployer avant: secret configuré + index unique sur legacy_event_id.
 */
const UTF8=new TextEncoder();
const json=(body,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
});
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
const safeEq=(expected,got)=>{
  if(typeof got!=="string"||expected.length!==got.length)return false;
  let mismatch=0;
  for(let i=0;i<expected.length;i++)mismatch|=expected.charCodeAt(i)^got.charCodeAt(i);
  return mismatch===0;
};
async function sign(secret,body){
  const key=await crypto.subtle.importKey("raw",UTF8.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return hex(await crypto.subtle.sign("HMAC",key,UTF8.encode(body)));
}
const str=(x,n=150)=>typeof x==="string"?x.trim().slice(0,n):"";
const uuid=x=>typeof x==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
function extract(raw){
  if(!raw||raw.event!=="registration.created"||!uuid(raw.event_id))return null;
  const r=raw.registration;
  if(!r||typeof r!=="object"||Array.isArray(r))return null;
  const full_name=str(r.full_name,160).toUpperCase(),parent_phone=str(r.parent_phone,24);
  if(full_name.length<3||!str(r.class_label,180))return null;
  if(parent_phone&&!/^[+0-9 ()-]{6,24}$/.test(parent_phone))return null;
  const fields=["sex","birth_place","province","sector","address","father_name","mother_name","prev_school","perm_number"];
  const payload={full_name,class_label:str(r.class_label,180),parent_phone,source:"ancien-site-google-sheets",
    legacy_event_id:raw.event_id};
  if(/^\d{4}-\d{2}-\d{2}$/.test(str(r.birth_date)))payload.birth_date=str(r.birth_date);
  for(const key of fields)if(str(r[key]))payload[key]=str(r[key],180);
  return payload;
}
Deno.serve(async request=>{
  if(request.method!=="POST")return json({ok:false,error:"Méthode interdite"},405);
  if(!/application\/json/i.test(request.headers.get("content-type")||""))return json({ok:false,error:"Format interdit"},415);
  const secret=Deno.env.get("MDSS_LEGACY_SYNC_SECRET")||"";
  if(secret.length<32)return json({ok:false,error:"Pont non configuré"},503);
  const timestamp=request.headers.get("x-mdss-timestamp")||"";
  const signature=(request.headers.get("x-mdss-signature")||"").toLowerCase();
  const now=Math.floor(Date.now()/1000);
  if(!/^\d{10}$/.test(timestamp)||Math.abs(now-Number(timestamp))>300)return json({ok:false,error:"Horodatage invalide"},401);
  if(!/^[0-9a-f]{64}$/.test(signature))return json({ok:false,error:"Signature invalide"},401);
  const body=await request.text();
  if(body.length<4||body.length>24000)return json({ok:false,error:"Taille invalide"},413);
  const computed=await sign(secret,timestamp+"."+body);
  if(!safeEq(computed,signature))return json({ok:false,error:"Signature invalide"},401);
  let event;
  try{event=JSON.parse(body)}catch{return json({ok:false,error:"JSON invalide"},400)}
  const payload=extract(event);
  if(!payload)return json({ok:false,error:"Inscription invalide"},422);
  const url=Deno.env.get("SUPABASE_URL");
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!serviceKey)return json({ok:false,error:"Base indisponible"},503);
  try{
    const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await admin.from("online_registrations").insert({payload,processed:false}).select("id").single();
    if(error){
      if(error.code==="23505")return json({ok:true,duplicate:true});
      return json({ok:false,error:"Enregistrement impossible"},503);
    }
    return json({ok:true,id:data?.id||null});
  }catch{return json({ok:false,error:"Service indisponible"},503)}
});
