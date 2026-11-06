"use client";

import { useRef, useState } from "react";
import { Download, FileText, Loader2, Lock, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { createClient as criarSupabase } from "@/lib/supabase/client";
import { linkAnexoAction, registrarAnexoAction, removerAnexoAction } from "@/app/admin/activities/anexo-actions";
import type { Anexo } from "@/lib/anexos-atividade";

// Anexar arquivos na atividade (06/11/2026): qualquer tipo, vários de uma vez,
// clicando ou arrastando. Com `activityId`, cada arquivo é anexado na hora. Sem
// ele (formulário de nova atividade), os arquivos sobem antes e vão no
// formulário (campo `anexos`) para entrar quando a atividade for criada.
// Por padrão ficam internos; "Mostrar ao cliente" só aparece se há cliente.

const LIMITE_MB = 50;
type Pendente = { caminho: string; nome: string; interno: boolean };

export function AnexosAtividade({
  activityId,
  temCliente,
  inicial = [],
}: {
  activityId: string | null;
  temCliente: boolean;
  inicial?: Anexo[];
}) {
  const [anexos, setAnexos] = useState<Anexo[]>(inicial);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [enviando, setEnviando] = useState<string[]>([]);
  const [mostrarCliente, setMostrarCliente] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const interno = !temCliente || !mostrarCliente;

  async function enviar(arquivos: FileList | File[]) {
    for (const file of Array.from(arquivos)) {
      if (file.size > LIMITE_MB * 1024 * 1024) {
        toast.error(`${file.name}: maior que ${LIMITE_MB} MB.`);
        continue;
      }
      setEnviando((xs) => [...xs, file.name]);
      try {
        const link = await linkAnexoAction(activityId, file.name, interno);
        if (!link.ok) throw new Error(link.error);
        const { error } = await criarSupabase().storage.from("documents").uploadToSignedUrl(link.caminho, link.token, file, { contentType: file.type || undefined });
        if (error) throw new Error("Falha ao enviar o arquivo.");
        if (activityId) {
          const r = await registrarAnexoAction(activityId, link.caminho, file.name, interno);
          if (!r.ok) throw new Error(r.error);
          setAnexos(r.anexos);
        } else {
          setPendentes((xs) => [...xs, { caminho: link.caminho, nome: file.name, interno }]);
        }
      } catch (e) {
        toast.error(`${file.name}: ${e instanceof Error ? e.message : "não foi possível anexar."}`);
      } finally {
        setEnviando((xs) => {
          const i = xs.indexOf(file.name);
          return i < 0 ? xs : [...xs.slice(0, i), ...xs.slice(i + 1)];
        });
      }
    }
    if (input.current) input.current.value = "";
  }

  async function remover(id: string, nome: string) {
    if (!activityId || !confirm(`Tirar o anexo "${nome}"?`)) return;
    const r = await removerAnexoAction(activityId, id);
    if (!r.ok) return void toast.error(r.error);
    setAnexos(r.anexos);
  }

  const vazio = !anexos.length && !pendentes.length && !enviando.length;
  return (
    <div className="space-y-2">
      {pendentes.map((p) => (
        <input key={p.caminho} type="hidden" name="anexos" value={JSON.stringify(p)} />
      ))}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          if (e.dataTransfer.files.length) void enviar(e.dataTransfer.files);
        }}
        className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed px-3 py-2.5 transition-colors ${arrastando ? "border-[var(--navy)] bg-hover" : "border-border"}`}
      >
        <button type="button" onClick={() => input.current?.click()} className="ui-btn-secondary px-3 py-1.5 text-xs">
          <Paperclip className="h-3.5 w-3.5" aria-hidden /> Anexar arquivo
        </button>
        <span className="text-xs text-muted">ou arraste aqui · qualquer tipo, até {LIMITE_MB} MB</span>
        {temCliente && (
          <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-foreground">
            <input type="checkbox" checked={mostrarCliente} onChange={(e) => setMostrarCliente(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--navy)]" /> Mostrar ao cliente no portal dele
          </label>
        )}
        <input ref={input} type="file" multiple className="sr-only" aria-label="Escolher arquivos para anexar" onChange={(e) => e.target.files?.length && void enviar(e.target.files)} />
      </div>

      {!vazio && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {anexos.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-3 py-2">
              <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm">{a.title}</span>
              {a.interno && (
                <span className="inline-flex items-center gap-1 text-xs text-muted" title="Só a equipe vê">
                  <Lock className="h-3 w-3" aria-hidden /> interno
                </span>
              )}
              {a.downloadUrl && (
                <a href={a.downloadUrl} target="_blank" rel="noreferrer" className="icon-btn" aria-label={`Abrir ${a.title}`} data-tip="Abrir">
                  <Download aria-hidden />
                </a>
              )}
              {activityId && (
                <button type="button" onClick={() => remover(a.id, a.title)} className="icon-btn" aria-label={`Tirar ${a.title}`} data-tip="Tirar anexo">
                  <X aria-hidden />
                </button>
              )}
            </li>
          ))}
          {pendentes.map((p) => (
            <li key={p.caminho} className="flex items-center gap-2 px-3 py-2">
              <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm">{p.nome}</span>
              <span className="text-xs text-muted">{p.interno ? "interno · " : ""}entra ao salvar</span>
              <button type="button" onClick={() => setPendentes((xs) => xs.filter((x) => x !== p))} className="icon-btn" aria-label={`Tirar ${p.nome}`} data-tip="Tirar">
                <X aria-hidden />
              </button>
            </li>
          ))}
          {enviando.map((n, i) => (
            <li key={`${n}-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> <span className="min-w-0 flex-1 truncate">{n}</span> enviando…
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
