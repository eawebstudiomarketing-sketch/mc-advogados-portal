// Regras de leitura dos andamentos (usadas no robô e nas telas).

/** Palavras que tornam um andamento importante (decisões, prazos, fim do processo). */
export const IMPORTANTE =
  /senten[çc]a|decis[ãa]o|despacho|ac[óo]rd[ãa]o|liminar|tutela|audi[êe]ncia|cita[çc][ãa]o|intima[çc][ãa]o|tr[âa]nsito em julgado|penhora|bloqueio|alvar[áa]|acordo|homologa|julgad|arquiv|baixa definitiva|extin[çc][ãa]o|prazo/i;

/** Sinais de que o processo terminou (sugere encerrar no portal). */
export const BAIXADO = /arquivad[oa] definitivamente|arquivamento definitivo|baixa definitiva|remetidos os autos .*arquivo|processo arquivado/i;
