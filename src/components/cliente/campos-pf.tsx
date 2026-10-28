// Cadastro da pessoa física, com os mesmos campos do Astrea (aba "Cadastro" do
// contato): dados pessoais, documentos, contato e endereço, outros dados e
// conta bancária. Usado no cadastro e na edição do cliente PF.

import type { Client } from "@/lib/data/clients";
import { CampoCep } from "./campo-cep";

export type EnderecoPF = { cep?: string; logradouro?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; uf?: string };
export type ContaPF = { banco?: string; agencia?: string; conta?: string; pix?: string };

export const ESTADOS_CIVIS = ["Solteiro(a)", "Casado(a)", "União estável", "Divorciado(a)", "Separado(a)", "Viúvo(a)"];

function Campo({ nome, rotulo, valor, tipo = "text", meia = false, placeholder }: { nome: string; rotulo: string; valor?: string | null; tipo?: string; meia?: boolean; placeholder?: string }) {
  return (
    <div className={meia ? "" : "sm:col-span-2"}>
      <label htmlFor={nome} className="ui-label">
        {rotulo}
      </label>
      <input id={nome} name={nome} type={tipo} defaultValue={valor ?? ""} placeholder={placeholder} className="ui-input" />
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-border p-4">
      <legend className="px-1 text-sm font-medium text-foreground">{titulo}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function CamposPF({ c }: { c?: Partial<Client> }) {
  const end = (c?.endereco ?? {}) as EnderecoPF;
  const conta = (c?.conta_bancaria ?? {}) as ContaPF;
  return (
    <div className="space-y-5">
      <Grupo titulo="Dados pessoais">
        <Campo nome="apelido" rotulo="Apelido" valor={c?.apelido} meia />
        <Campo nome="nascimento" rotulo="Nascimento" valor={c?.nascimento} tipo="date" meia />
        <div>
          <label htmlFor="estado_civil" className="ui-label">
            Estado civil
          </label>
          <select id="estado_civil" name="estado_civil" defaultValue={c?.estado_civil ?? ""} className="ui-input">
            <option value="">—</option>
            {ESTADOS_CIVIS.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </div>
        <Campo nome="profissao" rotulo="Profissão / atividade econômica" valor={c?.profissao} meia />
      </Grupo>

      <Grupo titulo="Documentos">
        <Campo nome="rg" rotulo="RG" valor={c?.rg} meia />
        <Campo nome="ctps" rotulo="CTPS" valor={c?.ctps} meia />
        <Campo nome="pis" rotulo="PIS" valor={c?.pis} meia />
        <Campo nome="titulo_eleitor" rotulo="Título de eleitor" valor={c?.titulo_eleitor} meia />
        <Campo nome="cnh" rotulo="CNH" valor={c?.cnh} meia />
        <Campo nome="passaporte" rotulo="Passaporte" valor={c?.passaporte} meia />
        <Campo nome="reservista" rotulo="Certidão de reservista" valor={c?.reservista} meia />
      </Grupo>

      <Grupo titulo="Contato e endereço">
        <div className="sm:col-span-2">
          <label htmlFor="telefones" className="ui-label">
            Telefone(s)
          </label>
          <textarea id="telefones" name="telefones" rows={2} defaultValue={(c?.telefones ?? []).join("\n")} placeholder="(73) 99999-9999" className="ui-input" />
          <p className="mt-1 text-xs text-muted">Um por linha. O primeiro também liga a conversa do WhatsApp.</p>
        </div>
        <CampoCep valor={end.cep} meia />
        <Campo nome="end_cidade" rotulo="Cidade" valor={end.cidade} meia />
        <Campo nome="end_logradouro" rotulo="Rua / avenida" valor={end.logradouro} />
        <Campo nome="end_numero" rotulo="Número" valor={end.numero} meia />
        <Campo nome="end_complemento" rotulo="Complemento" valor={end.complemento} meia />
        <Campo nome="end_bairro" rotulo="Bairro" valor={end.bairro} meia />
        <Campo nome="end_uf" rotulo="UF" valor={end.uf} meia placeholder="BA" />
      </Grupo>

      <Grupo titulo="Outros dados">
        <Campo nome="nome_pai" rotulo="Nome do pai" valor={c?.nome_pai} meia />
        <Campo nome="nome_mae" rotulo="Nome da mãe" valor={c?.nome_mae} meia />
        <Campo nome="naturalidade" rotulo="Naturalidade" valor={c?.naturalidade} meia />
        <Campo nome="nacionalidade" rotulo="Nacionalidade" valor={c?.nacionalidade ?? "Brasileira"} meia />
        <div className="sm:col-span-2">
          <label htmlFor="comentarios" className="ui-label">
            Comentários
          </label>
          <textarea id="comentarios" name="comentarios" rows={3} defaultValue={c?.comentarios ?? ""} className="ui-input" />
        </div>
      </Grupo>

      <Grupo titulo="Conta bancária">
        <Campo nome="banco_nome" rotulo="Banco" valor={conta.banco} meia />
        <Campo nome="banco_agencia" rotulo="Agência" valor={conta.agencia} meia />
        <Campo nome="banco_conta" rotulo="Conta" valor={conta.conta} meia />
        <Campo nome="banco_pix" rotulo="Chave PIX" valor={conta.pix} meia />
      </Grupo>

      <Grupo titulo="Falecimento">
        <label className="flex items-center gap-2 text-sm text-foreground/80">
          <input type="checkbox" name="falecido" defaultChecked={!!c?.falecido} className="rounded border-border" />
          Contato falecido?
        </label>
        <Campo nome="data_obito" rotulo="Data do óbito" valor={c?.data_obito} tipo="date" meia />
      </Grupo>
    </div>
  );
}

const txt = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v || null;
};
const data = (f: FormData, k: string) => {
  const v = txt(f, k);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
};
const semVazios = <T extends Record<string, string | null>>(o: T) => {
  const r = Object.fromEntries(Object.entries(o).filter(([, v]) => v)) as Record<string, string>;
  return Object.keys(r).length ? r : null;
};

/** Lê os campos do cadastro PF do formulário (usado nas actions de criar/editar). */
export function lerCamposPF(f: FormData) {
  return {
    apelido: txt(f, "apelido"),
    nascimento: data(f, "nascimento"),
    estado_civil: txt(f, "estado_civil"),
    profissao: txt(f, "profissao"),
    rg: txt(f, "rg"),
    ctps: txt(f, "ctps"),
    pis: txt(f, "pis"),
    titulo_eleitor: txt(f, "titulo_eleitor"),
    cnh: txt(f, "cnh"),
    passaporte: txt(f, "passaporte"),
    reservista: txt(f, "reservista"),
    nome_pai: txt(f, "nome_pai"),
    nome_mae: txt(f, "nome_mae"),
    naturalidade: txt(f, "naturalidade"),
    nacionalidade: txt(f, "nacionalidade"),
    comentarios: txt(f, "comentarios"),
    telefones: [...new Set(String(f.get("telefones") ?? "").split(/\r?\n|;/).map((t) => t.trim()).filter((t) => t.replace(/\D/g, "").length >= 8))],
    endereco: semVazios({
      cep: txt(f, "end_cep"),
      logradouro: txt(f, "end_logradouro"),
      numero: txt(f, "end_numero"),
      complemento: txt(f, "end_complemento"),
      bairro: txt(f, "end_bairro"),
      cidade: txt(f, "end_cidade"),
      uf: txt(f, "end_uf")?.toUpperCase().slice(0, 2) ?? null,
    }),
    conta_bancaria: semVazios({ banco: txt(f, "banco_nome"), agencia: txt(f, "banco_agencia"), conta: txt(f, "banco_conta"), pix: txt(f, "banco_pix") }),
    falecido: f.get("falecido") === "on",
    data_obito: data(f, "data_obito"),
  };
}
