// Isca 4 (19/11/2026): "Sua escala fecha na 5x2?". Pedido no grupo Sistemas e IA (13/11):
// "sistema simulação de escalas com a nova regra 5x2". Ideia inspirada no montador de escalas da
// Caixa de Ferramentas do Guia EB (engenharia reversa de 06/11), mas com motor e textos próprios.
//
// Regra usada (comunicado do Maurício de 12/11/2026, liminar do STF): a partir de 16/12/2026,
// escala 5x2 com duas folgas por semana e limite de 42 h semanais, sem redução de salário.
// Na transição (até 15/12/2027) dá para fazer 8h24 em cinco dias sem hora extra nos 24 min.
// Domingo: mulher folga pelo menos 1 domingo a cada 2 semanas (art. 386 da CLT); no comércio,
// homem folga pelo menos 1 domingo a cada 3 semanas (Lei 10.101/2000, art. 6º, parágrafo único).
// Tudo roda no navegador; nada é salvo.

export const INICIO_5X2 = "2026-12-16";
export const JORNADA_DIA = 8.4; // 8h24
export const HORAS_SEMANA = 42;
const INTERVALO = 1; // jornada acima de 6 h tem pelo menos 1 h de intervalo
const PRESENCA_MAX = JORNADA_DIA + INTERVALO; // 9h24 dentro da empresa

// a grade começa na primeira segunda-feira depois do início da regra
export const PRIMEIRO_DIA = "2026-12-21";
export const SEMANAS = 4;
export const NOMES_DIA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]; // índice 0 = segunda
const FERIADOS: Record<string, string> = { "2026-12-25": "Natal", "2027-01-01": "Ano-novo" };

export type EntradaEscala = {
  funcionarios: number;
  mulheres: number;
  abertos: boolean[]; // 7 posições, segunda a domingo
  abre: string; // "08:00"
  fecha: string; // "18:00"
  minimo: number; // pessoas que precisam trabalhar em cada dia aberto (somando os turnos)
};

export type Pessoa = { nome: string; sexo: "f" | "m" };
export type Dia = { data: string; semana: number; dow: number; aberto: boolean; feriado: string | null; precisa: number; trabalham: number };
export type Verificacao = { ok: boolean; texto: string };

export type ResultadoEscala = {
  nivel: "baixo" | "medio" | "alto";
  veredito: string;
  explicacao: string;
  horasLoja: number;
  turnos: number;
  porDia: number; // pessoas por dia de funcionamento
  precisaAgora: number; // mínimo de funcionários na 5x2
  precisaAntes: number; // mínimo na 6x1
  faltam: number;
  pessoas: Pessoa[];
  dias: Dia[];
  grade: boolean[][]; // [pessoa][dia]: true = trabalha
  verificacoes: Verificacao[];
  dicas: string[];
};

const horas = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) + (m || 0) / 60;
};
export const fmtHoras = (h: number) => {
  const t = Math.round(h * 60);
  const m = t % 60;
  return `${Math.floor(t / 60)}h${m ? String(m).padStart(2, "0") : ""}`;
};
const maisDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// gerador de números com semente: a mesma entrada dá sempre a mesma escala
function sorteio(semente: number) {
  let s = semente >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4_294_967_296;
  };
}

