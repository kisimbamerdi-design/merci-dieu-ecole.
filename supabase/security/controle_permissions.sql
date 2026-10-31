-- Exécuter UNIQUEMENT sur une base de développement après le script de permissions.
-- Vérifie des permissions SQL, PAS la matrice complète des politiques RLS par rôle.
-- Aucune donnée personnelle n'est lue ni modifiée.
do $tests$
declare
  t record;
  fn text;
begin
  for t in
    select c.relname AS table_name, c.oid AS table_oid, c.relrowsecurity AS rls_enabled
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
  loop
    if not t.rls_enabled then
      raise exception 'RLS désactivée : %', t.table_name;
    end if;
    if has_table_privilege('anon',t.table_oid,'INSERT')
       or has_table_privilege('anon',t.table_oid,'UPDATE')
       or has_table_privilege('anon',t.table_oid,'DELETE')
       or has_table_privilege('anon',t.table_oid,'TRUNCATE') then
      raise exception 'Permission anonyme dangereuse sur %',t.table_name;
    end if;
    if t.table_name <> 'classes' and has_table_privilege('anon',t.table_oid,'SELECT') then
      raise exception 'Lecture anonyme non attendue sur %',t.table_name;
    end if;
  end loop;

  if not has_table_privilege('anon','public.classes','SELECT') then
    raise exception 'La liste des classes doit rester publique';
  end if;

  foreach fn in array array[
    'public.handle_new_user()',
    'public.advance_guard()',
    'public.payment_guard()',
    'public.my_role()',
    'public.my_section()',
    'public.my_class_ids()',
    'public.print_receipt(uuid)',
    'public.my_zone()',
    'public.mark_message_read(uuid)',
    'public.staff_messages_fill()'
  ] loop
    if has_function_privilege('anon', fn, 'EXECUTE') then
      raise exception 'Fonction toujours exécutable anonymement : %', fn;
    end if;
  end loop;
  if not has_function_privilege('anon','public.verify_qr(text)','EXECUTE') then
    raise exception 'La vérification publique des QR a été bloquée';
  end if;
  foreach fn in array array[
    'public.my_role()','public.my_section()','public.my_class_ids()',
    'public.my_zone()','public.print_receipt(uuid)','public.mark_message_read(uuid)'
  ] loop
    if not has_function_privilege('authenticated',fn,'EXECUTE') then
      raise exception 'Fonction nécessaire au personnel non autorisée : %',fn;
    end if;
  end loop;
  if has_table_privilege('authenticated','public.audit_log','UPDATE')
    or has_table_privilege('authenticated','public.audit_log','DELETE') then
    raise exception 'Le journal des opérations reste modifiable';
  end if;
  raise notice 'Contrôles de permissions réussis : tester maintenant les parcours par rôle';
end
$tests$;
