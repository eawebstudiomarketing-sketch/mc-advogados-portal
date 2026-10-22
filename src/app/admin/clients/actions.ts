"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirPermissao, getPermissoes, requireRole } from "@/lib/dal";
import { destinoDeVolta } from "@/lib/voltar";
import { lerCamposWhatsapp } from "@/components/cliente/campos-whatsapp";
import { lerCamposPF } from "@/components/cliente/campos-pf";

/** PF: os telefones do cadastro também ligam a conversa do WhatsApp (números do cliente). */
function comZap(pf: ReturnType<typeof lerCamposPF>, numeros: string[]) {
  const tel = pf.telefones.map((t) => t.replace(/[^\d+]/g, "")).filter((t) => t.replace(/\D/g, "").length >= 10);
  return { ...pf, whatsapp_numeros: [...new Set([...numeros, ...tel])] };
}

export type CreateClientState = { error: string | null };

export async function createClientAction(
  _prevState: CreateClientState,
  formData: FormData
): Promise<CreateClientState> {
  // RLS já bloqueia advogado de escrever em `clients`, mas confirmar aqui
  // evita a viagem ao banco só pra receber o erro de permissão.
  // Qualquer pessoa da equipe cadastra; quem cadastra fica designado ao cliente
  // (gatilho no banco) e o admin pode tirar depois na Equipe.
  await requireRole(["admin", "advogado"]);
  const permissoes = (await getPermissoes())!;

  const name = formData.get("name");
  const tipoPessoa = formData.get("tipo_pessoa");
  const documento = formData.get("documento");
  const emailContact = formData.get("email_contact");
  if (typeof name !== "string" || !name.trim()) {
    return { error: "Informe o nome do cliente." };
  }
  if (tipoPessoa !== "PF" && tipoPessoa !== "PJ") {
    return { error: "Selecione o tipo de pessoa." };
  }
  // PJ: CNPJ e e-mail obrigatórios; PF: opcionais (muitos chegam só com o nome)
  if (tipoPessoa === "PJ" && (typeof documento !== "string" || !documento.trim())) {
    return { error: "Informe o CNPJ." };
  }
  if (tipoPessoa === "PJ" && (typeof emailContact !== "string" || !emailContact.trim())) {
    return { error: "Informe o e-mail de contato." };
  }
  if (tipoPessoa === "PF" && !permissoes.clientes_pf) {
    return { error: "Você não tem acesso a clientes pessoa física." };
  }

  // id gerado aqui e sem pedir a linha de volta: cliente criado por advogado
  // só fica visível para ele depois do gatilho que o designa (fim do comando)
  const id = crypto.randomUUID();
  const supabase = await createClient();
  const { error } = await supabase.from("clients").insert({
    id,
    name: name.trim(),
    tipo_pessoa: tipoPessoa,
    documento: String(documento ?? "").trim() || null,
    email_contact: String(emailContact ?? "").trim() || null,
    ...lerCamposWhatsapp(formData),
    ...(tipoPessoa === "PF" ? comZap(lerCamposPF(formData), lerCamposWhatsapp(formData).whatsapp_numeros) : {}),
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe um cliente cadastrado com esse CPF/CNPJ." };
    }
    return { error: "Não foi possível salvar o cliente. Tente novamente." };
  }

  revalidatePath("/admin/clients");
  revalidatePath("/admin");
  // próximo passo natural do cadastro: preencher a Ficha de Handoff
  redirect(
    permissoes.clientes && permissoes.ficha_handoff
      ? `/admin/clients/${id}/handoff`
      : permissoes.clientes
        ? `/admin/clients/${id}`
        : "/admin"
  );
}

export type UpdateClientState = { error: string | null };

