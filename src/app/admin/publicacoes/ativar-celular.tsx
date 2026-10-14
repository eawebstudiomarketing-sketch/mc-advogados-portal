"use client";

import { useEffect, useState } from "react";
import { BellRing, BellOff, Send } from "lucide-react";
import { removerInscricaoPushAction, salvarInscricaoPushAction, testarPushAction } from "./actions";

// Liga/desliga o aviso de publicação nova neste aparelho (Web Push).
// iPhone: só funciona com o portal instalado na tela inicial (iOS 16.4+).

type Estado = "carregando" | "sem-suporte" | "iphone-instalar" | "negado" | "desligado" | "ligado";

function chaveParaBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const bruto = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(bruto.length));
  for (let i = 0; i < bruto.length; i++) out[i] = bruto.charCodeAt(i);
  return out;
}

const nomeDoAparelho = () => {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Computador (Windows)";
  if (/Mac/.test(ua)) return "Mac";
  return "Navegador";
};

export function AtivarCelular() {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    (async () => {
      const ios = /iPhone|iPad/.test(navigator.userAgent);
      const instalado = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setEstado(ios && !instalado ? "iphone-instalar" : "sem-suporte");
        return;
      }
      if (Notification.permission === "denied") return setEstado("negado");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const insc = await reg?.pushManager.getSubscription();
      setEstado(insc ? "ligado" : "desligado");
    })().catch(() => setEstado("sem-suporte"));
  }, []);

  const ligar = async () => {
    setOcupado(true);
    setMsg(null);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "negado" : "desligado");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const insc = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveParaBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""),
      });
      const json = insc.toJSON();
      const r = await salvarInscricaoPushAction({
        endpoint: insc.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        aparelho: nomeDoAparelho(),
      });
      if (!r.ok) throw new Error();
      setEstado("ligado");
      setMsg("Pronto: este aparelho vai avisar quando chegar publicação nova.");
    } catch {
      setMsg("Não deu para ativar neste aparelho. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  };

  const desligar = async () => {
    setOcupado(true);
    const reg = await navigator.serviceWorker.getRegistration("/");
    const insc = await reg?.pushManager.getSubscription();
    if (insc) {
      await removerInscricaoPushAction(insc.endpoint);
      await insc.unsubscribe();
    }
    setEstado("desligado");
    setMsg(null);
    setOcupado(false);
  };

  const testar = async () => {
    setOcupado(true);
    const r = await testarPushAction();
    setMsg(r.enviados ? "Aviso de teste enviado — deve aparecer em segundos." : "Nenhum aparelho recebeu. Desative e ative de novo.");
    setOcupado(false);
  };

  return (
    <div>
      <h2 className="section-title">Aviso no celular</h2>
      {estado === "carregando" && <p className="mt-1 text-xs text-muted">Verificando este aparelho…</p>}
      {estado === "sem-suporte" && <p className="mt-1 text-xs text-muted">Este navegador não aceita avisos. No celular, use o Chrome (Android) ou o portal instalado na tela inicial (iPhone).</p>}
      {estado === "iphone-instalar" && (
        <p className="mt-1 text-xs text-muted">
          No iPhone: abra o portal no Safari, toque em <strong>Compartilhar → Adicionar à Tela de Início</strong>, abra pelo ícone instalado, entre em Publicações e ative aqui.
        </p>
      )}
      {estado === "negado" && <p className="mt-1 text-xs text-status-danger">Os avisos foram bloqueados neste aparelho. Libere nas configurações do navegador/celular e recarregue.</p>}
      {(estado === "desligado" || estado === "ligado") && (
        <>
          <p className="mt-1 text-xs text-muted">
            {estado === "ligado" ? "Ligado neste aparelho: publicação nova chega como notificação." : "Receba uma notificação neste aparelho quando chegar publicação nova (além do e-mail)."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {estado === "desligado" ? (
              <button type="button" onClick={ligar} disabled={ocupado} className="ui-btn px-3 py-1.5 text-xs">
                <BellRing className="h-3.5 w-3.5" aria-hidden /> Ativar neste aparelho
              </button>
            ) : (
              <>
                <button type="button" onClick={testar} disabled={ocupado} className="ui-btn-secondary px-3 py-1.5 text-xs">
                  <Send className="h-3.5 w-3.5" aria-hidden /> Enviar teste
                </button>
                <button type="button" onClick={desligar} disabled={ocupado} className="ui-btn-secondary px-3 py-1.5 text-xs">
                  <BellOff className="h-3.5 w-3.5" aria-hidden /> Desativar
                </button>
              </>
            )}
          </div>
        </>
      )}
      {msg && <p className="mt-2 text-xs text-foreground/80">{msg}</p>}
    </div>
  );
}
