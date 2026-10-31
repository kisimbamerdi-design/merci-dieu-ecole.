-- COLLÈGE MERCI-DIEU · PROPOSITION DE DURCISSEMENT
-- NON EXÉCUTÉE ET NON APPLICABLE AUTOMATIQUEMENT.
-- Préparer une copie PostgreSQL LOCALE (aucune branche Supabase payante).
-- Conserver provisoirement l'INSERT anonyme pour les inscriptions existantes.
-- Tant qu'il existe, ajouter CAPTCHA, validation serveur et limitation de fréquence
-- demeure INDISPENSABLE. Ne jamais appliquer sur production sans tests RLS par rôle.
-- Ne pas ajouter ce fichier dans le build Netlify (publish = dist).
BEGIN;

-- ARRÊT SÛR en cas de changements concurrents : revoir les nouveaux objets
-- avant de révoquer leurs droits.
DO $guard$
DECLARE
  nb_tables int;
  inconnues text;
BEGIN
  SELECT count(*) INTO nb_tables FROM pg_tables WHERE schemaname='public';
  IF nb_tables <> 21 THEN
    RAISE EXCEPTION 'Inventaire SQL changé (% tables au lieu de 21) : réviser la proposition', nb_tables;
  END IF;
  SELECT string_agg(p.proname,', ' ORDER BY p.proname) INTO inconnues
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname NOT IN (
      'advance_guard','handle_new_user','mark_message_read',
      'my_class_ids','my_role','my_section','my_zone','payment_guard',
      'print_receipt','staff_messages_fill','staff_upper','students_upper','verify_qr'
    );
  IF inconnues IS NOT NULL THEN
    RAISE EXCEPTION 'Fonctions nouvelles non vérifiées : %', inconnues;
  END IF;
  IF NOT EXISTS(
     SELECT 1 FROM pg_policies WHERE schemaname='public'
       AND tablename='classes' AND policyname='classes_read_public'
       AND 'anon'=ANY(roles)
  ) THEN
    RAISE EXCEPTION 'Politique classes_read_public absente : arrêter';
  END IF;
  IF NOT EXISTS(
     SELECT 1 FROM pg_policies WHERE schemaname='public'
       AND tablename='online_registrations' AND policyname='reg_insert_public'
       AND 'anon'=ANY(roles)
  ) THEN
    RAISE EXCEPTION 'Politique reg_insert_public absente : arrêter';
  END IF;
END $guard$;

-- Les anciennes politiques "TO public" s'appliquent aussi aux anonymes.
-- Restreindre au personnel avant de retirer les privilèges des helpers RLS.
-- Les 2 politiques publiques explicitement ciblées restent inchangées.
DO $policies$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname='public' AND array_length(roles,1)=1 AND roles[1]='public'
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated',p.policyname,p.tablename);
  END LOOP;
END $policies$;

-- Privilèges des visiteurs : classes lisibles et envoi de demande d'inscription
-- UNIQUEMENT. L'accès en écriture aux inscriptions reste temporaire.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON public.classes TO anon;
GRANT INSERT ON public.online_registrations TO anon;

-- Retirer les fonctions du catalogue API en "PUBLIC" : contrôles fins ensuite.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_section() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_class_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_zone() TO authenticated;
GRANT EXECUTE ON FUNCTION public.print_receipt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_message_read(uuid) TO authenticated;

-- Vérification de QR public : seule fonction RPC anonyme conservée.
GRANT EXECUTE ON FUNCTION public.verify_qr(text) TO anon, authenticated;

-- Journal immuable pour les comptes du personnel.
REVOKE ALL ON TABLE public.audit_log FROM authenticated;
GRANT SELECT, INSERT ON public.audit_log TO authenticated;

-- Les futurs objets créés par postgres ne seront pas automatiquement
-- ouverts en lecture/écriture aux visiteurs anonymes.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

COMMIT;
