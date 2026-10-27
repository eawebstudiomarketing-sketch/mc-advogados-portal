-- 0043 (out/2026): Distribuição só mostra a cada pessoa a demanda dos clientes
-- que ela cuida. Quem vê tudo é o admin máximo (profiles.super_admin).
--
-- Antes: QUALQUER admin via tudo, e o advogado via também as demandas sem
-- cliente definido. Agora o cliente da demanda manda: sem cliente (ainda não
-- identificado), só o admin máximo enxerga.
--
-- A regra de "cuida deste cliente" continua a de sempre (pode_ver_cliente:
-- clientes marcados em Equipe > Clientes, ou a permissão "Ver todos os
-- clientes" ligada). Admin que não for o máximo precisa ter essa permissão
-- desligada em Equipe para ficar restrito aos clientes dele.

drop policy if exists "distribuicao_equipe_all" on public.distribuicao;
create policy "distribuicao_equipe_all" on public.distribuicao for all
  using (
    public.current_user_super()
    or (
      public.current_user_role() in ('admin', 'advogado')
      and public.tem_permissao('distribuicao')
      and client_id is not null
      and public.pode_ver_cliente(client_id)
    )
  )
  with check (
    public.current_user_super()
    or (
      public.current_user_role() in ('admin', 'advogado')
      and public.tem_permissao('distribuicao')
      and client_id is not null
      and public.pode_ver_cliente(client_id)
    )
  );
