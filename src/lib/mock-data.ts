// Dados fictícios para construir e revisar as telas antes de ligar o Supabase real.
// Nada aqui é persistido — só serve pra visualizar layout, estados e fluxo de navegação.

export type StatusFinanceiro = "pago" | "pendente" | "atrasado";
export type StatusAtividade = "aberta" | "em_andamento" | "concluida";
export type TipoPessoa = "PF" | "PJ";

export const currentClient = {
  id: "cli_1",
  name: "Comércio Bahia Ltda.",
  tipoPessoa: "PJ" as TipoPessoa,
  documento: "12.345.678/0001-90",
  plano: "Assessoria Jurídica Mensal",
};

export const mockClients = [
  { id: "cli_1", name: "Comércio Bahia Ltda.", tipoPessoa: "PJ" as TipoPessoa, documento: "12.345.678/0001-90", email: "contato@comerciobahia.com.br", ativo: true, horasMes: 14.5, statusFinanceiro: "pago" as StatusFinanceiro },
  { id: "cli_2", name: "Maria Fernanda Souza", tipoPessoa: "PF" as TipoPessoa, documento: "045.678.912-33", email: "mfsouza@gmail.com", ativo: true, horasMes: 3, statusFinanceiro: "pendente" as StatusFinanceiro },
  { id: "cli_3", name: "Construtora Litoral Sul S.A.", tipoPessoa: "PJ" as TipoPessoa, documento: "22.111.444/0001-05", email: "juridico@litoralsul.com.br", ativo: true, horasMes: 22, statusFinanceiro: "atrasado" as StatusFinanceiro },
  { id: "cli_4", name: "João Pedro Almeida", tipoPessoa: "PF" as TipoPessoa, documento: "112.223.334-55", email: "jp.almeida@outlook.com", ativo: true, horasMes: 1.5, statusFinanceiro: "pago" as StatusFinanceiro },
  { id: "cli_5", name: "Farmácia Vida Nova Ltda.", tipoPessoa: "PJ" as TipoPessoa, documento: "09.876.543/0001-21", email: "financeiro@vidanova.com.br", ativo: true, horasMes: 8, statusFinanceiro: "atrasado" as StatusFinanceiro },
  { id: "cli_6", name: "Roberto Carvalho Neto", tipoPessoa: "PF" as TipoPessoa, documento: "334.556.778-90", email: "roberto.neto@gmail.com", ativo: false, horasMes: 0, statusFinanceiro: "pago" as StatusFinanceiro },
];

export const mockHorasPorMes = [
  { mes: "Mar", horas: 9 },
  { mes: "Abr", horas: 12 },
  { mes: "Mai", horas: 6 },
  { mes: "Jun", horas: 15 },
  { mes: "Jul", horas: 10 },
  { mes: "Ago", horas: 14.5 },
];

export const mockAtividades = [
  { id: "atv_1", clientId: "cli_1", clientName: "Comércio Bahia Ltda.", title: "Análise de contrato de locação comercial", type: "Contratual", status: "em_andamento" as StatusAtividade, responsible: "Franciele Santos", deadline: "2026-08-22" },
  { id: "atv_2", clientId: "cli_1", clientName: "Comércio Bahia Ltda.", title: "Elaboração de notificação extrajudicial", type: "Consultivo", status: "aberta" as StatusAtividade, responsible: "Dr. Maurício Cardoso", deadline: "2026-08-25" },
  { id: "atv_3", clientId: "cli_3", clientName: "Construtora Litoral Sul S.A.", title: "Revisão de cláusulas de garantia em contrato de obra", type: "Contratual", status: "aberta" as StatusAtividade, responsible: "Dr. Maurício Cardoso", deadline: "2026-08-20" },
  { id: "atv_4", clientId: "cli_2", clientName: "Maria Fernanda Souza", title: "Petição inicial — ação de indenização", type: "Contencioso", status: "concluida" as StatusAtividade, responsible: "Franciele Santos", deadline: "2026-08-10" },
  { id: "atv_5", clientId: "cli_5", clientName: "Farmácia Vida Nova Ltda.", title: "Registro de marca — resposta a exigência do INPI", type: "Registro de Marca", status: "em_andamento" as StatusAtividade, responsible: "Franciele Santos", deadline: "2026-08-28" },
];

export const mockProcessos = [
  { id: "proc_1", clientId: "cli_3", clientName: "Construtora Litoral Sul S.A.", numero: "8001234-56.2025.8.05.0069", varaTribunal: "2ª Vara Cível de Teixeira de Freitas", area: "Cível", fase: "Instrução", status: "Em andamento", responsible: "Dr. Maurício Cardoso" },
  { id: "proc_2", clientId: "cli_2", clientName: "Maria Fernanda Souza", numero: "8005678-90.2025.8.05.0069", varaTribunal: "1ª Vara Cível de Teixeira de Freitas", area: "Consumidor", fase: "Sentença", status: "Aguardando julgamento", responsible: "Franciele Santos" },
  { id: "proc_3", clientId: "cli_1", clientName: "Comércio Bahia Ltda.", numero: "8009012-34.2024.8.05.0069", varaTribunal: "Vara do Trabalho de Teixeira de Freitas", area: "Trabalhista", fase: "Recursal", status: "Em andamento", responsible: "Dr. Maurício Cardoso" },
];

