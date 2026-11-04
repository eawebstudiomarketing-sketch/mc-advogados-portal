"use client";

import { useEffect, useState, useTransition } from "react";
import { BellRing, Check, FileWarning, Loader2, Pause, Pencil, Play, Plus, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import {
  carregarCobrancaAction,
  clientesParaVincularAction,
  cobrarAgoraAction,
  documentoRecebidoAction,
  gerarMensagemCobrancaAction,
  pausarCobrancaAction,
  salvarCobrancaAction,
  type TelaCobranca,
} from "@/app/admin/activities/cobranca-actions";

// Cobrança de documento dentro da atividade (03/11/2026): liga a cobrança
// automática no WhatsApp do cliente até o documento chegar.

const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const lista = (d: string[]) => (d.length <= 1 ? d.join("") : `${d.slice(0, -1).join(", ")} e ${d[d.length - 1]}`);
const previa = (texto: string, cliente: string, titulo: string, docs: string[]) =>
  texto.replaceAll("{cliente}", cliente.trim()).replaceAll("{titulo}", titulo).replaceAll("{documentos}", lista(docs) || "…");

type Form = { clienteId: string; documentos: string[]; mensagem: string; destino: "auto" | "grupo" | "numero"; intervaloDias: number };

export function CobrancaDocumento({ atividadeId }: { atividadeId: string }) {
  const [tela, setTela] = useState<TelaCobranca | null | undefined>(undefined);
  const [form, setForm] = useState<Form | null>(null);
  const [pending, start] = useTransition();

  const recarregar = () => carregarCobrancaAction(atividadeId).then(setTela).catch(() => setTela(null));
  useEffect(() => {
    let vivo = true;
    void carregarCobrancaAction(atividadeId)
      .then((t) => vivo && setTela(t))
      .catch(() => vivo && setTela(null));
    return () => {
      vivo = false;
    };
  }, [atividadeId]);

  if (tela === undefined)
    return (
      <div className="mt-5 flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cobrança de documento…
      </div>
    );
  if (tela === null) return null;
  const c = tela.cobranca;
  const encerrada = tela.atividade.status === "concluida" || tela.atividade.status === "cancelada";

  function abrirForm() {
    setForm({
      clienteId: tela!.atividade.clienteId ?? "",
      documentos: c?.documentos ?? [],
      mensagem: c?.mensagem ?? tela!.config.mensagem,
      destino: c?.destino ?? "auto",
      intervaloDias: c?.intervalo_dias ?? tela!.config.intervaloDias,
    });
  }
  function acao(f: () => Promise<{ ok: boolean; erro?: string; rotulo?: string }>, sucesso: string | ((r: { rotulo?: string }) => string)) {
    start(async () => {
      const r = await f();
      if (!r.ok) return void toast.error(r.erro ?? "Não foi possível.");
      toast.success(typeof sucesso === "string" ? sucesso : sucesso(r));
      await recarregar();
    });
  }

  if (form)
    return (
      <FormCobranca
        tela={tela}
        form={form}
        setForm={setForm}
        pending={pending}
        onCancelar={() => setForm(null)}
        onSalvar={() =>
          start(async () => {
            const r = await salvarCobrancaAction({ activityId: atividadeId, ...form });
            if (!r.ok) return void toast.error(r.erro);
            toast.success(c ? "Cobrança atualizada." : "Cobrança ligada: a 1ª mensagem sai no próximo horário de cobrar.");
            setForm(null);
            await recarregar();
          })
        }
      />
    );

  if (!c)
    return encerrada ? null : (
      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border-strong px-4 py-3">
        <FileWarning className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <p className="min-w-0 flex-1 text-sm text-muted">Depende de documento do cliente? O portal cobra no WhatsApp de tempos em tempos até chegar.</p>
        <button type="button" onClick={abrirForm} className="ui-btn-secondary px-3 py-1.5 text-xs">
          <BellRing className="h-3.5 w-3.5" aria-hidden /> Cobrar documento
        </button>
      </div>
    );

  const situacao = c.recebido_em ? "recebido" : c.ativa ? "ativa" : "pausada";
  return (
    <div className="mt-5 rounded-xl border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <BellRing className="h-4 w-4 text-muted" aria-hidden /> Cobrança de documento
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
              situacao === "recebido" ? "bg-status-success-bg text-status-success" : situacao === "ativa" ? "bg-status-info-bg text-status-info" : "bg-surface-2 text-muted"
            }`}
          >
            {situacao === "recebido" ? "Recebido" : situacao === "ativa" ? "Cobrando" : "Pausada"}
          </span>
        </p>
        <button type="button" onClick={abrirForm} className="icon-btn" aria-label="Editar cobrança" data-tip="Editar">
          <Pencil aria-hidden />
        </button>
      </div>
      <div className="space-y-2 px-4 py-3 text-sm">
        <ul className="flex flex-wrap gap-1.5">
          {c.documentos.map((d) => {
            const ok = c.recebidos.includes(d) || !!c.recebido_em;
            return (
              <li key={d} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${ok ? "bg-status-success-bg text-status-success" : "bg-surface-2 text-foreground"}`}>
                {ok && <Check className="h-3 w-3" aria-hidden />} {d}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted">
          {c.envios} {c.envios === 1 ? "cobrança enviada" : "cobranças enviadas"} · última {dataHora(c.ultima_em)}
          {situacao === "ativa" && <> · próxima {dataHora(c.proxima_em)}</>} · a cada {c.intervalo_dias} dia(s) útil(eis) · {c.destinoRotulo ?? "sem WhatsApp vinculado"}
        </p>
        {c.equipe_avisada_em && situacao !== "recebido" && <p className="text-xs font-medium text-status-danger">Passou de {tela.config.avisarApos} cobranças sem resposta: a equipe foi avisada. Vale ligar para o cliente.</p>}
        <p className="text-xs text-muted">O cliente pode mandar pelo portal (o documento com o mesmo nome marca sozinho) ou pelo WhatsApp: aí marque “Documento recebido”.</p>
        {situacao !== "recebido" && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" disabled={pending || encerrada} onClick={() => acao(() => cobrarAgoraAction(atividadeId), (r) => `Cobrança na fila para ${r.rotulo}.`)} className="ui-btn px-3 py-1.5 text-xs">
              <Send className="h-3.5 w-3.5" aria-hidden /> Cobrar agora
            </button>
            <button type="button" disabled={pending} onClick={() => acao(() => documentoRecebidoAction(atividadeId), "Documento recebido: a cobrança parou.")} className="ui-btn-secondary px-3 py-1.5 text-xs">
              <Check className="h-3.5 w-3.5" aria-hidden /> Documento recebido
            </button>
            <button
              type="button"
              disabled={pending || encerrada}
              onClick={() => acao(() => pausarCobrancaAction(atividadeId, !c.ativa), c.ativa ? "Cobrança pausada." : "Cobrança retomada.")}
              className="ui-btn-secondary px-3 py-1.5 text-xs"
            >
              {c.ativa ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />} {c.ativa ? "Pausar" : "Retomar"}
            </button>
          </div>
        )}
        {situacao === "recebido" && (
          <button type="button" disabled={pending || encerrada} onClick={() => acao(() => pausarCobrancaAction(atividadeId, true), "Cobrança reaberta.")} className="ui-link text-xs">
            Ainda falta algo? Voltar a cobrar
          </button>
        )}
      </div>
    </div>
  );
}

