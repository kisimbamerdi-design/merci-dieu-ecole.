-- COLLÈGE MERCI-DIEU : durcissement à tester sur une base Supabase de développement.
-- NON APPLIQUÉ EN PRODUCTION. Ne pas fusionner sans les tests de droits par rôle.
-- ATTENTION : couper INSERT anonyme désactive l'ancien mécanisme direct
-- de online_registrations. La fonction d'inscription sécurisée doit être
-- déployée et testée avant toute utilisation de ce script en production.

begin;

-- Défense en profondeur : seul le catalogue public des classes reste
-- consultable anonymement, conformément à la page d'inscription.
revoke all on all tables in schema public from anon;
grant select on table public.classes to anon;

-- Les fonctions de déclenchement ne sont pas des API publiques.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.advance_guard() from public, anon, authenticated;
revoke execute on function public.payment_guard() from public, anon, authenticated;
revoke execute on function public.staff_messages_fill() from public, anon, authenticated;
revoke execute on function public.students_upper() from public, anon, authenticated;
revoke execute on function public.staff_upper() from public, anon, authenticated;

-- Les fonctions d'aide aux politiques RLS restent disponibles
-- pour les sessions du personnel, pas pour une visite anonyme.
revoke execute on function public.my_role() from public, anon, authenticated;
revoke execute on function public.my_section() from public, anon, authenticated;
revoke execute on function public.my_class_ids() from public, anon, authenticated;
revoke execute on function public.my_zone() from public, anon, authenticated;
grant execute on function public.my_role() to authenticated;
grant execute on function public.my_section() to authenticated;
grant execute on function public.my_class_ids() to authenticated;
grant execute on function public.my_zone() to authenticated;

-- Fonctions appelées depuis l'application authentifiée.
revoke execute on function public.print_receipt(uuid) from public, anon, authenticated;
grant execute on function public.print_receipt(uuid) to authenticated;
revoke execute on function public.mark_message_read(uuid) from public, anon, authenticated;
grant execute on function public.mark_message_read(uuid) to authenticated;

-- Exception publique explicite : validation de QR (contenu à minimiser
-- dans une évolution séparée sans casser le contrat avec verifier.html).
revoke execute on function public.verify_qr(text) from public, anon, authenticated;
grant execute on function public.verify_qr(text) to anon, authenticated;

-- Le journal ne peut jamais être modifié ni effacé par les utilisateurs.
-- Les droits de lecture / ajout restent déterminés par les politiques RLS.
revoke all on table public.audit_log from authenticated;
grant select, insert on table public.audit_log to authenticated;

-- Éviter les privilèges SQL administratifs inutiles pour les connexions.
revoke truncate, references, trigger, maintain on all tables in schema public from authenticated;

-- Éviter de redonner les droits anonymes automatiquement
-- sur les nouvelles tables créées par postgres.
alter default privileges for role postgres in schema public
  revoke all on tables from anon;

commit;
