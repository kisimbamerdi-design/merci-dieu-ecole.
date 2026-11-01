// Pont entre l'ancien site (Google Apps Script) et l'application.
// L'ancien site envoie chaque inscription ou paiement ici ; rien n'est enregistré comme élève ni comme paiement :
// les demandes arrivent « à traiter » et le promoteur ou le comptable les valide dans l'application.
// Authentification : en-tête x-bridge-secret (secret BRIDGE_SECRET dans les secrets Supabase, jamais dans le dépôt).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const clean = (v: unknown, max = 200) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const up = (v: unknown, max = 200) => clean(v, max).toLocaleUpperCase("fr");

function sameSecret(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// 25/10/2012 ou 2012-10-25 -> 2012-10-25 ; sinon vide (le secrétariat saisira la date)
function isoDate(v: unknown): string {
  const s = clean(v, 20);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);
  const expected = Deno.env.get("BRIDGE_SECRET") ?? "";
  if (!sameSecret(req.headers.get("x-bridge-secret") ?? "", expected)) return json({ error: "Non autorisé." }, 401);

  const raw = await req.text();
  if (raw.length > 8000) return json({ error: "Requête trop grande." }, 413);
  let b: Record<string, unknown>;
  try { b = JSON.parse(raw); } catch { return json({ error: "Requête invalide." }, 400); }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (b.type === "inscription") {
    const full_name = up(b.nom, 120);
    if (full_name.length < 3) return json({ error: "Nom manquant." }, 400);
    const classe = up(b.classe, 60), option = up(b.option, 80);
    const payload = {
      full_name,
      sex: /^M/i.test(clean(b.sexe, 12)) ? "Masculin" : /^F/i.test(clean(b.sexe, 12)) ? "Féminin" : "",
      birth_date: isoDate(b.dateNaissance),
      birth_place: up(b.lieuNaissance),
      province: up(b.province),
      sector: up(b.secteur),
      address: up(b.adresse),
      father_name: up(b.pere),
      mother_name: up(b.mere),
      class_label: [classe, option].filter(Boolean).join(" · "),
      parent_phone: clean(b.telParent, 20),
      prev_school: up(b.ecole),
      perm_number: clean(b.numPermanent, 40),
      source: "ancien-site",
      declared_on: clean(b.date, 30),
    };
    const { error } = await db.from("online_registrations").insert({ payload });
    if (error) return json({ error: "Enregistrement impossible." }, 500);
    return json({ ok: true });
  }

  if (b.type === "paiement") {
    const montant = Math.round(Number(b.montant));
    const nom = up(b.nomEleve, 120);
    if (!nom || !(montant > 0) || montant > 100000000) return json({ error: "Paiement invalide." }, 400);
    const payload = { student_name: nom, amount: montant, reason: clean(b.motif, 80), declared_on: clean(b.date, 30), source: "ancien-site" };
    const { error } = await db.from("online_payments").insert({ payload });
    if (error) return json({ error: "Enregistrement impossible." }, 500);
    return json({ ok: true });
  }

  return json({ error: "Type inconnu." }, 400);
});
