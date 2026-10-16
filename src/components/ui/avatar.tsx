// Foto da pessoa; sem foto, as iniciais num círculo com cor fixa por nome
// (a mesma pessoa tem sempre a mesma cor em todas as telas).

const CORES = [
  "bg-navy text-gold-2",
  "bg-[#7c5cc4] text-white",
  "bg-[#1f7a43] text-white",
  "bg-[#b45309] text-white",
  "bg-[#1d4ed8] text-white",
  "bg-[#be185d] text-white",
  "bg-[#0f766e] text-white",
];

export const iniciaisDe = (nome: string) =>
  nome
    .replace(/^(Dr\.?|Dra\.?)\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

function corDe(nome: string) {
  let h = 0;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES[h % CORES.length];
}

export function Avatar({
  nome,
  foto,
  tamanho = 32,
  className = "",
  anel = false,
}: {
  nome: string;
  foto?: string | null;
  tamanho?: number;
  className?: string;
  anel?: boolean;
}) {
  const estilo = { width: tamanho, height: tamanho, fontSize: Math.max(9, Math.round(tamanho * 0.36)) };
  const borda = anel ? "ring-2 ring-surface" : "";
  if (foto) {
    // eslint-disable-next-line @next/next/no-img-element -- foto do Storage, tamanho pequeno
    return <img src={foto} alt={nome} title={nome} style={estilo} className={`shrink-0 rounded-full object-cover ${borda} ${className}`} />;
  }
  return (
    <span
      title={nome}
      aria-label={nome}
      style={estilo}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${corDe(nome)} ${borda} ${className}`}
    >
      {iniciaisDe(nome) || "?"}
    </span>
  );
}