export const mockDocumentos = [
  { id: "doc_1", clientId: "cli_1", title: "Contrato de locação — assinado", category: "Contrato", uploadedBy: "Franciele Santos", date: "2026-08-14" },
  { id: "doc_2", clientId: "cli_1", title: "Relatório mensal — julho/2026", category: "Relatório", uploadedBy: "Sistema", date: "2026-08-01" },
  { id: "doc_3", clientId: "cli_1", title: "Procuração ad judicia", category: "Procuração", uploadedBy: "Dr. Maurício Cardoso", date: "2026-07-20" },
];

export const mockContratos = [
  { id: "ctr_1", clientId: "cli_1", clientName: "Comércio Bahia Ltda.", title: "Assessoria Jurídica Mensal", startDate: "2025-02-01", endDate: null, status: "ativo", value: 1800 },
  { id: "ctr_2", clientId: "cli_3", clientName: "Construtora Litoral Sul S.A.", title: "Assessoria Jurídica Mensal + Contencioso", startDate: "2024-11-01", endDate: null, status: "ativo", value: 3600 },
  { id: "ctr_3", clientId: "cli_5", clientName: "Farmácia Vida Nova Ltda.", title: "Registro de Marca", startDate: "2026-05-10", endDate: "2026-11-10", status: "ativo", value: 2200 },
];

export const mockFinanceiro = [
  { id: "fin_1", clientId: "cli_1", clientName: "Comércio Bahia Ltda.", description: "Mensalidade — agosto/2026", amount: 1800, dueDate: "2026-08-10", paidAt: "2026-08-09", status: "pago" as StatusFinanceiro },
  { id: "fin_2", clientId: "cli_2", clientName: "Maria Fernanda Souza", description: "Honorários — ação de indenização", amount: 950, dueDate: "2026-08-18", paidAt: null, status: "pendente" as StatusFinanceiro },
  { id: "fin_3", clientId: "cli_3", clientName: "Construtora Litoral Sul S.A.", description: "Mensalidade — agosto/2026", amount: 3600, dueDate: "2026-08-05", paidAt: null, status: "atrasado" as StatusFinanceiro },
  { id: "fin_4", clientId: "cli_5", clientName: "Farmácia Vida Nova Ltda.", description: "Parcela 2/4 — Registro de Marca", amount: 550, dueDate: "2026-08-12", paidAt: null, status: "atrasado" as StatusFinanceiro },
  { id: "fin_5", clientId: "cli_1", clientName: "Comércio Bahia Ltda.", description: "Mensalidade — julho/2026", amount: 1800, dueDate: "2026-07-10", paidAt: "2026-07-08", status: "pago" as StatusFinanceiro },
];

export const mockTimeEntries = [
  { id: "te_1", clientId: "cli_1", clientName: "Comércio Bahia Ltda.", advogado: "Franciele Santos", activityType: "Análise contratual", date: "2026-08-14", hours: 2.5, billable: true },
  { id: "te_2", clientId: "cli_3", clientName: "Construtora Litoral Sul S.A.", advogado: "Dr. Maurício Cardoso", activityType: "Audiência", date: "2026-08-13", hours: 3, billable: true },
  { id: "te_3", clientId: "cli_5", clientName: "Farmácia Vida Nova Ltda.", advogado: "Franciele Santos", activityType: "Registro de marca", date: "2026-08-12", hours: 1.5, billable: true },
  { id: "te_4", clientId: "cli_2", clientName: "Maria Fernanda Souza", advogado: "Franciele Santos", activityType: "Petição", date: "2026-08-11", hours: 2, billable: true },
  { id: "te_5", clientId: "cli_1", clientName: "Comércio Bahia Ltda.", advogado: "Dr. Maurício Cardoso", activityType: "Reunião com cliente", date: "2026-08-08", hours: 1, billable: false },
];

export const mockTeam = [
  { id: "team_1", name: "Dr. Maurício Cardoso", role: "admin", email: "mauricio@mcadvogados.com.br", clientesAtivos: 6 },
  { id: "team_2", name: "Franciele Santos", role: "advogado", email: "franciele@mcadvogados.com.br", clientesAtivos: 5 },
];

export const mockReports = [
  { id: "rep_1", clientId: "cli_1", referenceMonth: 7, referenceYear: 2026, sentAt: "2026-08-01" },
  { id: "rep_2", clientId: "cli_1", referenceMonth: 6, referenceYear: 2026, sentAt: "2026-07-01" },
];

export function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}
