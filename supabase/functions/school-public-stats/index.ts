import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// Données strictement agrégées pour la page d'accueil publique.
// Aucun identifiant d'élève, salaire, numéro ou autre donnée personnelle n'est exposé.
const HOME = "https://merci-dieu-smart-school.netlify.app";
const PREVIEW = /^https:\/\/deploy-preview-[0-9]+--merci-dieu-smart-school\.netlify\.app$/;
const allowed = (origin: string | null) => origin === HOME || !!(origin && PREVIEW.test(origin));
const shared = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=60, s-maxage=300",
  "X-Content-Type-Options": "nosniff",
  "Vary": "Origin"
};
const response = (data: Record<string, unknown>, status: number, origin: string | null) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...shared,
      ...(allowed(origin) ? {"Access-Control-Allow-Origin": origin!} : {})
    }
  });
let memo: { timestamp: number; data: Record<string, unknown> } | null = null;

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  if (origin && !allowed(origin)) return response({error: "Origine refusée"},403,origin);
  if (request.method === "OPTIONS")
    return new Response(null, {
      status:204,headers:{
        "Access-Control-Allow-Origin": origin && allowed(origin)?origin:HOME,
        "Access-Control-Allow-Methods":"GET, OPTIONS",
        "Access-Control-Allow-Headers":"content-type",
        "Access-Control-Max-Age":"3600"
      }
    });
  if (request.method !== "GET") return response({error:"Méthode refusée"},405,origin);
  // Ne jamais permettre au client de choisir la table ni un filtre : pas de paramètres.
  if (new URL(request.url).search) return response({error:"Paramètres non autorisés"},400,origin);

  if (memo && Date.now()-memo.timestamp < 300000) return response(memo.data,200,origin);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!url || !secret) return response({error:"Statistiques indisponibles"},503,origin);
    const admin = createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
    const [eleves,classes,personnel] = await Promise.all([
      admin.from("students").select("id",{head:true,count:"exact"}).eq("status","valide"),
      admin.from("classes").select("id",{head:true,count:"exact"}),
      admin.from("staff").select("id",{head:true,count:"exact"})
    ]);
    if (eleves.error || classes.error || personnel.error ||
        eleves.count===null || classes.count===null || personnel.count===null)
      return response({error:"Statistiques indisponibles"},503,origin);
    const data = {
      eleves_inscrits: eleves.count,
      classes_enregistrees: classes.count,
      personnel_enregistre: personnel.count,
      actualise_le: new Date().toISOString(),
      source: "Merci-Dieu Smart School"
    };
    memo={timestamp:Date.now(),data};
    return response(data,200,origin);
  } catch {
    return response({error:"Statistiques indisponibles"},503,origin);
  }
});
