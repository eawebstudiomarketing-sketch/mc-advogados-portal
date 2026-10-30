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
  Settings2,
  Sparkles,
  Trash2,
  UserCog,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { PERM_DA_TELA, type Permissoes } from "@/lib/permissoes";

export type NavItem = { href: string; label: string; icon: LucideIcon; todos?: boolean; soSuper?: boolean };
export type Secao = { id: string; label: string; icon: LucideIcon; abas: NavItem[] };

// Menu em seções (30/10/2026, redesenho da navegação): cada item do menu é uma
// seção, e as telas dela viram abas no topo da página (AbasSecao). As rotas
// continuam as mesmas; só muda como se chega nelas. Cada pessoa vê só as telas
// liberadas para ela (PERM_DA_TELA); o admin máximo vê tudo.
export const SECOES: Secao[] = [
  { id: "inicio", label: "Área de trabalho", icon: LayoutDashboard, abas: [{ href: "/admin", label: "Área de trabalho", icon: LayoutDashboard }] },
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
  { id: "distribuicao", label: "Distribuição", icon: Inbox, abas: [{ href: "/admin/distribuicao", label: "Distribuição", icon: Inbox }] },
  {
    id: "caixa",
    label: "Caixa de entrada",
    icon: Mail,
    abas: [
      { href: "/admin/alertas", label: "Alertas", icon: BellRing },
      { href: "/admin/publicacoes", label: "Publicações", icon: Newspaper },
      { href: "/admin/mensagens", label: "Mensagens", icon: MessagesSquare, todos: true },
    ],
  },
  {
    id: "contatos",
    label: "Contatos",
    icon: Users,
    abas: [
      { href: "/admin/clients", label: "Contatos", icon: Users },
      { href: "/admin/onboarding", label: "Onboarding", icon: ClipboardList },
    ],
  },
  { id: "processos", label: "Processos", icon: Gavel, abas: [{ href: "/admin/processes", label: "Processos e casos", icon: Gavel }] },
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
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle, abas: [{ href: "/admin/whatsapp", label: "WhatsApp", icon: MessageCircle }] },
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
      const chave = PERM_DA_TELA[i.href];
      return !!chave && permissoes[chave];
    }),
  })).filter((s) => s.abas.length > 0);
}

/** A tela `href` está aberta (ela mesma ou uma página dentro dela)? */
export function rotaAtiva(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}