export async function updateClientAction(
  _prevState: UpdateClientState,
  formData: FormData
): Promise<UpdateClientState> {
  await exigirPermissao("editar_cliente");

  const id = formData.get("id");
  const name = formData.get("name");
  const tipoPessoa = formData.get("tipo_pessoa");
  const documento = formData.get("documento");
  const emailContact = formData.get("email_contact");
  const active = formData.get("active") === "on";

  if (typeof id !== "string" || !id) {
    return { error: "Cliente inválido." };
  }
  if (typeof name !== "string" || !name.trim()) {
    return { error: "Informe o nome do cliente." };
  }
  if (tipoPessoa !== "PF" && tipoPessoa !== "PJ") {
    return { error: "Selecione o tipo de pessoa." };
  }
  // PJ: CNPJ e e-mail obrigatórios; PF: opcionais (muitos chegam só com o nome)
  if (tipoPessoa === "PJ" && (typeof documento !== "string" || !documento.trim())) {
    return { error: "Informe o CNPJ." };
  }
  if (tipoPessoa === "PJ" && (typeof emailContact !== "string" || !emailContact.trim())) {
    return { error: "Informe o e-mail de contato." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update({
      name: name.trim(),
      tipo_pessoa: tipoPessoa,
      documento: String(documento ?? "").trim() || null,
      email_contact: String(emailContact ?? "").trim() || null,
      active,
      ...lerCamposWhatsapp(formData),
      ...(tipoPessoa === "PF" ? comZap(lerCamposPF(formData), lerCamposWhatsapp(formData).whatsapp_numeros) : {}),
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe um cliente cadastrado com esse CPF/CNPJ." };
    }
    return { error: "Não foi possível salvar as alterações. Tente novamente." };
  }

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${id}`);
  redirect(destinoDeVolta(formData, `/admin/clients/${id}`));
}

export type SaveTriagemState = { error: string | null; savedAt: string | null };

// Triagem = informações gerais do cliente, em texto livre. É a base que a IA
// lê para gerar o onboarding personalizado e as demandas.
export async function saveTriagemAction(
  _prevState: SaveTriagemState,
  formData: FormData
): Promise<SaveTriagemState> {
  await exigirPermissao("ficha_handoff");

  const id = formData.get("client_id");
  if (typeof id !== "string" || !id) return { error: "Cliente inválido.", savedAt: null };
  const triagem = String(formData.get("triagem") ?? "").trim();
  const savedAt = new Date().toISOString();

  const supabase = await createClient();
  const { error } = await supabase
    .from("client_handoffs")
    .upsert({ client_id: id, triagem: triagem || null, triagem_updated_at: triagem ? savedAt : null }, { onConflict: "client_id" });
  if (error) return { error: "Não foi possível salvar a triagem. Tente novamente.", savedAt: null };

  revalidatePath(`/admin/clients/${id}`);
  return { error: null, savedAt };
}

export type DeleteClientState = { error: string | null };

// Exclui o cliente e, em cascata no banco, tudo dele (atividades, documentos,
// contratos, onboardings, demandas, lançamentos e o perfil de acesso ao
// portal). Os documentos passam pela lixeira (gatilho), e os arquivos no
// Storage/Drive não são apagados. Exige digitar o nome do cliente.
export async function deleteClientAction(
  _prevState: DeleteClientState,
  formData: FormData
): Promise<DeleteClientState> {
  await exigirPermissao("excluir");

  const id = formData.get("client_id");
  const confirmacao = String(formData.get("confirmacao") ?? "").trim();
  if (typeof id !== "string" || !id) return { error: "Cliente inválido." };

  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("name").eq("id", id).maybeSingle();
  if (!client) return { error: "Cliente não encontrado." };
  if (confirmacao.toLowerCase() !== client.name.trim().toLowerCase()) {
    return { error: "O nome digitado não confere com o nome do cliente." };
  }

  // o cascade apaga o perfil, mas o login (Auth) ficava solto e travava o e-mail
  const admin = createAdminClient();
  const { data: logins } = await admin.from("profiles").select("user_id").eq("client_id", id).eq("role", "client");

  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir o cliente. Tente novamente." };

  for (const l of logins ?? []) await admin.auth.admin.deleteUser(l.user_id);

  revalidatePath("/admin/clients");
  revalidatePath("/admin");
  redirect("/admin/clients");
}

export type SaveHandoffState = { error: string | null; savedAt: string | null };

// Ficha de Handoff (Comercial → Jurídico). Chega como JSON do formulário; só
// os campos conhecidos do modelo são guardados.
export async function saveHandoffAction(_prev: SaveHandoffState, formData: FormData): Promise<SaveHandoffState> {
  await exigirPermissao("ficha_handoff");
  const id = formData.get("client_id");
  if (typeof id !== "string" || !id) return { error: "Cliente inválido.", savedAt: null };

  let bruto: Record<string, unknown>;
  try {
    bruto = JSON.parse(String(formData.get("handoff") ?? "{}"));
  } catch {
    return { error: "Não foi possível ler a ficha. Tente de novo.", savedAt: null };
  }

  const { idsHandoff } = await import("@/lib/handoff-schema");
  const { data: cli } = await (await createClient()).from("clients").select("tipo_pessoa").eq("id", id).maybeSingle();
  const permitidos = idsHandoff(cli?.tipo_pessoa ?? "PJ");
  const limpo: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(bruto)) {
    if (!permitidos.has(k)) continue;
    if (Array.isArray(v)) {
      const lista = v.map(String).filter(Boolean);
      if (lista.length) limpo[k] = lista;
    } else if (typeof v === "string" && v.trim()) limpo[k] = v.trim();
  }

  const savedAt = new Date().toISOString();
  const supabase = await createClient();
  const { error } = await supabase
    .from("client_handoffs")
    .upsert({ client_id: id, handoff: limpo, handoff_updated_at: savedAt }, { onConflict: "client_id" });
  if (error) return { error: "Não foi possível salvar a ficha. Tente novamente.", savedAt: null };

  revalidatePath(`/admin/clients/${id}`);
  return { error: null, savedAt };
}

// Arquivar cliente: some das listas (e da busca), mas tudo dele fica guardado.
export async function toggleArchiveClientAction(formData: FormData): Promise<void> {
  await exigirPermissao("editar_cliente");
  const id = formData.get("client_id");
  if (typeof id !== "string" || !id) return;
  const arquivar = formData.get("arquivar") === "1";
  const supabase = await createClient();
  await supabase.from("clients").update({ archived_at: arquivar ? new Date().toISOString() : null }).eq("id", id);
  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${id}`);
  revalidatePath("/admin");
}
