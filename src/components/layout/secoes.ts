import {
  Activity,
  AudioLines,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  FileSignature,
  FileText,
  FolderOpen,
  Gauge,
  Gavel,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Mail,
  MessageCircle,
  MessagesSquare,
  Newspaper,
  NotebookPen,
  Plug,
  BellRing,
  BookOpen,
  Search,
  ShieldAlert,
  Stamp,
  SquareKanban,
  Target,
  Radar,
  ClipboardPen,
  BookCheck,
  Lightbulb,
  FilePlus,
  Cake,
  Settings2,
  Sparkles,
  Trash2,
  UserCog,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { PERM_DA_TELA, type PermChave, type Permissoes } from "@/lib/permissoes";

/** perm: permissão da tela quando ela não está em PERM_DA_TELA (subtelas novas). */
export type NavItem = { href: string; label: string; icon: LucideIcon; todos?: boolean; soSuper?: boolean; perm?: PermChave };
export type Secao = { id: string; label: string; icon: LucideIcon; abas: NavItem[] };

// Menu em seções (30/10/2026, redesenho da navegação), em ordem de prioridade
// (Distribuição, WhatsApp e Demandas logo abaixo da Área de trabalho): cada item do menu é uma
// seção, e as telas dela viram abas no topo da página (AbasSecao). As rotas
// continuam as mesmas; só muda como se chega nelas. Cada pessoa vê só as telas
// liberadas para ela (PERM_DA_TELA); o admin máximo vê tudo.
export const SECOES: Secao[] = [
  { id: "inicio", label: "Área de trabalho", icon: LayoutDashboard, abas: [{ href: "/admin", label: "Área de trabalho", icon: LayoutDashboard }] },
  { id: "distribuicao", label: "Distribuição", icon: Inbox, abas: [{ href: "/admin/distribuicao", label: "Distribuição", icon: Inbox }] },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle, abas: [{ href: "/admin/whatsapp", label: "WhatsApp", icon: MessageCircle }] },
  {
    id: "demandas",
    label: "Demandas",
    icon: ListChecks,
    abas: [
      { href: "/admin/activities", label: "Atividades", icon: ListChecks },
      { href: "/admin/rotinas", label: "Rotinas", icon: CalendarCheck, todos: true },
      { href: "/admin/agenda", label: "Agenda", icon: CalendarDays },
    ],
  },
  {
    id: "caixa",
    label: "Caixa de entrada",
    icon: Mail,
    abas: [
      { href: "/admin/alertas", label: "Alertas", icon: BellRing },
      { href: "/admin/publicacoes", label: "Publicações", icon: Newspaper },
      { href: "/admin/mensagens", label: "Mensagens", icon: MessagesSquare, todos: true },
      { href: "/admin/novidades", label: "Novidades", icon: Sparkles, todos: true },
    ],
  },
  {
    id: "contatos",
    label: "Contatos",
    icon: Users,
    abas: [
      { href: "/admin/clients", label: "Contatos", icon: Users },
      { href: "/admin/onboarding", label: "Onboarding", icon: ClipboardList },
      { href: "/admin/regimentos", label: "Regimento Interno", icon: BookCheck, perm: "onboarding" },
      { href: "/admin/clients/aniversarios", label: "Aniversários", icon: Cake, perm: "clientes" },
    ],
  },
  {
    // CRM (06/11/2026): leads dos formulários e anúncios, funil e pixels
    id: "comercial",
    label: "Comercial",
    icon: Target,
    abas: [
      { href: "/admin/comercial", label: "Funil", icon: SquareKanban, perm: "comercial" },
      { href: "/admin/comercial/formularios", label: "Formulários", icon: ClipboardPen, perm: "comercial" },
      { href: "/admin/comercial/visitas", label: "Visitas", icon: Radar, perm: "comercial" },
      { href: "/admin/comercial/numeros", label: "Números", icon: BarChart3, perm: "comercial" },
      { href: "/admin/comercial/configurar", label: "Pixels e ajustes", icon: Settings2, perm: "comercial" },
    ],
  },
  { id: "processos", label: "Processos", icon: Gavel, abas: [{ href: "/admin/processes", label: "Processos e casos", icon: Gavel }] },
  {
    // marcas no INPI (30/10/2026), as mesmas telas do Marca Acompanhada
    id: "marcas",
    label: "Marcas",
    icon: Stamp,
    abas: [
      { href: "/admin/marcas", label: "Principal", icon: LayoutDashboard, perm: "marcas" },
      { href: "/admin/marcas/processos", label: "Processos", icon: Search, perm: "marcas" },
      { href: "/admin/marcas/cadastrar", label: "Cadastrar processos", icon: FilePlus, perm: "marcas" },
      { href: "/admin/marcas/revistas", label: "Revistas INPI", icon: BookOpen, perm: "marcas" },
      { href: "/admin/marcas/colidencias", label: "Colidências", icon: ShieldAlert, perm: "marcas" },
      { href: "/admin/marcas/busca-ia", label: "Busca com IA", icon: Sparkles, perm: "marcas" },
      { href: "/admin/marcas/busca-integrada", label: "Busca Integrada", icon: Search, perm: "marcas" },
      { href: "/admin/marcas/patentes", label: "Patentes", icon: Lightbulb, perm: "marcas" },
      { href: "/admin/marcas/whatsapp", label: "WhatsApp", icon: MessageCircle, perm: "marcas" },
    ],
  },
  {
    id: "arquivos",
    label: "Arquivos",
    icon: FolderOpen,
    abas: [
      { href: "/admin/documents", label: "Documentos", icon: FileText },
      { href: "/admin/contracts", label: "Contratos", icon: FileSignature },
      { href: "/admin/atas", label: "Reuniões", icon: NotebookPen },
      { href: "/admin/reports", label: "Relatórios", icon: BarChart3 },
    ],
  },
  { id: "financeiro", label: "Financeiro", icon: Wallet, abas: [{ href: "/admin/financial", label: "Financeiro", icon: Wallet }] },
  {
    id: "ferramentas",
    label: "Ferramentas",
    icon: Wrench,
    abas: [
      { href: "/admin/ia", label: "IA", icon: Sparkles },
      { href: "/admin/transcricao", label: "Transcrição", icon: AudioLines, todos: true },
    ],
  },
  {
    id: "gestao",
    label: "Gestão",
    icon: Settings2,
    abas: [
      { href: "/admin/painel", label: "Painel do Dono", icon: Gauge, soSuper: true },
      { href: "/admin/indicadores", label: "Indicadores", icon: Activity, todos: true },
      { href: "/admin/team", label: "Equipe", icon: UserCog },
      { href: "/admin/integracoes", label: "Integrações", icon: Plug },
      { href: "/admin/lixeira", label: "Lixeira", icon: Trash2 },
    ],
  },
];

/** Seções com só as abas que a pessoa pode ver (seção sem nenhuma some). */
export function secoesVisiveis(permissoes: Permissoes, superAdmin: boolean): Secao[] {
  return SECOES.map((s) => ({
    ...s,
    abas: s.abas.filter((i) => {
      if (i.soSuper) return superAdmin;
      if (i.todos) return true;
      const chave = i.perm ?? PERM_DA_TELA[i.href];
      return !!chave && permissoes[chave];
    }),
  })).filter((s) => s.abas.length > 0);
}

/** A tela `href` está aberta (ela mesma ou uma página dentro dela)? */
export function rotaAtiva(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}
