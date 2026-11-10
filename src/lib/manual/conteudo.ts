// Manual do portal (09/11/2026, pedido do João: "manual de instrução do sistema
// inteiro"). Um capítulo por item do menu, com as telas de dentro: para que
// serve, passo a passo e dicas. Os prints ficam no Storage (avatars/manual/…),
// em HD e com os dados pessoais borrados. Ao mudar uma tela, atualize aqui.

const IMG = "https://uegilxluucctdsvooqpt.supabase.co/storage/v1/object/public/avatars/manual/2026-11-09";

export type TelaManual = { titulo: string; href?: string; print?: string; praQue: string; passos: string[]; dicas?: string[] };
export type Capitulo = { id: string; titulo: string; onde: string; resumo: string; telas: TelaManual[] };

const p = (nome: string) => `${IMG}/${nome}.png`;

export const PRIMEIROS_PASSOS: { titulo: string; texto: string }[] = [
  { titulo: "Entrar", texto: "Acesse mcadvogados.app.br e entre com o seu e-mail e senha. Esqueceu a senha? Clique em “Esqueci minha senha” na tela de entrada." },
  { titulo: "Menu", texto: "O menu da esquerda tem as áreas do escritório. Dentro de cada área, as telas aparecem como abas no alto da página. Cada pessoa vê só o que tem permissão (quem libera é o Dr. Maurício, em Gestão → Equipe)." },
  { titulo: "Busca rápida", texto: "A caixa “Buscar cliente, atividade, processo…” no topo (ou Ctrl + K) acha qualquer coisa do portal pelo nome." },
  { titulo: "Botão Novo", texto: "O botão azul “Novo”, no topo, cria atividade, compromisso, cliente e outros sem sair da tela em que você está." },
  { titulo: "Sininho e avisos no celular", texto: "O sininho mostra o que precisa da sua atenção (publicação encaminhada, prazo, menção, lead novo…). No celular, abra o portal e toque em “Ativar avisos no celular” para receber os mesmos avisos como notificação." },
  { titulo: "Reloginho da rotina", texto: "O relógio no topo abre a sua rotina do dia (tarefas fixas e o relatório de fim de expediente). Ele acende quando há tarefa atrasada ou quando está perto do prazo do relatório." },
  { titulo: "Assistente (IA)", texto: "O botão redondo no canto de baixo (ou Ctrl + J) abre o Assistente. Peça em português, como para uma pessoa: “quais prazos vencem hoje?”, “cria uma atividade para a Talita amanhã”, “quantos leads chegaram hoje?”. Antes de mudar algo, ele mostra o que vai fazer e pede sua confirmação." },
  { titulo: "Novidades", texto: "Quando algo muda no portal, uma janela com prints e “como usar” abre sozinha na primeira vez. Depois ela fica em Caixa de entrada → Novidades." },
  { titulo: "No celular", texto: "No iPhone: Safari → Compartilhar → “Adicionar à Tela de Início”. No Android: Chrome → menu ⋮ → “Instalar app”. O portal abre como um aplicativo." },
];

