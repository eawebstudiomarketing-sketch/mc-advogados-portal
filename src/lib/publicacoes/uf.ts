// Estado (UF) da publicação, para o filtro "Estados" (igual ao Astrea).
// Vem do número CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO): na Justiça Estadual (J=8) o
// TR é o tribunal do estado; na do Trabalho (J=5) é a região do TRT. Na
// Federal (J=4) a região cobre vários estados, então usa a sigla no fim do
// nome da vara (ex.: "SSJ de Teixeira de Freitas-BA").

const ESTADUAL: Record<string, string> = {
  "01": "AC", "02": "AL", "03": "AP", "04": "AM", "05": "BA", "06": "CE", "07": "DF", "08": "ES", "09": "GO",
  "10": "MA", "11": "MT", "12": "MS", "13": "MG", "14": "PA", "15": "PB", "16": "PR", "17": "PE", "18": "PI",
  "19": "RJ", "20": "RN", "21": "RS", "22": "RO", "23": "RR", "24": "SC", "25": "SE", "26": "SP", "27": "TO",
};

const TRT: Record<string, string> = {
  "01": "RJ", "02": "SP", "03": "MG", "04": "RS", "05": "BA", "06": "PE", "07": "CE", "08": "PA", "09": "PR",
  "10": "DF", "11": "AM", "12": "SC", "13": "PB", "14": "RO", "15": "SP", "16": "MA", "17": "ES", "18": "GO",
  "19": "AL", "20": "SE", "21": "RN", "22": "PI", "23": "MT", "24": "MS",
};

const UFS = new Set(Object.values(ESTADUAL));

export function ufDaPublicacao(numero: string, orgao: string | null): string | null {
  const d = numero.replace(/\D/g, "");
  if (d.length === 20) {
    const j = d[13];
    const tr = d.slice(14, 16);
    if (j === "8") return ESTADUAL[tr] ?? null;
    if (j === "5") return TRT[tr] ?? null;
  }
  const sigla = orgao?.match(/[-–/]\s*([A-Z]{2})\s*$/)?.[1];
  return sigla && UFS.has(sigla) ? sigla : null;
}
