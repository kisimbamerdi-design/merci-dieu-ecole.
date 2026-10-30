import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const DOMAIN = "merci-dieu.app";
const ROLES = ["promoteur", "direction", "directeur_etudes", "prefet_discipline", "comptable", "professeur"];
const SECTIONS = ["Maternelle", "Primaire", "Éducation de Base", "Secondaire"];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function password(): string {
  const a = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const r = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(r, (n) => a[n % a.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });

  // 1. Qui appelle ? Seul un promoteur actif est autorisé.
  const { data: u } = await caller.auth.getUser();
  if (!u?.user) return json({ error: "Non connecté." }, 401);
  const { data: me } = await admin.from("profiles").select("role,active").eq("id", u.user.id).single();
  if (!me || me.role !== "promoteur" || !me.active) return json({ error: "Réservé au promoteur." }, 403);

  let b: Record<string, string>;
  try { b = await req.json(); } catch { return json({ error: "Requête invalide." }, 400); }

  // 2. Réinitialiser le mot de passe d'un compte existant.
  if (b.action === "reset") {
    if (!/^[0-9a-f-]{36}$/.test(b.user_id ?? "")) return json({ error: "Compte invalide." }, 400);
    const pw = password();
    const { error } = await admin.auth.admin.updateUserById(b.user_id, { password: pw });
    if (error) return json({ error: "Impossible de changer le mot de passe." }, 400);
    await admin.from("audit_log").insert({ user_id: u.user.id, action: "Mot de passe réinitialisé", detail: b.user_id });
    return json({ password: pw });
  }

  // 3. Créer un compte.
  const username = String(b.username ?? "").trim().toLowerCase().replace(/\s+/g, ".");
  const full_name = String(b.full_name ?? "").trim().toLocaleUpperCase("fr");
  const role = String(b.role ?? "");
  const section = b.section ? String(b.section) : null;
  const phone = b.phone ? String(b.phone).replace(/[^\d+]/g, "").slice(0, 16) : null;
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) return json({ error: "Identifiant invalide : 3 à 30 lettres minuscules, chiffres, point ou tiret." }, 400);
  if (full_name.length < 3 || full_name.length > 80) return json({ error: "Nom complet obligatoire." }, 400);
  if (!ROLES.includes(role)) return json({ error: "Rôle invalide." }, 400);
  if (section && !SECTIONS.includes(section)) return json({ error: "Section invalide." }, 400);

  const pw = password();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: `${username}@${DOMAIN}`, password: pw, email_confirm: true,
  });
  if (error || !created?.user) {
    const dup = /already|registered|exists/i.test(error?.message ?? "");
    return json({ error: dup ? "Cet identifiant existe déjà." : "Création impossible." }, dup ? 409 : 400);
  }
  const { error: pe } = await admin.from("profiles").upsert({
    id: created.user.id, full_name, role, section, phone, active: true,
  });
  if (pe) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: "Profil non créé, rien n'a été enregistré." }, 500);
  }
  await admin.from("audit_log").insert({ user_id: u.user.id, action: "Compte créé", detail: `${full_name} (${role})` });
  return json({ id: created.user.id, username, email: `${username}@${DOMAIN}`, password: pw });
});
