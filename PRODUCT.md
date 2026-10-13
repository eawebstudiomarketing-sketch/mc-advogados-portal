# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- Equipe interna do escritório MC Advogados (Maurício Cardoso Advocacia, Teixeira de Freitas-BA): admin (Dr. Maurício e quem administra o portal) e advogados. Usam o painel no dia a dia, em computador, para triagem de clientes, onboarding, atividades, documentos, ATAs, demandas e relatórios.
- Clientes do escritório (empresas e pessoas físicas assessoradas), que entram no portal do cliente para acompanhar atividades, horas e documentos. Prioridade de design: primeiro a equipe, depois o cliente (pedido do usuário, 07/10/2026).

## Product Purpose
Portal B2B de gestão da assessoria jurídica empresarial: cada cliente tem sua ficha (triagem, atividades, documentos e contratos, ATAs, onboarding, demandas geradas por IA) e o escritório gera relatórios mensais para o cliente. Sucesso = reduzir o tempo de triagem e manter o cliente bem acompanhado.

## Operating Context
- Next.js 16 + Supabase + Vercel, produção em mcadvogados.app.br.
- Gemini (AI Studio, plano pago) gera perguntas de onboarding e rascunhos de demandas a partir de triagem, onboarding, ATAs e documentos.
- Integração com Google Drive (pastas dos clientes) e envio de relatórios por e-mail (Resend).

## Capabilities and Constraints
- Redesenho visual pedido em 07/10/2026: mudar SÓ o visual do sistema inteiro, sem quebrar nenhuma função existente.
- Referência pedida pelo usuário: "algum sistema de gestão famoso como base" (padrão consagrado de ferramenta de gestão, não um visual experimental). [inferido: Linear/Notion/Asana como régua de acabamento]

## Brand Commitments
- Identidade MC: navy (#0b2545 / #091827) e dourado (#c6a24f), monograma MC e logo em `public/brand/`. Mesma identidade do onboarding e do relatório em PDF.
- Tom profissional, direto, em português do Brasil. O usuário acha o sistema atual "com escrita demais, feio, estático": menos texto explicativo, mais clareza e interatividade.

## Product Principles
- A tarefa vem primeiro: o advogado encontra o cliente e a próxima ação em segundos.
- Menos texto, mais sinal: hierarquia, ícones e estados no lugar de parágrafos de instrução.
- Nada automático vai ao cliente sem revisão humana.