export const CAPITULOS: Capitulo[] = [
  {
    id: "inicio",
    titulo: "Área de trabalho",
    onde: "Menu → Área de trabalho",
    resumo: "A primeira tela ao entrar: o que é seu hoje, o que precisa de você e como está a equipe.",
    telas: [
      {
        titulo: "Área de trabalho",
        href: "/admin",
        print: p("inicio"),
        praQue: "Mostrar num lugar só os seus prazos de hoje, o que está atrasado, o que precisa de você, a agenda do escritório e o ranking da equipe.",
        passos: [
          "Veja os contadores: Suas atrasadas, Vencem hoje, Próximos 7 dias e Para distribuir. Clique em um para abrir a lista.",
          "Em “Precisa de você” ficam os itens que esperam uma ação sua (pedido de prazo, publicação encaminhada, menção).",
          "“Ver meu dia” abre a sua agenda do dia; “Distribuir pedidos” leva à Distribuição.",
          "Mais abaixo: Meus indicadores do mês, Agenda do escritório e Ranking da equipe.",
        ],
        dicas: ["Comece o dia por aqui: o que está em vermelho é o que vence ou já venceu."],
      },
    ],
  },
  {
    id: "distribuicao",
    titulo: "Distribuição",
    onde: "Menu → Distribuição",
    resumo: "Tudo o que chega de fora (WhatsApp, e-mail, publicações) já com um responsável sugerido.",
    telas: [
      {
        titulo: "Distribuição",
        href: "/admin/distribuicao",
        print: p("distribuicao"),
        praQue: "Transformar os pedidos que chegam dos clientes em atividades, com o responsável certo.",
        passos: [
          "Cada cartão é um pedido que chegou (com a mensagem original e o cliente).",
          "Confira o responsável sugerido; troque se quiser.",
          "Clique em “Criar atividade” para virar demanda, ou descarte se não for trabalho.",
        ],
        dicas: ["A IA lê o WhatsApp do escritório e já monta o pedido; você só confere."],
      },
    ],
  },
  {
    id: "whatsapp",
    titulo: "WhatsApp",
    onde: "Menu → WhatsApp",
    resumo: "O WhatsApp do escritório dentro do portal, com as conversas de clientes e grupos.",
    telas: [
      {
        titulo: "WhatsApp do escritório",
        href: "/admin/whatsapp",
        print: p("whatsapp"),
        praQue: "Ler e responder clientes sem pegar o celular do escritório, agendar mensagens e usar respostas rápidas.",
        passos: [
          "Escolha a conversa na lista da esquerda (filtros: Todas, Não lidas, Grupos, PF, PJ).",
          "Escreva embaixo e envie. Para mandar arquivo ou áudio, use os botões ao lado da caixa de texto.",
          "No relógio da conversa, agende uma mensagem para depois (uma vez, todo dia, toda semana ou todo mês).",
          "Digite “/” para usar uma resposta rápida salva.",
        ],
        dicas: ["A bolinha verde embaixo mostra que o número do escritório está conectado.", "Só quem tem a permissão “WhatsApp do escritório” vê esta tela."],
      },
    ],
  },
  {
    id: "demandas",
    titulo: "Demandas",
    onde: "Menu → Demandas (Atividades, Rotinas, Agenda)",
    resumo: "O trabalho do dia a dia: atividades com prazo, a rotina de cada pessoa e a agenda.",
    telas: [
      {
        titulo: "Atividades",
        href: "/admin/activities",
        print: p("atividades"),
        praQue: "Ver e organizar todas as demandas do escritório (tarefas, prazos processuais e audiências).",
        passos: [
          "Use os atalhos no alto: Todas, Hoje, Esta semana, Este mês ou Atrasadas (pelo prazo da atividade). Valem na Lista e no Quadro.",
          "Troque entre Lista e Quadro (colunas por status: arraste o cartão para mudar o status).",
          "Agrupe por Cliente ou Responsável; o ícone de filtro tem status, responsável, cliente, tipo, área e etiqueta.",
          "Clique na atividade para abrir: comentar, anexar arquivo, checklist, mudar responsável e concluir.",
          "Para mudar um prazo que já existe, use “Pedir mudança de prazo” (nova data + justificativa). O Dr. Maurício aprova ou recusa.",
        ],
        dicas: ["Etiquetas ajudam a separar assuntos (ex.: urgente, aguardando cliente).", "O botão de download exporta a lista filtrada para planilha."],
      },
      {
        titulo: "Nova atividade",
        href: "/admin/activities/new",
        print: p("atividades-nova"),
        praQue: "Criar uma demanda com cliente, responsável, prazo e tipo.",
        passos: [
          "Escreva o título e escolha o cliente (ou deixe sem cliente).",
          "Escolha o responsável e, se quiser, quem mais acompanha.",
          "Ponha o prazo. Horário só aparece em audiência (hora marcada).",
          "Anexe arquivos se precisar (até 50 MB; vão para o Drive do cliente) e salve.",
        ],
      },
      {
        titulo: "Rotinas",
        href: "/admin/rotinas",
        print: p("rotinas"),
        praQue: "A rotina de cada pessoa: tarefas fixas do dia e o relatório de fim de expediente.",
        passos: [
          "Marque as tarefas fixas conforme for fazendo.",
          "No fim do dia, preencha o relatório (respostas, equipe e demandas vencidas com justificativa) e envie.",
          "O prazo do relatório e o que acontece depois dele estão nas Regras da rotina, definidas pelo Dr. Maurício. Enviar depois do prazo fica marcado como atraso.",
          "O Dr. Maurício lê, dá nota e aprova cada relatório.",
        ],
        dicas: ["O reloginho no topo abre a sua rotina de qualquer tela."],
      },
      {
        titulo: "Agenda",
        href: "/admin/agenda",
        print: p("agenda"),
        praQue: "Prazos, audiências e compromissos (reuniões, ligações) em calendário.",
        passos: [
          "Navegue por dia, semana ou mês.",
          "“Novo compromisso” marca reunião, ligação ou evento; com cliente, ele pode ser lembrado pelo WhatsApp.",
        ],
      },
    ],
  },
  {
    id: "caixa",
    titulo: "Caixa de entrada",
    onde: "Menu → Caixa de entrada (Alertas, Publicações, Mensagens, Novidades)",
    resumo: "Tudo o que chega para você ler: andamentos, publicações, mensagens da equipe e novidades do portal.",
    telas: [
      {
        titulo: "Alertas",
        href: "/admin/alertas",
        print: p("alertas"),
        praQue: "Andamentos novos dos processos, publicações e pedidos de mudança de prazo, num lugar só.",
        passos: [
          "Use as abas (Andamentos, Publicações, Prazos) e os botões Minhas / Sem responsável / Todas.",
          "Abra o item, trate (crie a atividade ou marque como lido) e siga para o próximo.",
          "Na aba Prazos, o Dr. Maurício aprova ou recusa os pedidos de mudança de prazo.",
        ],
      },
      {
        titulo: "Publicações",
        href: "/admin/publicacoes",
        print: p("publicacoes"),
        praQue: "Intimações do Diário de Justiça (DJEN), buscadas a cada 2 horas das 06h às 22h, e despachos de marcas do INPI.",
        passos: [
          "Abre em “Minhas”: só as publicações dos processos em que você é responsável. “Todas do escritório” mostra tudo.",
          "Leia, crie a atividade/prazo sugerido ou descarte.",
          "Chegou publicação de outra pessoa? “Encaminhar para…”: ela passa a ser dessa pessoa, que recebe aviso.",
        ],
        dicas: ["O Assistente também encaminha: “encaminha a publicação do processo 0001234 para a Talita”."],
      },
      {
        titulo: "Mensagens",
        href: "/admin/mensagens",
        print: p("mensagens"),
        praQue: "Conversas internas da equipe, o canal Escritório e os seus avisos (menções, comentários, atividades que caíram com você).",
        passos: ["Escolha a conversa ou o canal à esquerda e escreva.", "Use @nome para chamar alguém: a pessoa recebe aviso."],
      },
      {
        titulo: "Novidades",
        href: "/admin/novidades",
        print: p("novidades"),
        praQue: "O que mudou no portal e como usar, com prints. A mais nova abre sozinha uma vez.",
        passos: ["Leia a novidade e o “como usar”. O link leva direto à tela que mudou."],
      },
    ],
  },
  {
    id: "contatos",
    titulo: "Contatos",
    onde: "Menu → Contatos (Contatos, Onboarding, Regimento Interno, Aniversários)",
    resumo: "Clientes (empresas e pessoas), a entrada de clientes novos e os questionários de regimento.",
    telas: [
      {
        titulo: "Contatos (clientes)",
        href: "/admin/clients",
        print: p("contatos"),
        praQue: "A lista de clientes: empresas e pessoas físicas, com a ficha de cada um.",
        passos: [
          "Troque entre Empresas e Pessoas. Veja em Lista ou Pipeline (etapas do cliente).",
          "Clique no cliente para abrir a ficha: dados, atividades, documentos, processos, WhatsApp, ficha de handoff e acesso ao portal do cliente.",
          "“Nova empresa” cadastra um cliente; depois preencha a Ficha de Handoff.",
        ],
        dicas: ["Cadastrar o cliente não dá acesso ao portal para ele: o convite é na ficha, em “Acesso do cliente”."],
      },
      {
        titulo: "Onboarding",
        href: "/admin/onboarding",
        print: p("onboarding"),
        praQue: "A entrada de clientes novos: perguntas, ações e PDF guardados por cliente.",
        passos: ["Clique em novo onboarding, escolha o cliente e o tipo de serviço.", "A IA monta as perguntas; preencha na reunião e gere o PDF."],
      },
      {
        titulo: "Regimento Interno",
        href: "/admin/regimentos",
        print: p("regimentos"),
        praQue: "Questionários de regimento interno das empresas clientes.",
        passos: ["“Novo regimento”: informe o segmento e dados da empresa; a IA monta as seções e perguntas do ramo.", "Revise e copie o link para o cliente responder."],
      },
      {
        titulo: "Aniversários",
        href: "/admin/clients/aniversarios",
        print: p("aniversarios"),
        praQue: "Quem faz aniversário hoje e nos próximos dias, com parabéns pelo WhatsApp.",
        passos: ["Veja a lista do dia e clique para mandar os parabéns."],
      },
    ],
  },
  {
    id: "comercial",
    titulo: "Comercial (CRM)",
    onde: "Menu → Comercial (Funil, Formulários, Visitas, Números, Pixels e ajustes)",
    resumo: "Leads dos formulários e anúncios, o funil de vendas e os pixels. Só para quem tem a permissão “Comercial”.",
    telas: [
      {
        titulo: "Funil",
        href: "/admin/comercial",
        print: p("comercial"),
        praQue: "Acompanhar cada pessoa interessada até virar cliente.",
        passos: [
          "Cada coluna é uma etapa (Novo, Em contato, Reunião marcada, Proposta enviada, Fechado, Perdido). Arraste o cartão para mudar.",
          "Perdido pede o motivo; Fechado pede o valor (vai para os anúncios como venda).",
          "O botão “Zap” abre a conversa com a mensagem pronta e conta como primeiro contato.",
          "Clique no nome para abrir a ficha: respostas do formulário, de onde veio, anotações, próximo contato e “Virar cliente”.",
        ],
        dicas: ["“Novo lead” cadastra à mão quem veio por indicação, ligação ou Instagram."],
      },
      {
        titulo: "Formulários",
        href: "/admin/comercial/formularios",
        print: p("comercial-formularios"),
        praQue: "Os quizzes de uma pergunta por tela (no lugar do Yay! Forms). Cada resposta vira lead.",
        passos: [
          "“Copiar link” para colocar no anúncio, na bio ou no WhatsApp.",
          "“Editar” muda perguntas, imagens, cores e a tela final; dá para pular perguntas conforme a resposta.",
          "Toda pergunta é obrigatória: quem preenche só avança respondendo, e só envia com tudo respondido (não existe botão “Pular”).",
          "Para saber de qual anúncio veio, ponha no fim do link: ?utm_source=instagram&utm_campaign=nome-da-campanha",
        ],
      },
      {
        titulo: "Visitas",
        href: "/admin/comercial/visitas",
        print: p("comercial-visitas"),
        praQue: "O pixel próprio: quem entrou nos formulários, de onde veio, aparelho, cidade e até qual pergunta foi.",
        passos: ["Veja quantos estão preenchendo agora, quantos abriram, começaram e enviaram.", "“Onde desistem” mostra em vermelho a pergunta que mais perde gente."],
        dicas: ["Quem não envia fica anônimo: guardamos só o caminho, nunca o que foi digitado."],
      },
      {
        titulo: "Números",
        href: "/admin/comercial/numeros",
        print: p("comercial-numeros"),
        praQue: "Leads por dia, de onde vêm, quantos fecham, tempo até o primeiro contato e por que perdemos.",
        passos: ["Escolha o período (7, 30 ou 90 dias) e leia os quadros."],
      },
      {
        titulo: "Pixels e ajustes",
        href: "/admin/comercial/configurar",
        print: p("comercial-config"),
        praQue: "Ligar o pixel da Meta e do Google, escolher quem recebe os leads e editar as etapas do funil.",
        passos: ["Cole o ID do Pixel e o token da API de Conversões (Meta) e o ID do GA4/Ads (Google). Salve e use “Enviar evento de teste”.", "Marque as pessoas do rodízio de leads e se o aviso vai também pelo WhatsApp."],
      },
    ],
  },
  {
    id: "processos",
    titulo: "Processos",
    onde: "Menu → Processos",
    resumo: "Os processos judiciais acompanhados, com andamentos lidos direto dos tribunais.",
    telas: [
      {
        titulo: "Processos e casos",
        href: "/admin/processes",
        print: p("processos"),
        praQue: "Ver os processos do escritório, o responsável e os últimos andamentos.",
        passos: ["Busque pelo número, cliente ou parte.", "Clique no processo para ver os andamentos, publicações, partes e atividades ligadas."],
      },
      {
        titulo: "Novo processo",
        href: "/admin/processes/new",
        print: p("processos-novo"),
        praQue: "Cadastrar um processo pesquisando direto no tribunal.",
        passos: ["Pesquise pelo número.", "Confira os dados lidos do tribunal e aprove: entra todo o histórico e o portal passa a acompanhar os andamentos novos."],
      },
    ],
  },
  {
    id: "marcas",
    titulo: "Marcas (INPI)",
    onde: "Menu → Marcas",
    resumo: "A carteira de marcas e patentes no INPI, igual ao Marca Acompanhada, mais as buscas de viabilidade e o envio da situação aos clientes.",
    telas: [
      {
        titulo: "Principal",
        href: "/admin/marcas",
        print: p("marcas"),
        praQue: "A visão geral: o que precisa de atenção, prazos, a última revista do INPI e as marcas por estágio.",
        passos: [
          "“Para sua atenção”: prazos administrativos, possíveis oposições e clientes a avisar.",
          "Movimentações → Prazos: o que vence; Última revista: os despachos da carteira na RPI da semana.",
          "Marcas por estágio: registradas, em exame, em recurso, indeferidas…",
        ],
        dicas: ["O portal confere todas as marcas no INPI toda madrugada; se o INPI estiver fora do ar, tenta de novo às 10h, 14h e 18h."],
      },
      {
        titulo: "Processos (marcas acompanhadas)",
        href: "/admin/marcas/processos",
        print: p("marcas-processos"),
        praQue: "A carteira com o último despacho e a situação de cada marca.",
        passos: [
          "Busque pelo nome, processo ou titular.",
          "Clique no processo para a ficha completa: dados, previsão das próximas etapas, histórico de publicações e petições.",
          "Na ficha: Configurar (cliente, avisos, colidência), Imprimir (PDF da ficha para o cliente) e Descadastrar.",
        ],
      },
      {
        titulo: "Cadastrar processos",
        href: "/admin/marcas/cadastrar",
        print: p("marcas-cadastrar"),
        praQue: "Pôr marcas na carteira, achando no INPI por número, nome exato, titular ou procurador.",
        passos: [
          "Escolha a aba (Nº de processo, Nome exato, Titular, Procurador), digite e clique em Pesquisar.",
          "Marque os processos e clique em “Acompanhar selecionados” (ou “Acompanhar” na linha).",
          "Processo ainda não publicado? Em “Cadastrar manualmente”, digite o número e, se quiser, nome, classe, titular e cliente. Ele entra como “Aguardando publicação” e a ficha completa entra sozinha quando sair na revista (você recebe aviso).",
        ],
        dicas: ["Se o INPI estiver fora do ar, aparece uma faixa azul: o resultado vem da base própria do portal (todas as revistas do INPI desde 2017)."],
      },
      {
        titulo: "Revistas INPI",
        href: "/admin/marcas/revistas",
        print: p("marcas-revistas"),
        praQue: "As Revistas da Propriedade Industrial de marcas, com o PDF oficial e quantos despachos saíram para a carteira.",
        passos: ["Escolha o ano e abra a revista; o número ao lado mostra quantos despachos foram das nossas marcas."],
      },
      {
        titulo: "Colidências",
        href: "/admin/marcas/colidencias",
        print: p("marcas-colidencias"),
        praQue: "Marcas de terceiros publicadas na revista parecidas com as nossas, para avaliar oposição.",
        passos: ["Abra a colidência, compare e marque: revisada, ações necessárias ou monitorando.", "Em Configuração em lote, ajuste o escopo (mesma classe, natureza ou todas) e a sensibilidade."],
      },
      {
        titulo: "Busca com IA (viabilidade)",
        href: "/admin/marcas/busca-ia",
        print: p("marcas-busca-ia"),
        praQue: "Saber se uma marca pode ser registrada: a IA escolhe as classes, pesquisa no INPI e escreve o parecer.",
        passos: [
          "Digite o elemento nominativo (exatamente como vai ser depositado) e, se for mista, envie o logo.",
          "Diga onde a marca será usada (ramo) e clique em “Pesquisar Viabilidade” (leva cerca de 1 minuto).",
          "O relatório segue o padrão do INPI: o resultado de cada pesquisa (“Foram encontrados N processos”) com a tabela, e depois o parecer com o risco, a análise por classe e as recomendações. As anterioridades que pesam ficam em amarelo.",
          "“Gerar PDF” imprime o relatório para o cliente.",
        ],
        dicas: ["O histórico de buscas fica na mesma tela para reabrir depois."],
      },
      {
        titulo: "Busca Integrada",
        href: "/admin/marcas/busca-integrada",
        print: p("marcas-busca-integrada"),
        praQue: "Pesquisar no INPI pelos critérios: nome exato, radical, fonética, titular, procurador ou número.",
        passos: ["Escolha o critério, digite e, se quiser, a classe.", "Ponha os processos que interessam no carrinho e baixe o relatório (Excel) ou leve para a Busca com IA."],
      },
      {
        titulo: "Patentes",
        href: "/admin/marcas/patentes",
        print: p("marcas-patentes"),
        praQue: "As patentes acompanhadas e suas últimas publicações no INPI.",
        passos: ["Clique na patente para a ficha com o histórico e as anuidades."],
      },
      {
        titulo: "WhatsApp das marcas",
        href: "/admin/marcas/whatsapp",
        print: p("marcas-whatsapp"),
        praQue: "Mandar para cada cliente a situação da marca dele, com mensagem pronta por status.",
        passos: [
          "Confira o número e o status de cada marca (dá para editar na própria lista).",
          "Envie uma, as selecionadas ou todas. Ou ligue o envio automático num dia do mês.",
          "Os modelos de mensagem (um por status) ficam editáveis na mesma tela.",
        ],
      },
    ],
  },
  {
    id: "arquivos",
    titulo: "Arquivos",
    onde: "Menu → Arquivos (Documentos, Contratos, Reuniões, Relatórios)",
    resumo: "Documentos dos clientes, contratos, gravações de reunião e relatórios mensais.",
    telas: [
      { titulo: "Documentos", href: "/admin/documents", print: p("documentos"), praQue: "Os documentos de cada cliente (também no Google Drive dele).", passos: ["“Enviar documento”: escolha o cliente e o arquivo.", "Marque se o cliente pode ver no portal dele."] },
      { titulo: "Contratos", href: "/admin/contracts", print: p("contratos"), praQue: "Contratos dos clientes, gerados a partir dos modelos do escritório.", passos: ["“Novo contrato”: escolha o cliente e o modelo, confira os dados e salve.", "O contrato fica na ficha do cliente para baixar ou enviar."] },
      {
        titulo: "Reuniões (atas)",
        href: "/admin/atas",
        print: p("reunioes"),
        praQue: "Gravar a reunião (ou enviar o áudio) e receber a transcrição fiel e o resumo com IA. Se precisar, gera a ata.",
        passos: ["“Nova reunião”: preencha os dados, avise que vai gravar e clique em Começar (pode trocar de aba).", "Ao terminar, saem a transcrição e o resumo; “Gerar ata” escreve a ata para assinatura."],
      },
      { titulo: "Relatórios mensais", href: "/admin/reports", print: p("relatorios"), praQue: "Relatórios em PDF para o cliente acompanhar o trabalho do mês.", passos: ["“Gerar relatório”: escolha o cliente e o mês; revise e envie (também pelo WhatsApp)."] },
    ],
  },
  {
    id: "financeiro",
    titulo: "Financeiro",
    onde: "Menu → Financeiro",
    resumo: "Lançamentos de honorários e despesas. Só para quem tem a permissão “Financeiro”.",
    telas: [{ titulo: "Financeiro", href: "/admin/financial", print: p("financeiro"), praQue: "Controlar o que entra e sai.", passos: ["“Novo lançamento”: valor, cliente, vencimento e se já foi pago."] }],
  },
  {
    id: "ferramentas",
    titulo: "Ferramentas",
    onde: "Menu → Ferramentas (IA, Transcrição)",
    resumo: "O Assistente em tela grande e a transcrição de áudios.",
    telas: [
      { titulo: "IA (Assistente)", href: "/admin/ia", print: p("ia"), praQue: "O mesmo Assistente do botão redondo (Ctrl + J), em tela grande.", passos: ["Peça em português; ele consulta e faz por você, pedindo confirmação antes de mudar algo."] },
      {
        titulo: "Transcrição",
        href: "/admin/transcricao",
        print: p("transcricao"),
        praQue: "Transformar áudio (ou vídeo) em texto, palavra por palavra, e/ou num resumo com IA.",
        passos: ["Envie, grave ou puxe do WhatsApp um áudio.", "Escolha transcrição fiel, resumo ou os dois; edite e baixe em TXT, PDF, Word ou abra no Google Docs."],
      },
    ],
  },
  {
    id: "gestao",
    titulo: "Gestão",
    onde: "Menu → Gestão (Painel do Dono, Indicadores, Equipe, Integrações, Lixeira)",
    resumo: "Números do escritório, a equipe e as permissões, integrações e a lixeira.",
    telas: [
      { titulo: "Painel do Dono", href: "/admin/painel", print: p("painel"), praQue: "Só para o Dr. Maurício: saúde do escritório, números, rotinas da equipe e prioridades, com resumo da IA.", passos: ["Leia o resumo do dia; os quadros abrem o detalhe de cada número."] },
      { titulo: "Indicadores", href: "/admin/indicadores", print: p("indicadores"), praQue: "Os seus números: entregas, prazos cumpridos, atrasos, publicações e pontos.", passos: ["Escolha o período e compare com o mês anterior."] },
      {
        titulo: "Equipe",
        href: "/admin/team",
        print: p("equipe"),
        praQue: "As pessoas do escritório, convites e o que cada uma pode ver.",
        passos: ["“Convidar pessoa”: e-mail e papel (administrador ou advogado).", "O Dr. Maurício abre a pessoa para ligar/desligar permissões (telas e ações) e escolher os clientes dela.", "A etiqueta azul “Suporte” marca a conta de suporte técnico do portal (manutenção do sistema), com os mesmos poderes do administrador."],
      },
      { titulo: "Integrações", href: "/admin/integracoes", print: p("integracoes"), praQue: "Serviços ligados ao portal, como o Google Drive (pastas dos clientes).", passos: ["Ligue as pastas do Drive ao cliente certo e use “Sincronizar”."] },
      { titulo: "Lixeira", href: "/admin/lixeira", print: p("lixeira"), praQue: "O que foi excluído fica 30 dias aqui antes de sumir.", passos: ["Restaure o que foi excluído por engano."] },
    ],
  },
];

