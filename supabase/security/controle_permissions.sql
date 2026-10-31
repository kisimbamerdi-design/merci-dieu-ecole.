-- Collège Merci-Dieu · test SQL local, jamais lancé sur la production
-- À exécuter APRÈS proposition_durcissement.sql dans PostgreSQL LOCAL.
-- Tests de permissions, à compléter avec de vraies requêtes utilisateur/RLS.
DO $tests$
DECLARE t record; f text;
BEGIN
 FOR t IN SELECT c.relname name, c.oid oid, c.relrowsecurity rls
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relkind='r'
 LOOP
  IF NOT t.rls THEN RAISE EXCEPTION 'RLS absente : %',t.name; END IF;
  IF has_table_privilege('anon',t.oid,'UPDATE') OR has_table_privilege('anon',t.oid,'DELETE')
     OR has_table_privilege('anon',t.oid,'TRUNCATE') THEN
    RAISE EXCEPTION 'Écriture anonyme excessive : %',t.name;
  END IF;
  IF t.name NOT IN ('classes','online_registrations')
     AND (has_table_privilege('anon',t.oid,'SELECT') OR has_table_privilege('anon',t.oid,'INSERT')) THEN
    RAISE EXCEPTION 'Droits anonymes non attendus : %',t.name;
  END IF;
 END LOOP;
 IF NOT has_table_privilege('anon','public.classes','SELECT') THEN
  RAISE EXCEPTION 'Le formulaire public ne peut plus consulter les classes';
 END IF;
 IF NOT has_table_privilege('anon','public.online_registrations','INSERT') THEN
  RAISE EXCEPTION 'Le formulaire existant ne peut plus envoyer une inscription';
 END IF;
 IF has_table_privilege('anon','public.classes','INSERT') OR
    has_table_privilege('anon','public.online_registrations','SELECT') THEN
   RAISE EXCEPTION 'Permissions publiques des classes ou inscriptions trop larges';
 END IF;
 FOR f IN SELECT unnest(ARRAY[
  'public.my_role()','public.my_section()','public.my_class_ids()',
  'public.my_zone()','public.handle_new_user()','public.advance_guard()',
  'public.payment_guard()','public.print_receipt(uuid)',
  'public.mark_message_read(uuid)','public.staff_messages_fill()'
 ]) LOOP
  IF has_function_privilege('anon',f,'EXECUTE') THEN
   RAISE EXCEPTION 'Fonction privilégiée ouverte : %',f;
  END IF;
 END LOOP;
 IF NOT has_function_privilege('anon','public.verify_qr(text)','EXECUTE') THEN
  RAISE EXCEPTION 'La vérification du QR est bloquée';
 END IF;
 FOR f IN SELECT unnest(ARRAY[
  'public.my_role()','public.my_section()','public.my_class_ids()',
  'public.my_zone()','public.print_receipt(uuid)','public.mark_message_read(uuid)'
 ]) LOOP
  IF NOT has_function_privilege('authenticated',f,'EXECUTE') THEN
   RAISE EXCEPTION 'Fonction du personnel bloquée : %', f;
  END IF;
 END LOOP;
 IF has_table_privilege('authenticated','public.audit_log','DELETE') OR
    has_table_privilege('authenticated','public.audit_log','UPDATE') THEN
  RAISE EXCEPTION 'Le journal est modifiable par un compte client';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND
    array_length(roles,1)=1 AND roles[1]='public') THEN
   RAISE EXCEPTION 'Politique trop large TO public encore présente';
 END IF;
 RAISE NOTICE 'Permissions minimales cohérentes. Tester maintenant chaque rôle réel via API.';
END $tests$;
