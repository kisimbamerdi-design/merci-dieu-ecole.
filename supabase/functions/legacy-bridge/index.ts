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

  if (b.type === "modification") {
    // Modification faite dans Google Sheets : on retrouve l'élève par son nom exact (ancien nom) ; ambigu ou introuvable = refusé.
    const ancien = up(b.ancienNom, 120);
    if (ancien.length < 3) return json({ error: "Nom manquant." }, 400);
    const { data: found, error: e1 } = await db.from("students").select("id").eq("full_name", ancien).limit(2);
    if (e1) return json({ error: "Recherche impossible." }, 500);
    if (!found || found.length !== 1) return json({ error: found && found.length > 1 ? "Plusieurs élèves portent ce nom." : "Élève introuvable." }, 409);
    const patch: Record<string, unknown> = {};
    const put = (k: string, v: unknown) => { if (v !== undefined && v !== null) patch[k] = v; };
    if (b.nom !== undefined) { const n = up(b.nom, 120); if (n.length >= 3) put("full_name", n); }
    if (b.sexe !== undefined) { const x = clean(b.sexe, 12); put("sex", /^M/i.test(x) ? "Masculin" : /^F/i.test(x) ? "Féminin" : null); }
    if (b.dateNaissance !== undefined) put("birth_date", isoDate(b.dateNaissance) || null);
    if (b.lieuNaissance !== undefined) put("birth_place", up(b.lieuNaissance));
    if (b.province !== undefined) put("province", up(b.province));
    if (b.secteur !== undefined) put("sector", up(b.secteur));
    if (b.adresse !== undefined) put("address", up(b.adresse));
    if (b.pere !== undefined) put("father_name", up(b.pere));
    if (b.mere !== undefined) put("mother_name", up(b.mere));
    if (b.telParent !== undefined) put("parent_phone", clean(b.telParent, 20));
    if (b.ecole !== undefined) put("prev_school", up(b.ecole));
    if (b.numPermanent !== undefined) put("perm_number", clean(b.numPermanent, 40));
    if (!Object.keys(patch).length) return json({ ok: true, changed: 0 });
    const { error: e2 } = await db.from("students").update(patch).eq("id", found[0].id);
    if (e2) return json({ error: "Modification impossible." }, 500);
    await db.from("audit_log").insert({ action: "Modification depuis Google Sheets", ref: ancien, detail: Object.keys(patch).join(", ") });
    return json({ ok: true, changed: Object.keys(patch).length });
  }

  return json({ error: "Type inconnu." }, 400);
});