/** Monta a escala 5x2 de 4 semanas e confere as regras. */
export function montarEscala(e: EntradaEscala): ResultadoEscala {
  const n = Math.max(1, Math.min(40, Math.round(e.funcionarios)));
  const nf = Math.max(0, Math.min(n, Math.round(e.mulheres)));
  const minimo = Math.max(1, Math.round(e.minimo));
  const pessoas: Pessoa[] = Array.from({ length: n }, (_, i) => ({ nome: `Funcionário ${i + 1}`, sexo: i < nf ? "f" : "m" }));
  pessoas.forEach((p, i) => (p.nome = `${p.sexo === "f" ? "Funcionária" : "Funcionário"} ${i + 1}`));

  let horasLoja = horas(e.fecha) - horas(e.abre);
  if (horasLoja <= 0) horasLoja += 24;
  const turnos = horasLoja <= PRESENCA_MAX ? 1 : Math.ceil(horasLoja / PRESENCA_MAX);
  const porDia = minimo;
  const abertos = e.abertos.some(Boolean) ? e.abertos : [true, true, true, true, true, true, false];
  const nAbertos = abertos.filter(Boolean).length;
  const domingoAberto = abertos[6];

  // quantas pessoas a operação pede: dias de trabalho por semana + a regra dos domingos
  const domingoMin = (mulheres: number, homens: number) => Math.floor(mulheres / 2) + Math.floor((homens * 2) / 3);
  const precisaPor = (diasPorPessoa: number) => {
    let k = Math.max(porDia, Math.ceil((porDia * nAbertos) / diasPorPessoa));
    if (domingoAberto) {
      const prop = n ? nf / n : 0;
      while (domingoMin(Math.round(k * prop), k - Math.round(k * prop)) < porDia && k < 200) k++;
    }
    return k;
  };
  const precisaAgora = precisaPor(Math.min(5, nAbertos));
  const precisaAntes = precisaPor(Math.min(6, nAbertos));
  const faltam = Math.max(0, precisaAgora - n);

  const dias: Dia[] = Array.from({ length: SEMANAS * 7 }, (_, i) => {
    const data = maisDias(PRIMEIRO_DIA, i);
    const dow = i % 7;
    return { data, semana: Math.floor(i / 7), dow, aberto: abertos[dow], feriado: FERIADOS[data] ?? null, precisa: abertos[dow] ? porDia : 0, trabalham: 0 };
  });

  // ---- motor: semana a semana, várias tentativas, fica com a melhor ----
  const grade: boolean[][] = pessoas.map(() => Array(dias.length).fill(false));
  const semDomingo = pessoas.map(() => 0); // semanas seguidas trabalhando no domingo
  const seguidos = pessoas.map(() => 0); // dias seguidos trabalhados até o fim da semana anterior
  const limiteDomingo = (p: Pessoa) => (p.sexo === "f" ? 1 : 2); // trabalhou isso de domingos seguidos → folga o próximo
  const rnd = sorteio(n * 7919 + nf * 131 + porDia * 17 + nAbertos);

  for (let w = 0; w < SEMANAS; w++) {
    let melhor: { folga: boolean[][]; falta: number } | null = null;
    for (let tent = 0; tent < 300 && !(melhor && melhor.falta === 0); tent++) {
      const folga = pessoas.map(() => abertos.map((a) => !a)); // dia fechado já é folga
      const trab = (d: number) => folga.reduce((s, f) => s + (f[d] ? 0 : 1), 0);
      // domingo primeiro: quem chegou no limite folga; depois quem está há mais tempo sem folgar, se sobrar gente
      if (domingoAberto) {
        pessoas.forEach((p, i) => {
          if (semDomingo[i] >= limiteDomingo(p)) folga[i][6] = true;
        });
        const fila = pessoas.map((_, i) => i).filter((i) => !folga[i][6]).sort((a, b) => semDomingo[b] - semDomingo[a] || rnd() - 0.5);
        for (const i of fila) if (trab(6) > porDia && rnd() < 0.75) folga[i][6] = true;
      }
      // completa as duas folgas de cada um no dia com mais gente sobrando
      const ordem = pessoas.map((_, i) => i).sort(() => rnd() - 0.5);
      for (const i of ordem) {
        while (folga[i].filter(Boolean).length < 2) {
          const livres = [0, 1, 2, 3, 4, 5, 6].filter((d) => !folga[i][d] && d !== 6);
          if (!livres.length) break;
          const sobra = (d: number) => trab(d) - dias[w * 7 + d].precisa + rnd() * 0.9;
          livres.sort((a, b) => sobra(b) - sobra(a));
          folga[i][livres[0]] = true;
        }
      }
      // nunca mais de 6 dias seguidos (contando o fim da semana anterior)
      let quebra = 0;
      folga.forEach((f, i) => {
        let s = seguidos[i];
        for (let d = 0; d < 7; d++) {
          s = f[d] ? 0 : s + 1;
          if (s > 6) quebra++;
        }
      });
      const falta = [0, 1, 2, 3, 4, 5, 6].reduce((s, d) => s + Math.max(0, dias[w * 7 + d].precisa - trab(d)), 0) + quebra * 10;
      if (!melhor || falta < melhor.falta) melhor = { folga, falta };
    }
    const folga = melhor!.folga;
    pessoas.forEach((_, i) => {
      for (let d = 0; d < 7; d++) {
        grade[i][w * 7 + d] = !folga[i][d];
        seguidos[i] = folga[i][d] ? 0 : seguidos[i] + 1;
      }
      if (domingoAberto) semDomingo[i] = folga[i][6] ? 0 : semDomingo[i] + 1;
    });
  }
  dias.forEach((d, j) => (d.trabalham = grade.reduce((s, g) => s + (g[j] ? 1 : 0), 0)));

  // ---- conferência ----
  const diasCurtos = dias.filter((d) => d.aberto && d.trabalham < d.precisa);
  const duasFolgas = grade.every((g) => Array.from({ length: SEMANAS }, (_, w) => g.slice(w * 7, w * 7 + 7).filter((t) => !t).length >= 2).every(Boolean));
  const maxSeguidos = Math.max(...grade.map((g) => g.reduce((a, t) => ({ s: t ? a.s + 1 : 0, m: Math.max(a.m, t ? a.s + 1 : 0) }), { s: 0, m: 0 }).m));
  const domingoOk = (sexo: "f" | "m", janela: number) =>
    grade.every((g, i) => {
      if (pessoas[i].sexo !== sexo) return true;
      const doms = Array.from({ length: SEMANAS }, (_, w) => g[w * 7 + 6]);
      for (let w = 0; w + janela <= SEMANAS; w++) if (doms.slice(w, w + janela).every(Boolean)) return false;
      return true;
    });
  const verificacoes: Verificacao[] = [
    { ok: duasFolgas, texto: "Duas folgas por semana para todos" },
    { ok: true, texto: `Jornada de ${fmtHoras(JORNADA_DIA)} em 5 dias = ${HORAS_SEMANA} h por semana` },
    { ok: diasCurtos.length === 0, texto: diasCurtos.length ? `Falta gente em ${diasCurtos.length} dia(s) do mês` : `Pelo menos ${porDia} pessoa(s) em todo dia aberto` },
    { ok: maxSeguidos <= 6, texto: "Ninguém trabalha mais de 6 dias seguidos" },
  ];
  if (domingoAberto) {
    if (nf) verificacoes.push({ ok: domingoOk("f", 2), texto: "Mulheres: folga em domingo a cada 2 semanas" });
    if (n - nf) verificacoes.push({ ok: domingoOk("m", 3), texto: "Homens: folga em domingo a cada 3 semanas" });
  }

  const erros = verificacoes.filter((v) => !v.ok).length;
  const nivel: ResultadoEscala["nivel"] = faltam > 0 || erros > 0 ? "alto" : n - precisaAgora <= 0 ? "medio" : "baixo";
  const veredito =
    nivel === "alto" ? (faltam > 0 ? `Faltam ${faltam} ${faltam === 1 ? "pessoa" : "pessoas"}` : "Não fecha do jeito que está") : nivel === "medio" ? "Fecha, mas no limite" : "Sua escala fecha";
  const explicacao =
    nivel === "alto"
      ? faltam > 0
        ? `Com ${n} ${n === 1 ? "funcionário" : "funcionários"} e duas folgas por semana, não dá para ter ${porDia} ${porDia === 1 ? "pessoa" : "pessoas"} em todos os dias abertos. Na 6x1 bastavam ${precisaAntes}; na 5x2 você precisa de ${precisaAgora}.`
        : "O número de pessoas até dá, mas a distribuição das folgas e dos domingos não fecha sem ajuste."
      : nivel === "medio"
        ? `Dá para cumprir a 5x2 com ${n} ${n === 1 ? "pessoa" : "pessoas"}, mas sem nenhuma sobra: uma falta, férias ou atestado e a escala quebra.`
        : `Com ${n} pessoas sobra ${n - precisaAgora === 1 ? "1 pessoa" : `${n - precisaAgora} pessoas`} de folga na operação. Dá para cumprir a 5x2 sem contratar.`;

  const dicas: string[] = [];
  if (turnos > 1) dicas.push(`A empresa fica aberta ${fmtHoras(horasLoja)} por dia. Uma pessoa fica no máximo ${fmtHoras(PRESENCA_MAX)} (8h24 de trabalho + 1 h de intervalo), então precisa de ${turnos} turnos. Confira se as ${porDia} pessoas por dia cobrem todos eles.`);
  if (faltam > 0) dicas.push(`Opções para fechar a conta: contratar ${faltam}, reduzir o mínimo em dias de pouco movimento, ou fechar um dia da semana.`);
  if (domingoAberto) dicas.push("Trabalho aos domingos no comércio depende de lei municipal e da convenção coletiva da categoria. Vale conferir a sua.");
  if (dias.some((d) => d.feriado && d.aberto)) dicas.push("Natal e Ano-novo caem nessas semanas. Trabalhar no feriado exige autorização na convenção coletiva e folga compensatória ou pagamento em dobro.");
  dicas.push(`A jornada de ${fmtHoras(JORNADA_DIA)} sem hora extra vale só na transição, até 15/12/2027. Depois disso a regra muda e a escala precisa ser revista.`);

  return { nivel, veredito, explicacao, horasLoja, turnos, porDia, precisaAgora, precisaAntes, faltam, pessoas, dias, grade, verificacoes, dicas };
}
