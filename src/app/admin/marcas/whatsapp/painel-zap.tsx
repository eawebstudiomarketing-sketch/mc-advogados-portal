"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Save, Search, Send, Trash2 } from "lucide-react";
import { modeloPara, montarMensagem, statusDaMensagem, type ConfigEnvio, type MarcaZap, type Modelo } from "@/lib/marcas/mensagem";
import { editarLinhaZapAction, enviarZapAction, excluirModeloAction, salvarEnvioConfigAction, salvarModeloAction } from "../actions";

// Aba WhatsApp das Marcas: envio (manual ou automático), modelos por status e
// a lista para disparar. Feita para ser simples de editar: cada campo salva
// sozinho ao sair dele, e a mensagem muda na hora quando o status muda.

const VARIAVEIS = ["{cliente}", "{marca}", "{processo}", "{status}", "{data}", "{despacho}", "{data_despacho}", "{classe}", "{proxima_etapa}"];
const dataBR = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

export function PainelZap({ marcas, modelos, config, status }: { marcas: MarcaZap[]; modelos: Modelo[]; config: ConfigEnvio; status: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aba, setAba] = useState<"lista" | "modelos">("lista");
  // o que a advogada mudou na tela (antes de recarregar do servidor)
  const [local, setLocal] = useState<Record<string, Partial<MarcaZap>>>({});
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [modo, setModo] = useState(config.envio_modo);
  const [dia, setDia] = useState(config.envio_dia);

  const linhas = useMemo(() => {
    const f = busca.trim().toLowerCase();
    return marcas
      .map((m) => ({ ...m, ...local[m.processo] }))
      .filter((m) => !f || [m.nome, m.processo, m.contato_nome, m.clients?.name, statusDaMensagem(m)].some((x) => x?.toLowerCase().includes(f)));
  }, [marcas, local, busca]);
  const mensagem = (m: MarcaZap) => textos[m.processo] ?? (modeloPara(statusDaMensagem(m), modelos) ? montarMensagem(m, modeloPara(statusDaMensagem(m), modelos)!.texto) : "");

  function salvarCampo(processo: string, campo: "status_mensagem" | "contato_nome" | "contato_numero", valor: string) {
    setLocal((l) => ({ ...l, [processo]: { ...l[processo], [campo]: valor } }));
    // status novo = mensagem do modelo novo (descarta o texto editado à mão)
    if (campo === "status_mensagem")
      setTextos((t) => {
        const n = { ...t };
        delete n[processo];
        return n;
      });
    start(async () => {
      const r = await editarLinhaZapAction(processo, campo, valor);
      if (!r.ok) toast.error(r.error);
    });
  }

  function enviar(processos: string[]) {
    if (!processos.length) return void toast.error("Selecione ao menos uma marca");
    if (processos.length > 1 && !window.confirm(`Enviar a mensagem no WhatsApp para ${processos.length} cliente(s)?`)) return;
    const editados = Object.fromEntries(processos.filter((p) => textos[p]).map((p) => [p, textos[p]]));
    start(async () => {
      const r = await enviarZapAction(processos, editados);
      if (!r.ok) return void toast.error(r.error);
      toast.success(`${r.enviados} mensagem(ns) na fila do WhatsApp`);
      if (r.erros.length) toast.error(`${r.erros.length} sem envio: ${r.erros.slice(0, 3).join(" · ")}`);
      setSel(new Set());
      router.refresh();
    });
  }

  const comNumero = linhas.filter((m) => (m.contato_numero ?? "").replace(/\D/g, "").length >= 10);

  return (
    <div className="space-y-5">
      <section className="ui-card p-5">
        <h2 className="section-title">Como enviar</h2>
        <div className="mt-3 flex flex-wrap items-center gap-5">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="modo" checked={modo === "manual"} onChange={() => setModo("manual")} className="h-4 w-4 accent-[var(--navy)]" />
            <span>
              <strong className="font-semibold">Manual</strong> · eu escolho e clico em “Enviar no Zap”
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="modo" checked={modo === "automatico"} onChange={() => setModo("automatico")} className="h-4 w-4 accent-[var(--navy)]" />
            <span>
              <strong className="font-semibold">Automático</strong> · todo mês, no dia
            </span>
          </label>
          <select value={dia} disabled={modo !== "automatico"} onChange={(e) => setDia(Number(e.target.value))} className="ui-input h-9 w-auto py-1" aria-label="Dia do mês">
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                dia {d}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || (modo === config.envio_modo && dia === config.envio_dia)}
            onClick={() =>
              start(async () => {
                const r = await salvarEnvioConfigAction(modo, dia);
                if (!r.ok) return void toast.error(r.error);
                toast.success(modo === "automatico" ? `Envio automático todo dia ${dia}, às 07h` : "Envio manual");
                router.refresh();
              })
            }
            className="ui-btn h-9"
          >
            <Save className="h-4 w-4" aria-hidden /> Salvar
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          No automático, às 07h do dia escolhido o portal manda para todas as marcas com número e com “Processual” ligado em Configurar.
          {config.ultimo_envio_auto ? ` Último envio automático: ${dataBR(config.ultimo_envio_auto)}.` : ""}
        </p>
      </section>

      <nav className="flex gap-5 border-b border-border" aria-label="WhatsApp das marcas">
        {([
          ["lista", "Enviar mensagens"],
          ["modelos", "Modelos por status"],
        ] as const).map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            onClick={() => setAba(id)}
            aria-current={aba === id ? "page" : undefined}
            className={`-mb-px border-b-2 px-1 pb-2.5 text-[15px] transition-colors ${aba === id ? "border-navy-3 font-medium text-foreground" : "border-transparent text-foreground/65 hover:text-foreground"}`}
          >
            {rotulo}
          </button>
        ))}
      </nav>

      {aba === "lista" ? (
        <section className="ui-card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <label className="relative mr-auto w-full sm:w-72">
              <span className="sr-only">Buscar</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar marca, cliente ou status" className="h-9 w-full rounded-full border border-border bg-surface pr-3 pl-9 text-[13px] focus:border-navy-3 focus:outline-none" />
            </label>
            {pending && <Loader2 className="h-4 w-4 animate-spin text-muted" aria-hidden />}
            <button type="button" disabled={pending || !sel.size} onClick={() => enviar([...sel])} className="ui-btn-secondary h-9">
              <Send className="h-4 w-4" aria-hidden /> Enviar selecionadas ({sel.size})
            </button>
            <button type="button" disabled={pending || !comNumero.length} onClick={() => enviar(comNumero.map((m) => m.processo))} className="ui-btn h-9">
              <Send className="h-4 w-4" aria-hidden /> Enviar todas ({comNumero.length})
            </button>
          </div>
          <ul className="divide-y divide-border">
            {linhas.length === 0 && <li className="p-6 text-center text-sm text-muted">Nenhuma marca na carteira.</li>}
            {linhas.map((m) => {
              const temNumero = (m.contato_numero ?? "").replace(/\D/g, "").length >= 10;
              return (
                <li key={m.processo} className="grid gap-3 px-4 py-4 lg:grid-cols-[24px_260px_1fr_auto]">
                  <input
                    type="checkbox"
                    disabled={!temNumero}
                    checked={sel.has(m.processo)}
                    onChange={(e) =>
                      setSel((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(m.processo);
                        else n.delete(m.processo);
                        return n;
                      })
                    }
                    aria-label={`Selecionar ${m.nome ?? m.processo}`}
                    className="mt-1 h-4 w-4 accent-[var(--navy)]"
                  />
                  <div className="min-w-0 space-y-1.5">
                    <Link href={`/admin/marcas/processos/${m.processo}`} className="block truncate text-sm font-semibold hover:underline">
                      {m.nome || m.apelido || "Marca figurativa"}
                    </Link>
                    <p className="font-mono text-xs text-muted">{m.processo}</p>
                    <input defaultValue={m.contato_nome ?? m.clients?.name ?? ""} onBlur={(e) => e.target.value !== (m.contato_nome ?? "") && salvarCampo(m.processo, "contato_nome", e.target.value)} placeholder="Nome do cliente" aria-label="Nome do cliente" className="ui-input h-8 py-1 text-xs" />
                    <input defaultValue={m.contato_numero ?? ""} onBlur={(e) => e.target.value !== (m.contato_numero ?? "") && salvarCampo(m.processo, "contato_numero", e.target.value)} placeholder="WhatsApp com DDD" inputMode="tel" aria-label="Número do WhatsApp" className={`ui-input h-8 py-1 text-xs ${temNumero ? "" : "border-status-pending"}`} />
                    <select value={statusDaMensagem(m)} onChange={(e) => salvarCampo(m.processo, "status_mensagem", e.target.value)} aria-label="Status da mensagem" className="ui-input h-8 py-1 text-xs">
                      {[...new Set([statusDaMensagem(m), ...status])].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <textarea
                      value={mensagem(m)}
                      onChange={(e) => setTextos((t) => ({ ...t, [m.processo]: e.target.value }))}
                      rows={5}
                      aria-label="Mensagem"
                      className="ui-input text-sm"
                    />
                    <p className="text-[11px] text-muted">
                      Modelo: {modeloPara(statusDaMensagem(m), modelos)?.status ?? "nenhum"}
                      {m.ultimo_envio ? ` · último envio ${dataBR(m.ultimo_envio)}` : " · nunca enviado"}
                      {textos[m.processo] ? " · texto editado à mão" : ""}
                    </p>
                  </div>
                  <div className="flex items-start">
                    <button type="button" disabled={pending || !temNumero} onClick={() => enviar([m.processo])} className="ui-btn h-9 whitespace-nowrap" title={temNumero ? "" : "Coloque o número do WhatsApp"}>
                      <Send className="h-4 w-4" aria-hidden /> Enviar no Zap
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <Modelos modelos={modelos} status={status} />
      )}
    </div>
  );
}

function Modelos({ modelos, status }: { modelos: Modelo[]; status: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [novo, setNovo] = useState("");
  const semModelo = status.filter((s) => !modelos.some((m) => m.status.toLowerCase() === s.toLowerCase()));

  function salvar(m: { id?: string; status: string; texto: string; ativo: boolean }) {
    start(async () => {
      const r = await salvarModeloAction(m);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Modelo salvo");
      setNovo("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Cada status tem a sua mensagem. Se não houver modelo para o status, vale o <strong>Padrão</strong>. Pode usar:{" "}
        {VARIAVEIS.map((v) => (
          <code key={v} className="mr-1 rounded bg-surface-2 px-1 text-xs">
            {v}
          </code>
        ))}
        <span className="block text-xs">{"{data}"} = o próximo prazo da marca (ou a data do último despacho, se não houver prazo).</span>
      </p>
      {modelos.map((m) => (
        <ModeloCartao key={`${m.id}-${m.texto.length}`} modelo={m} pending={pending} onSalvar={salvar} onExcluir={() => start(async () => { const r = await excluirModeloAction(m.id); if (!r.ok) toast.error(r.error); else { toast.success("Modelo excluído"); router.refresh(); } })} />
      ))}
      <section className="ui-card p-4">
        <h3 className="text-sm font-semibold">Novo modelo</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <input list="status-sem-modelo" value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Status (ex.: Aguardando exame de mérito)" className="ui-input min-w-0 flex-1" aria-label="Status do novo modelo" />
          <datalist id="status-sem-modelo">
            {semModelo.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <button type="button" disabled={pending || !novo.trim()} onClick={() => salvar({ status: novo, texto: "Olá, {cliente}! Atualização da sua marca *{marca}* (processo {processo}): {status}.\nMC Advogados", ativo: true })} className="ui-btn">
            <Plus className="h-4 w-4" aria-hidden /> Criar
          </button>
        </div>
      </section>
    </div>
  );
}

function ModeloCartao({ modelo, pending, onSalvar, onExcluir }: { modelo: Modelo; pending: boolean; onSalvar: (m: { id?: string; status: string; texto: string; ativo: boolean }) => void; onExcluir: () => void }) {
  const [status, setStatus] = useState(modelo.status);
  const [texto, setTexto] = useState(modelo.texto);
  const [ativo, setAtivo] = useState(modelo.ativo);
  const mudou = status !== modelo.status || texto !== modelo.texto || ativo !== modelo.ativo;
  return (
    <section className="ui-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={status} onChange={(e) => setStatus(e.target.value)} disabled={modelo.status === "Padrão"} aria-label="Status" className="ui-input h-9 min-w-0 flex-1 py-1 text-sm font-semibold" />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-4 w-4 accent-[var(--navy)]" /> Ativo
        </label>
        <button type="button" disabled={pending || !mudou} onClick={() => onSalvar({ id: modelo.id, status, texto, ativo })} className="ui-btn h-9">
          <Save className="h-4 w-4" aria-hidden /> Salvar
        </button>
        {modelo.status !== "Padrão" && (
          <button type="button" disabled={pending} onClick={() => window.confirm(`Excluir o modelo "${modelo.status}"?`) && onExcluir()} className="ui-btn-secondary h-9 text-status-danger" aria-label="Excluir modelo">
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} aria-label={`Mensagem para ${status}`} className="ui-input mt-2 text-sm" />
    </section>
  );
}
