# Notas de handoff (27/10/2026)

Para quem pegar o projeto depois (outro Claude ou pessoa). Resume o que foi
feito numa sessão paralela e o que ainda está solto. Nada aqui foi para a
`master` ainda: tudo está em branches.

## 1. Migrations já APLICADAS no banco, mas fora da `master`

Foram coladas à mão no SQL Editor do Supabase. Os arquivos existem só nas
branches abaixo. Quem for montar o banco do zero ou rodar `supabase db push`
precisa trazer esses arquivos para a `master`, senão a regra antiga volta.

| Branch | Arquivo | O que faz |
| --- | --- | --- |
| `claude/corrige-nome-franciele` | `supabase/migrations/0042_corrige_nome_franciele.sql` | Troca "Francielle" por "Franciele" em `profiles.full_name` e `responsaveis.nome` |
| `claude/distribuicao-so-do-proprio-cliente` | `supabase/migrations/0043_distribuicao_so_do_proprio_cliente.sql` | Recria a policy `distribuicao_equipe_all`: só o admin máximo (`current_user_super()`) vê tudo; os demais veem só demandas de clientes que `pode_ver_cliente`. Demanda sem cliente fica só com o admin máximo |

Atenção à numeração: se outras migrations ≥ 0042 já foram criadas por outro
lado, renomeie estes dois arquivos para o próximo número livre antes do merge.

## 2. Regra de acesso da Distribuição (0043)

- Antes: qualquer `admin` via tudo e todo advogado via demandas sem cliente.
- Agora: só `super_admin` (Maurício) vê tudo. Cada pessoa vê o que é dos
  clientes que cuida (Equipe > Clientes) ou, se a permissão "Ver todos os
  clientes" estiver ligada, de todos.
- Admin que não é o máximo vem com "todos_clientes" ligado por padrão
  (`tem_permissao`); para restringir, desligar em Equipe > permissões.
- Não há mudança de código TypeScript: a regra está toda no banco (RLS).

## 3. O que NÃO está no repositório

- A tela "Saúde do escritório" (nota 0–100, atividades criadas/concluídas/
  abertas/atrasadas, resposta no Zap, satisfação, distribuição) em
  `/admin/painel` existe em produção (Vercel), mas **não está na `master`
  nem em nenhuma branch remota**. Provavelmente foi trabalho de outro Claude
  sem push. Subir isso numa branch antes de qualquer trabalho novo em
  `painel.ts`, no menu (`admin-shell.tsx`) ou em indicadores.

## 4. Ideia combinada, ainda NÃO iniciada

Página `/admin/indicadores` para todos: cada pessoa vê só os próprios números
(atividades distribuídas a ela e entregues, andamentos e publicações tratados,
pedidos distribuídos, rotina) no período que escolher, com visão mensal.
O admin máximo poderia escolher qualquer pessoa. Resposta no WhatsApp por
pessoa ficou em aberto: o banco não registra quem da equipe respondeu.
Reaproveitar os cálculos da Saúde do escritório quando estiverem no repo.

## 5. Login e recuperação de senha

Relato: o e-mail de redefinição chega, mas o link cai na tela de login.
Causas prováveis (não corrigidas no código): `src/app/auth/confirm/route.ts`
redireciona para `/login` sem mensagem quando `verifyOtp` falha. Hipóteses:
token de uso único consumido por antivírus/leitor de e-mail; template de
e-mail do painel do Supabase diferente de `supabase/templates/recovery.html`;
link expirado ou `NEXT_PUBLIC_SITE_URL`/Site URL divergentes.
Correção sugerida: página intermediária com botão "Continuar" antes de
consumir o token e mensagem clara em caso de falha.

## 6. Convenções para não conflitar

- Cada Claude trabalha em branch própria (`claude/...`); `master` só recebe
  código por PR aprovado pelo dono.
- Combinar quem mexe em `painel.ts`, `admin-shell.tsx` e em migrations.
- Rodar `npm install` e ler `node_modules/next/dist/docs/` antes de mexer em
  código Next.js (ver `AGENTS.md`).