export const PERGUNTAS: { p: string; r: string }[] = [
  { p: "Não estou vendo uma tela que outra pessoa vê.", r: "Cada pessoa vê só o que tem permissão. Peça ao Dr. Maurício para liberar em Gestão → Equipe." },
  { p: "Preciso mudar o prazo de uma atividade.", r: "Abra a atividade e use “Pedir mudança de prazo” (nova data + justificativa). O Dr. Maurício aprova ou recusa; você recebe aviso." },
  { p: "Chegou uma publicação que não é minha.", r: "Em Publicações, clique em “Encaminhar para…” e escolha a pessoa. Ela passa a ser a responsável e recebe aviso." },
  { p: "Não recebo os avisos no celular.", r: "Abra o portal no celular e toque em “Ativar avisos no celular”; aceite as notificações quando o navegador perguntar." },
  { p: "O INPI está fora do ar. As buscas de marca param?", r: "Não. O portal usa a base própria (todas as revistas do INPI desde 2017) e mostra uma faixa azul avisando. A conferência das marcas tenta de novo mais tarde sozinha." },
  { p: "Como mando um formulário para um cliente em potencial?", r: "Comercial → Formulários → Copiar link. A resposta vira lead no Funil e quem cuida recebe aviso." },
  { p: "Passou o horário do relatório do dia.", r: "Depende das Regras da rotina definidas pelo Dr. Maurício: em geral ainda dá para enviar, mas fica marcado como atraso e ele é avisado." },
];
