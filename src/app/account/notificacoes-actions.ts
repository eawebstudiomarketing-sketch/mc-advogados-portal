"use server";

import { ehSuperAdmin, requireProfile } from "@/lib/dal";
import { gravarPreferencia } from "@/lib/notificacoes";
import { FORMATOS, tipoPorId, type Canal, type Formato } from "@/lib/notificacoes-tipos";

// Cada pessoa mexe só nas próprias preferências de notificação.

export async function salvarPreferenciaAction(tipo: string, canal: Canal, ativo: boolean, formato: Formato): Promise<{ ok: true } | { ok: false; erro: string }> {
  const profile = await requireProfile();
  if (profile.role === "client") return { ok: false, erro: "Disponível só para a equipe." };
  const t = tipoPorId(tipo);
  if (!t || !t.canais.includes(canal) || !(formato in FORMATOS)) return { ok: false, erro: "Opção inválida." };
  if (t.soSuper && !ehSuperAdmin(profile)) return { ok: false, erro: "Você não recebe esse aviso." };
  try {
    await gravarPreferencia(profile.id, tipo, canal, !!ativo, formato);
    return { ok: true };
  } catch {
    return { ok: false, erro: "Não foi possível salvar. Tente de novo." };
  }
}
