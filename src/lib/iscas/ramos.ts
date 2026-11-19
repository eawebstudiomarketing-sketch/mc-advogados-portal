// Iscas (18/11/2026): ramos da ferramenta "Sua marca está livre?" e as classes NCL
// onde a prévia procura marcas parecidas. Vale no navegador e no servidor.
// 19/11/2026 (pedido do João): o ramo agora é DIGITADO. As palavras-chave resolvem a
// classe na hora, sem IA; só o que não for reconhecido vai para a IA (rota da isca).

export type Ramo = { id: string; nome: string; classes: string[]; palavras: string[] };

export const RAMOS: Ramo[] = [
  { id: "marketing", nome: "Marketing, publicidade e agência", classes: ["35"], palavras: ["marketing", "publicidade", "propaganda", "agencia de marketing", "agencia digital", "social media", "midia", "trafego", "branding"] },
  { id: "comercio", nome: "Loja, comércio ou e-commerce", classes: ["35"], palavras: ["loja", "comercio", "e-commerce", "ecommerce", "varejo", "atacado", "distribuidora", "mercado", "supermercado", "conveniencia", "importadora", "revenda", "magazine"] },
  { id: "restaurante", nome: "Restaurante, bar, lanchonete ou delivery", classes: ["43"], palavras: ["restaurante", "bar", "lanchonete", "delivery", "hamburguer", "pizzaria", "pizza", "cafeteria", "cafe", "acai", "sorveteria", "padaria", "churrascaria", "marmita", "food truck", "sushi", "espetinho", "buffet", "petiscaria", "boteco"] },
  { id: "alimentos", nome: "Alimentos e doces (fabricação)", classes: ["30", "29"], palavras: ["doce", "bolo", "chocolate", "alimento", "salgado", "biscoito", "confeitaria", "brigadeiro", "tempero", "congelado", "granola", "pao", "massa", "queijo", "laticinio", "frios"] },
  { id: "bebidas", nome: "Bebidas (sucos, cervejas, destilados)", classes: ["32", "33"], palavras: ["bebida", "cerveja", "suco", "cachaca", "vinho", "destilado", "gin", "vodka", "agua mineral", "refrigerante", "chopp", "energetico", "licor"] },
  { id: "roupas", nome: "Roupas, calçados e moda", classes: ["25"], palavras: ["roupa", "moda", "vestuario", "calcado", "sapato", "tenis", "camiseta", "camisa", "boutique", "confeccao", "lingerie", "biquini", "fitness", "jeans", "infantil", "bone", "chinelo", "sandalia", "bolsa"] },
  { id: "cosmeticos", nome: "Cosméticos, perfumes e higiene", classes: ["3"], palavras: ["cosmetico", "perfume", "maquiagem", "higiene", "sabonete", "shampoo", "skincare", "creme", "hidratante", "esmalte", "vela aromatica"] },
  { id: "beleza", nome: "Salão, estética ou clínica de beleza", classes: ["44"], palavras: ["salao", "estetica", "barbearia", "barber", "cabeleireiro", "manicure", "sobrancelha", "depilacao", "spa", "unha", "cilios", "harmonizacao", "massagem"] },
  { id: "saude", nome: "Saúde, clínica ou consultório", classes: ["44"], palavras: ["clinica", "consultorio", "medico", "medica", "odonto", "dentista", "fisioterapia", "psicolog", "nutricion", "saude", "laboratorio", "hospital", "terapia", "fono", "otica", "oftalmo"] },
  { id: "farmacia", nome: "Farmácia, remédios ou suplementos", classes: ["5"], palavras: ["farmacia", "remedio", "suplemento", "drogaria", "manipulacao", "whey", "vitamina", "fitoterapico"] },
  { id: "educacao", nome: "Escola, cursos ou treinamentos", classes: ["41"], palavras: ["escola", "curso", "treinamento", "educacao", "mentoria", "faculdade", "ensino", "idioma", "ingles", "reforco", "creche", "infoproduto", "preparatorio", "colegio"] },
  { id: "academia", nome: "Academia, esporte ou eventos", classes: ["41"], palavras: ["academia", "esporte", "crossfit", "pilates", "evento", "festa", "show", "danca", "luta", "jiu", "futebol", "personal", "producao de eventos", "casa de festas"] },
  { id: "tecnologia", nome: "Software, aplicativo ou tecnologia", classes: ["42", "9"], palavras: ["software", "aplicativo", "app", "tecnologia", "sistema", "saas", "informatica", "startup", "desenvolvimento de sites", "site", "plataforma", "inteligencia artificial", "games", "jogo"] },
  { id: "construcao", nome: "Construção, reformas ou engenharia", classes: ["37", "42"], palavras: ["construcao", "construtora", "reforma", "engenharia", "arquitetura", "obra", "pintura", "eletrica", "hidraulica", "energia solar", "solar", "manutencao"] },
  { id: "imoveis", nome: "Imobiliária ou seguros", classes: ["36"], palavras: ["imobiliaria", "imovel", "imoveis", "seguro", "corretora", "aluguel", "loteamento", "condominio"] },
  { id: "financeiro", nome: "Financeiro, crédito ou contabilidade", classes: ["36", "35"], palavras: ["financeir", "credito", "contabilidade", "contabil", "contador", "emprestimo", "investimento", "banco", "fintech", "consorcio", "cobranca", "pagamento"] },
  { id: "transporte", nome: "Transporte, logística ou turismo", classes: ["39"], palavras: ["transporte", "logistica", "frete", "turismo", "viagem", "agencia de viagem", "mudanca", "entrega", "motoboy", "transportadora", "excursao", "locadora", "taxi", "fretamento"] },
  { id: "hotel", nome: "Hotel, pousada ou hospedagem", classes: ["43"], palavras: ["hotel", "pousada", "hospedagem", "hostel", "airbnb", "resort", "chale"] },
  { id: "juridico", nome: "Advocacia, consultoria ou segurança", classes: ["45"], palavras: ["advocacia", "advogado", "juridico", "seguranca", "vigilancia", "despachante", "cartorio"] },
  { id: "pet", nome: "Pet shop ou veterinária", classes: ["31", "44"], palavras: ["pet", "veterinari", "racao", "petshop", "banho e tosa", "animais", "cachorro", "gato"] },
  { id: "moveis", nome: "Móveis e decoração", classes: ["20"], palavras: ["movel", "moveis", "decoracao", "marcenaria", "colchao", "estofado", "planejados"] },
  { id: "joias", nome: "Joias, relógios e acessórios", classes: ["14"], palavras: ["joia", "relogio", "acessorio", "bijuteria", "semijoia", "anel", "colar", "ourives"] },
  { id: "grafica", nome: "Gráfica, papelaria ou editora", classes: ["16", "40"], palavras: ["grafica", "papelaria", "editora", "impressao", "livro", "personalizado", "brinde", "adesivo"] },
];

