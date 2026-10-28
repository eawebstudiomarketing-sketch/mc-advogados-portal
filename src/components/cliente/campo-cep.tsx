"use client";

import { useState } from "react";

// Campo de CEP: ao completar os 8 dígitos busca o endereço no ViaCEP e
// preenche rua, bairro, cidade e UF do mesmo formulário (campos end_*). Número
// e complemento ficam por conta da pessoa. Se a busca falhar, nada é apagado.

type ViaCep = { logradouro?: string; bairro?: string; localidade?: string; uf?: string; erro?: boolean | string };

const mascara = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

function preencher(id: string, valor?: string) {
  if (!valor) return;
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.value = valor;
}

export function CampoCep({ valor, meia = false }: { valor?: string | null; meia?: boolean }) {
  const [cep, setCep] = useState(mascara(valor ?? ""));
  const [aviso, setAviso] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);

  async function buscar(digitos: string) {
    setBuscando(true);
    setAviso(null);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${digitos}/json/`);
      if (!r.ok) throw new Error();
      const d = (await r.json()) as ViaCep;
      if (d.erro) {
        setAviso("CEP não encontrado.");
        return;
      }
      preencher("end_logradouro", d.logradouro);
      preencher("end_bairro", d.bairro);
      preencher("end_cidade", d.localidade);
      preencher("end_uf", d.uf);
      (document.getElementById("end_numero") as HTMLInputElement | null)?.focus();
    } catch {
      setAviso("Não foi possível buscar o CEP agora. Preencha o endereço à mão.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className={meia ? "" : "sm:col-span-2"}>
      <label htmlFor="end_cep" className="ui-label">
        CEP
      </label>
      <input
        id="end_cep"
        name="end_cep"
        inputMode="numeric"
        autoComplete="postal-code"
        placeholder="00000-000"
        value={cep}
        onChange={(e) => {
          const v = mascara(e.target.value);
          setCep(v);
          setAviso(null);
          if (v.replace(/\D/g, "").length === 8) void buscar(v.replace(/\D/g, ""));
        }}
        className="ui-input"
      />
      {(buscando || aviso) && <p className={`mt-1 text-xs ${aviso ? "text-status-danger" : "text-muted"}`}>{buscando ? "Buscando endereço..." : aviso}</p>}
    </div>
  );
}
