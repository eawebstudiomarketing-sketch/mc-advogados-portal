"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, Loader2 } from "lucide-react";

// Botão de envio de um arquivo pelo cliente. Com `item`, responde a um
// documento pedido pelo escritório; sem, é um envio livre (pede um título).
export function EnvioDocumento({ item, rotulo = "Enviar", livre = false }: { item?: string; rotulo?: string; livre?: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [titulo, setTitulo] = useState("");

  async function enviar(file: File) {
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      if (item) fd.set("item", item);
      if (titulo.trim()) fd.set("titulo", titulo.trim());
      const res = await fetch("/api/cliente/documentos", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Não foi possível enviar.");
        return;
      }
      toast.success(item ? `${item} enviado` : "Documento enviado", { description: "O escritório foi avisado." });
      setTitulo("");
      router.refresh();
    } catch {
      toast.error("Falha de conexão ao enviar.");
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={livre ? "flex flex-col gap-2 sm:flex-row" : ""}>
      {livre && (
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Nome do documento (opcional)" aria-label="Nome do documento" className="ui-input sm:max-w-xs" />
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.xls,.xlsx,.txt"
        onChange={(e) => e.target.files?.[0] && void enviar(e.target.files[0])}
      />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={enviando} className={livre ? "ui-btn" : "ui-btn px-3 py-1.5 text-xs"}>
        {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Upload className="h-3.5 w-3.5" aria-hidden />}
        {enviando ? "Enviando…" : rotulo}
      </button>
    </div>
  );
}
