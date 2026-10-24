"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { ArrowUpRight, Check, ChevronDown, Loader2, RefreshCw, X } from "lucide-react";
import { executarAcaoAction, gerenteAction, rascunhoRespostaAction, type PedidoAcao } from "@/app/admin/painel/actions";
import type { AcaoGerente, Gerente } from "@/lib/painel/gerente";
import { usePainel } from "./contexto";

// O "gerente": varredura do sistema no período, em texto corrido por seção,
// com a sugestão e o mini-botão junto de cada ponto. Nada é feito sem passar
// pela confirmação (onde dá para editar data, texto, pessoas…).

const CHAVE_FECHADO = "mc:painel-gerente-fechado";
const COR = { alta: "bg-status-danger", media: "bg-status-pending", baixa: "bg-border-strong" } as const;

function saudacao() {
  const h = Number(new Date().toLocaleString("en-US", { timeZone: "America/Bahia", hour: "2-digit", hour12: false })) % 24;
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}
function lerFechado() {
  try {
    return localStorage.getItem(CHAVE_FECHADO) === "1";
  } catch {
    return false;
  }
}
const ouvintes = new Set<() => void>();
const assinar = (cb: () => void) => {
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
};
const paraBahia = (iso: string) => {
  const d = new Date(iso);
  return { dia: d.toLocaleDateString("en-CA", { timeZone: "America/Bahia" }), hora: d.toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" }) };
};
const quandoBr = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`).toLocaleString("pt-BR", { timeZone: "America/Bahia", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/* ───────── confirmação de cada ação ───────── */

function Confirmar({ acao, fechar, feito }: { acao: Exclude<AcaoGerente, { tipo: "abrir" }>; fechar: () => void; feito: (msg: string) => void }) {
  const { responsaveis } = usePainel();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  // campos editáveis (cada tipo usa os seus)
  const ini = acao.tipo === "marcar_reuniao" ? paraBahia(acao.inicio) : { dia: "", hora: "" };
  const [dia, setDia] = useState(acao.tipo === "mover_prazos" ? acao.novaData : ini.dia);
  const [hora, setHora] = useState(ini.hora);
  const [duracao, setDuracao] = useState(60);
  const [titulo, setTitulo] = useState(acao.tipo === "marcar_reuniao" || acao.tipo === "alertar" ? acao.titulo : "");
  const [respId, setRespId] = useState(acao.tipo === "marcar_reuniao" ? acao.responsavelId ?? "" : "");
  const [enviar, setEnviar] = useState(acao.tipo === "marcar_reuniao" ? !!acao.destino : true);
  const [texto, setTexto] = useState(acao.tipo === "marcar_reuniao" ? acao.mensagem : acao.tipo === "alertar" ? acao.corpo : acao.tipo === "responder" ? acao.texto ?? "" : "");
  const [textoMexido, setTextoMexido] = useState(false);
  const [marcados, setMarcados] = useState<string[]>(
    acao.tipo === "mover_prazos" ? acao.itens.map((i) => i.id) : acao.tipo === "alertar" ? acao.pessoas.map((p) => p.profileId) : acao.tipo === "lembrar_assinatura" ? acao.assinaturas.map((a) => a.id) : []
  );
  const [rascunhando, setRascunhando] = useState(acao.tipo === "responder" && !acao.texto);

  useEffect(() => {
    if (acao.tipo !== "responder" || acao.texto) return;
    let vivo = true;
    rascunhoRespostaAction(acao.chatJid).then((r) => {
      if (!vivo) return;
      setRascunhando(false);
      if (r.texto) setTexto(r.texto);
      else setErro(r.error ?? "Não consegui escrever o rascunho; escreva a mensagem.");
    });
    return () => {
      vivo = false;
    };
  }, [acao]);

  // reunião: a mensagem acompanha a data/hora enquanto ninguém editou o texto
  const mudarQuando = (d: string, h: string) => {
    setDia(d);
    setHora(h);
    if (acao.tipo === "marcar_reuniao" && !textoMexido && d && h)
      setTexto(`Olá! Aqui é do escritório MC Advogados. Para darmos andamento ao seu onboarding, deixamos pré-agendada uma reunião para ${quandoBr(d, h)}. Esse horário funciona para vocês? Se precisar, sugerimos outro.`);
  };
  const alterna = (id: string) => setMarcados((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  const pedido = (): PedidoAcao | null => {
    switch (acao.tipo) {
      case "marcar_reuniao":
        return { tipo: "marcar_reuniao", clienteId: acao.clienteId, titulo, inicio: new Date(`${dia}T${hora}:00-03:00`).toISOString(), duracaoMin: duracao, responsavelId: respId || null, mensagem: texto, destino: acao.destino, enviar: enviar && !!acao.destino };
      case "responder":
        return { tipo: "responder", chatJid: acao.chatJid, texto };
      case "alertar":
        return { tipo: "alertar", pessoas: acao.pessoas.filter((p) => marcados.includes(p.profileId)).map((p) => ({ profileId: p.profileId, telefone: p.telefone })), titulo, corpo: texto, url: acao.url, zap: enviar };
      case "concluir":
        return { tipo: "concluir", activityId: acao.activityId };
      case "mover_prazos":
        return { tipo: "mover_prazos", ids: marcados, novaData: dia };
      case "lembrar_assinatura":
        return { tipo: "lembrar_assinatura", ids: marcados };
      case "reatribuir":
        return { tipo: "reatribuir", activityId: acao.activityId, paraId: acao.paraId };
    }
  };
  const confirmar = () =>
    iniciar(async () => {
      setErro(null);
      const p = pedido();
      if (!p) return;
      const r = await executarAcaoAction(p);
      if (r.error) setErro(r.error);
      else feito(r.ok ?? "Feito.");
    });

  const rot = "mb-1 block text-xs font-medium text-muted";
  const titulos: Record<string, string> = {
    marcar_reuniao: "Marcar reunião",
    responder: `Responder ${acao.tipo === "responder" ? acao.clienteNome : ""}`,
    alertar: "Enviar alerta",
    concluir: "Concluir atividade",
    mover_prazos: "Mudar datas",
    lembrar_assinatura: "Lembrar assinatura",
    reatribuir: "Passar atividade",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={titulos[acao.tipo]} onClick={fechar}>
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-surface p-5 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <p className="text-base font-semibold text-foreground">{titulos[acao.tipo]}</p>
          <button type="button" className="icon-btn" onClick={fechar} aria-label="Fechar">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="space-y-3 text-sm">
          {acao.tipo === "marcar_reuniao" && (
            <>
              <p className="text-muted">
                Cliente: <b className="text-foreground">{acao.clienteNome}</b>
              </p>
              <label className="block">
                <span className={rot}>Título</span>
                <input className="ui-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <span className={rot}>Dia</span>
                  <input type="date" className="ui-input" value={dia} onChange={(e) => mudarQuando(e.target.value, hora)} />
                </label>
                <label className="block">
                  <span className={rot}>Hora</span>
                  <input type="time" className="ui-input" value={hora} onChange={(e) => mudarQuando(dia, e.target.value)} />
                </label>
                <label className="block">
                  <span className={rot}>Duração</span>
                  <select className="ui-input" value={duracao} onChange={(e) => setDuracao(Number(e.target.value))}>
                    {[30, 45, 60, 90].map((m) => (
                      <option key={m} value={m}>
                        {m} min
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className={rot}>Quem participa</span>
                <select className="ui-input" value={respId} onChange={(e) => setRespId(e.target.value)}>
                  <option value="">Ninguém definido</option>
                  {responsaveis.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-muted">Horário sugerido: o primeiro livre na agenda de quem cuida do cliente. O cliente recebe os lembretes automáticos de 24 h e 1 h antes.</p>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={enviar && !!acao.destino} disabled={!acao.destino} onChange={(e) => setEnviar(e.target.checked)} />
                <span>{acao.destino ? `Mandar mensagem agora em "${acao.destinoNome}"` : "Cliente sem WhatsApp vinculado: a mensagem não será enviada"}</span>
              </label>
              {enviar && acao.destino && (
                <textarea
                  className="ui-input min-h-28"
                  value={texto}
                  onChange={(e) => {
                    setTexto(e.target.value);
                    setTextoMexido(true);
                  }}
                />
              )}
            </>
          )}

          {acao.tipo === "responder" && (
            <>
              {acao.ultima && (
                <div className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
                  <span className="font-medium text-foreground">Cliente:</span> {acao.ultima}
                </div>
              )}
              <label className="block">
                <span className={rot}>{rascunhando ? "Escrevendo uma sugestão de resposta…" : "Mensagem (edite antes de enviar)"}</span>
                <textarea className="ui-input min-h-32" value={texto} disabled={rascunhando} onChange={(e) => setTexto(e.target.value)} />
              </label>
              <p className="text-xs text-muted">Sai pelo número do escritório e conta como resposta sua.</p>
            </>
          )}

          {acao.tipo === "alertar" && (
            <>
              <div>
                <span className={rot}>Para</span>
                <div className="flex flex-wrap gap-2">
                  {acao.pessoas.map((p) => (
                    <label key={p.profileId} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs">
                      <input type="checkbox" checked={marcados.includes(p.profileId)} onChange={() => alterna(p.profileId)} /> {p.nome}
                    </label>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className={rot}>Título</span>
                <input className="ui-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
              </label>
              <label className="block">
                <span className={rot}>Mensagem</span>
                <textarea className="ui-input min-h-24" value={texto} onChange={(e) => setTexto(e.target.value)} />
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={enviar} onChange={(e) => setEnviar(e.target.checked)} />
                <span>Também mandar no WhatsApp de cada um (além do aviso no portal)</span>
              </label>
            </>
          )}

          {acao.tipo === "concluir" && <p>Marcar &quot;{acao.titulo}&quot; como concluída agora?</p>}

          {acao.tipo === "reatribuir" && <p>Passar a atividade para {acao.paraNome}? A pessoa recebe o aviso de que virou responsável.</p>}

          {acao.tipo === "mover_prazos" && (
            <>
              <ul className="space-y-1.5">
                {acao.itens.map((i) => (
                  <li key={i.id}>
                    <label className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" checked={marcados.includes(i.id)} onChange={() => alterna(i.id)} />
                      <span>
                        {i.titulo} <span className="text-xs text-muted">(hoje: {i.prazo.split("-").reverse().join("/")})</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <label className="block">
                <span className={rot}>Nova data</span>
                <input type="date" className="ui-input" value={dia} onChange={(e) => setDia(e.target.value)} />
              </label>
            </>
          )}

          {acao.tipo === "lembrar_assinatura" && (
            <>
              <p>
                Reenviar pelo WhatsApp o link de assinatura da ata &quot;{acao.ataTitulo}&quot; para:
              </p>
              <ul className="space-y-1.5">
                {acao.assinaturas.map((a) => (
                  <li key={a.id}>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={marcados.includes(a.id)} onChange={() => alterna(a.id)} /> {a.nome}
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {erro && <p className="mt-3 text-sm text-status-danger">{erro}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="ui-btn-secondary px-3 py-2 text-sm" onClick={fechar}>
            Cancelar
          </button>
          <button type="button" className="ui-btn px-4 py-2 text-sm" disabled={pendente || rascunhando} onClick={confirmar}>
            {pendente ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniBotao({ acao, chave, feitos, abrir }: { acao: AcaoGerente; chave: string; feitos: Record<string, string>; abrir: (a: AcaoGerente, k: string) => void }) {
  if (acao.tipo === "abrir")
    return (
      <Link href={acao.href} className="ml-1 inline-flex items-center gap-0.5 whitespace-nowrap rounded-full border border-border px-2 py-0.5 align-middle text-[11px] font-medium text-foreground transition-colors hover:border-border-strong">
        {acao.rotulo}
        <ArrowUpRight className="h-3 w-3" aria-hidden />
      </Link>
    );
  if (feitos[chave])
    return (
      <span className="ml-1 inline-flex items-center gap-0.5 whitespace-nowrap rounded-full bg-status-success-bg px-2 py-0.5 align-middle text-[11px] font-medium text-status-success" title={feitos[chave]}>
        <Check className="h-3 w-3" aria-hidden /> feito
      </span>
    );
  return (
    <button type="button" onClick={() => abrir(acao, chave)} className="ml-1 inline-flex items-center whitespace-nowrap rounded-full bg-navy px-2 py-0.5 align-middle text-[11px] font-medium text-white transition-colors hover:bg-navy-3">
      {acao.rotulo}
    </button>
  );
}

export function GerentePainel({ periodoId, nome }: { periodoId: string; nome: string }) {
  const [res, setRes] = useState<{ periodoId: string; gerente?: Gerente; error?: string } | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [aberta, setAberta] = useState<{ acao: Exclude<AcaoGerente, { tipo: "abrir" }>; chave: string } | null>(null);
  const [feitos, setFeitos] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const fechado = useSyncExternalStore(assinar, lerFechado, () => false);
  const ola = saudacao();

  useEffect(() => {
    let vivo = true;
    gerenteAction(periodoId).then((r) => {
      if (vivo) setRes({ periodoId, ...r });
    });
    return () => {
      vivo = false;
    };
  }, [periodoId]);

  const atual = res?.periodoId === periodoId ? res : null;
  const dados = atual?.gerente ?? null;
  const erro = atual?.error ?? null;
  const carregando = !atual || atualizando;
  const atualizar = () => {
    setAtualizando(true);
    gerenteAction(periodoId, true).then((r) => {
      setAtualizando(false);
      setRes((v) => ({ periodoId, gerente: r.gerente ?? v?.gerente, error: r.gerente ? undefined : r.error ?? "Não foi possível atualizar." }));
    });
  };
  const alternar = () => {
    try {
      localStorage.setItem(CHAVE_FECHADO, fechado ? "0" : "1");
    } catch {}
    ouvintes.forEach((cb) => cb());
  };

  return (
    <section className="ui-card overflow-hidden" aria-label="Varredura do gerente">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-2/60 px-5 py-4">
        <div className="min-w-0">
          <p className="text-lg font-semibold text-foreground">
            {ola}, {nome}.
          </p>
          <p className="text-sm text-muted">
            {dados ? `Varredura do sistema · ${dados.periodo.toLowerCase()} · ${dados.pontos} ponto(s) de atenção` : "Passando o scanner no sistema…"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {dados && (
            <span className="hidden text-[11px] text-muted sm:inline">
              atualizado {new Date(dados.geradoEm).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button type="button" onClick={atualizar} disabled={carregando} className="icon-btn" aria-label="Atualizar varredura" title="Atualizar (refaz se tiver mais de 10 min)">
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} aria-hidden />
          </button>
          <button type="button" onClick={alternar} className="icon-btn" aria-label={fechado ? "Mostrar varredura" : "Recolher varredura"} aria-expanded={!fechado}>
            <ChevronDown className={`h-4 w-4 transition-transform ${fechado ? "-rotate-90" : ""}`} aria-hidden />
          </button>
        </div>
      </div>

      {!fechado && (
        <div className="p-5">
          {aviso && (
            <p className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-status-success-bg px-3 py-2 text-sm text-status-success">
              <span>{aviso}</span>
              <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </p>
          )}
          {carregando && !dados ? (
            <div className="space-y-2" aria-busy>
              {[100, 94, 97, 60, 0, 88, 92, 70].map((w, k) => (w ? <div key={k} className="skeleton h-3.5 rounded" style={{ width: `${w}%` }} /> : <div key={k} className="h-3" />))}
            </div>
          ) : erro && !dados ? (
            <p className="text-sm text-status-danger">{erro}</p>
          ) : dados ? (
            <div className="space-y-6">
              <div className="space-y-1.5 text-[15px] leading-relaxed text-foreground">
                {dados.abertura.map((t, k) => (
                  <p key={k}>{t}</p>
                ))}
              </div>
              {dados.secoes.length === 0 && <p className="text-sm text-muted">Nada pedindo atenção agora.</p>}
              <div className="grid grid-cols-1 gap-x-8 gap-y-6 xl:grid-cols-2">
                {dados.secoes.map((s) => (
                  <div key={s.id} className="min-w-0">
                    <p className="mb-2 flex items-center gap-2 border-b border-border pb-1.5 text-sm font-semibold text-foreground">
                      {s.titulo}
                      <span className="rounded-full bg-surface-2 px-1.5 text-[11px] font-medium tabular-nums text-muted">{s.pontos}</span>
                    </p>
                    <ul className="space-y-2.5">
                      {s.frases.map((f, k) => (
                        <li key={k} className="flex gap-2.5 text-sm leading-relaxed text-foreground">
                          <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${COR[f.prioridade ?? "baixa"]}`} title={f.prioridade ? `Prioridade ${f.prioridade}` : undefined} />
                          <p className="min-w-0">
                            {f.texto}
                            {f.acoes.map((a, j) => (
                              <MiniBotao key={j} acao={a} chave={`${s.id}-${k}-${j}`} feitos={feitos} abrir={(acao, chave) => acao.tipo !== "abrir" && setAberta({ acao, chave })} />
                            ))}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {aberta && (
        <Confirmar
          key={aberta.chave}
          acao={aberta.acao}
          fechar={() => setAberta(null)}
          feito={(msg) => {
            setFeitos((v) => ({ ...v, [aberta.chave]: msg }));
            setAviso(msg);
            setAberta(null);
          }}
        />
      )}
    </section>
  );
}
