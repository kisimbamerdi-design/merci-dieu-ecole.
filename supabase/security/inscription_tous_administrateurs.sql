drop policy if exists students_write on students;
create policy students_update on students for update
  using (my_role() in ('promoteur','comptable')) with check (my_role() in ('promoteur','comptable'));
create policy students_delete on students for delete
  using (my_role() in ('promoteur','comptable'));
create policy students_insert on students for insert
  with check (
    my_role() in ('promoteur','direction','comptable')
    or (my_role() in ('directeur_etudes','prefet_discipline')
      and (my_section() is null or exists(select 1 from classes c where c.id = students.class_id and c.section = my_section()))));