function FormCobranca({
  tela,
  form,
  setForm,
  pending,
  onCancelar,
  onSalvar,
}: {
  tela: TelaCobranca;
  form: Form;
  setForm: (f: Form) => void;
  pending: boolean;
  onCancelar: () => void;
  onSalvar: () => void;
}) {
  const [novoDoc, setNovoDoc] = useState("");
  const [clientes, setClientes] = useState<{ id: string; name: string }[] | null>(null);
  const [pedidoIa, setPedidoIa] = useState("");
  const [gerando, startIa] = useTransition();
  const semCliente = !tela.atividade.clienteId;
  useEffect(() => {
    if (semCliente) void clientesParaVincularAction().then(setClientes);
  }, [semCliente]);

  const nomeCliente = semCliente ? (clientes?.find((x) => x.id === form.clienteId)?.name ?? "") : tela.atividade.saudacao;
  function incluirDoc() {
    const t = novoDoc.trim();
    if (!t) return;
    setNovoDoc("");
    if (!form.documentos.includes(t)) setForm({ ...form, documentos: [...form.documentos, t.slice(0, 120)] });
  }
  function gerar() {
    startIa(async () => {
      const r = await gerarMensagemCobrancaAction({ titulo: tela.atividade.titulo, documentos: form.documentos, pedido: pedidoIa });
      if (!r.ok || !r.mensagem) return void toast.error(r.erro ?? "A IA não conseguiu escrever agora.");
      setForm({ ...form, mensagem: r.mensagem });
    });
  }
  const opcoesDestino: { v: Form["destino"]; rotulo: string; detalhe: string | null }[] = [
    { v: "auto", rotulo: "Automático", detalhe: tela.destinos.auto },
    { v: "grupo", rotulo: "Grupo do cliente", detalhe: tela.destinos.grupo },
    { v: "numero", rotulo: "Número do cliente", detalhe: tela.destinos.numero },
  ];

  return (
    <div className="mt-5 rounded-xl border border-navy/25 bg-navy/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <BellRing className="h-4 w-4 text-muted" aria-hidden /> Cobrar documento do cliente
        </p>
        <button type="button" onClick={onCancelar} className="icon-btn" aria-label="Cancelar">
          <X aria-hidden />
        </button>
      </div>

      <div className="space-y-3 text-sm">
        {semCliente && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Vincular a atividade ao cliente</span>
            <select value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })} className="ui-input text-sm" disabled={!clientes}>
              <option value="">{clientes ? "Escolha o cliente…" : "Carregando…"}</option>
              {(clientes ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div>
          <span className="mb-1 block text-xs font-medium text-muted">Documentos que faltam</span>
          {form.documentos.length > 0 && (
            <ul className="mb-1.5 flex flex-wrap gap-1.5">
              {form.documentos.map((d) => (
                <li key={d} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pr-1 pl-2 text-xs text-foreground">
                  {d}
                  <button type="button" onClick={() => setForm({ ...form, documentos: form.documentos.filter((x) => x !== d) })} className="rounded-full p-0.5 hover:bg-surface" aria-label={`Tirar ${d}`}>
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              value={novoDoc}
              onChange={(e) => setNovoDoc(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  incluirDoc();
                }
              }}
              maxLength={120}
              placeholder="Ex.: RG, comprovante de residência (Enter para incluir)"
              className="ui-input min-w-0 flex-1 !py-1.5 text-sm"
              aria-label="Documento que falta"
            />
            <button type="button" onClick={incluirDoc} disabled={!novoDoc.trim()} className="ui-btn-secondary px-2.5 py-1 text-xs">
              <Plus className="h-3.5 w-3.5" aria-hidden /> Incluir
            </button>
          </div>
        </div>

        <fieldset>
          <legend className="mb-1 block text-xs font-medium text-muted">Por onde vai</legend>
          <div className="grid gap-1.5 sm:grid-cols-3">
            {opcoesDestino.map((o) => (
              <label
                key={o.v}
                className={`flex cursor-pointer flex-col rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${form.destino === o.v ? "border-navy-3 bg-surface" : "border-border hover:bg-hover"} ${!o.detalhe && !semCliente ? "opacity-50" : ""}`}
              >
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <input type="radio" name="destino-cobranca" checked={form.destino === o.v} onChange={() => setForm({ ...form, destino: o.v })} className="accent-navy" />
                  {o.rotulo}
                </span>
                <span className="truncate text-muted">{semCliente ? "depois de vincular" : (o.detalhe ?? "não tem")}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted">Cobrar a cada</span>
          <input
            type="number"
            min={1}
            max={30}
            value={form.intervaloDias}
            onChange={(e) => setForm({ ...form, intervaloDias: Number(e.target.value) || 1 })}
            className="ui-input !w-20 !py-1.5 text-sm"
          />
          <span className="text-xs text-muted">
            dia(s) útil(eis), das {tela.config.horaInicio}h às {tela.config.horaFim}h, até chegar.
          </span>
        </label>

        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted">Mensagem ({"{cliente}"}, {"{documentos}"} e {"{titulo}"} se preenchem sozinhos)</span>
          </div>
          <textarea value={form.mensagem} onChange={(e) => setForm({ ...form, mensagem: e.target.value })} rows={4} maxLength={2000} className="ui-input text-sm" aria-label="Mensagem da cobrança" />
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <input value={pedidoIa} onChange={(e) => setPedidoIa(e.target.value)} maxLength={300} placeholder="Pedido para a IA (opcional): mais formal, lembrar do prazo…" className="ui-input min-w-0 flex-1 !py-1.5 text-xs" aria-label="Pedido para a IA" />
            <button type="button" onClick={gerar} disabled={gerando || !form.documentos.length} className="ui-btn-secondary px-3 py-1.5 text-xs">
              {gerando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />} Gerar com IA
            </button>
          </div>
          <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-xs whitespace-pre-wrap text-foreground/80">
            <span className="eyebrow mb-0.5 block">Como o cliente vai receber</span>
            {previa(form.mensagem, nomeCliente, tela.atividade.titulo, form.documentos)}
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancelar} className="ui-btn-secondary px-3 py-1.5 text-xs">
            Cancelar
          </button>
          <button type="button" onClick={onSalvar} disabled={pending || !form.documentos.length || (semCliente && !form.clienteId)} className="ui-btn px-3 py-1.5 text-xs">
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <BellRing className="h-3.5 w-3.5" aria-hidden />} {tela.cobranca ? "Salvar" : "Ligar a cobrança"}
          </button>
        </div>
      </div>
    </div>
  );
}