export const ramoPorId = (id: string) => RAMOS.find((r) => r.id === id) ?? null;

const normal = (s: string) =>
  ` ${s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

/** Ramo digitado → ramo da lista por palavra-chave (a mais longa que bate ganha). Sem IA. */
export function ramoDoTexto(texto: string): Ramo | null {
  const t = normal(texto);
  let melhor: { r: Ramo; tam: number } | null = null;
  for (const r of RAMOS) {
    for (const p of [...r.palavras, r.nome]) {
      const k = normal(p).trim();
      // começo de palavra: "psicolog" pega psicologia/psicologo; "bar" não pega "barbearia"
      const bate = k.length <= 4 ? t.includes(` ${k} `) || t.includes(` ${k}s `) : t.includes(` ${k}`);
      if (bate && (!melhor || k.length > melhor.tam)) melhor = { r, tam: k.length };
    }
  }
  return melhor?.r ?? null;
}

/** Nome curto de cada classe NCL (para o relatório da prévia). */
export const NOME_CLASSE: Record<string, string> = {
  "3": "Cosméticos e higiene",
  "5": "Farmacêuticos e suplementos",
  "9": "Software e eletrônicos",
  "14": "Joias e relógios",
  "16": "Papelaria e impressos",
  "20": "Móveis e decoração",
  "25": "Roupas e calçados",
  "29": "Alimentos (carnes, laticínios)",
  "30": "Alimentos (doces, café, massas)",
  "31": "Produtos agrícolas e ração",
  "32": "Bebidas não alcoólicas e cervejas",
  "33": "Bebidas alcoólicas",
  "35": "Comércio e publicidade",
  "36": "Serviços financeiros e imobiliários",
  "37": "Construção e reparos",
  "39": "Transporte e turismo",
  "40": "Tratamento de materiais e impressão",
  "41": "Educação, esporte e eventos",
  "42": "Tecnologia e engenharia",
  "43": "Alimentação e hospedagem",
  "44": "Saúde, beleza e veterinária",
  "45": "Jurídico e segurança",
};
export const nomeClasse = (c: string) => NOME_CLASSE[String(Number(c))] ?? "Produtos e serviços";

/** Sugestões que aparecem enquanto a pessoa digita o ramo. */
export const SUGESTOES_RAMO = [
  "Restaurante",
  "Hamburgueria",
  "Loja de roupas",
  "Salão de beleza",
  "Barbearia",
  "Clínica de estética",
  "Clínica médica",
  "Academia",
  "Cursos online",
  "Agência de marketing",
  "Aplicativo",
  "Loja virtual",
  "Doceria",
  "Cosméticos",
  "Pet shop",
  "Imobiliária",
  "Construtora",
  "Transportadora",
  "Pousada",
  "Cervejaria",
];
