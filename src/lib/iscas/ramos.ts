// Iscas (18/11/2026): ramos que a pessoa escolhe na ferramenta "Sua marca pode ser
// registrada?" e as classes NCL onde a prévia procura marcas parecidas.
// Vale no navegador e no servidor. Sem IA: a lista resolve a classe na hora.

export type Ramo = { id: string; nome: string; classes: string[] };

export const RAMOS: Ramo[] = [
  { id: "marketing", nome: "Marketing, publicidade e agência", classes: ["35"] },
  { id: "comercio", nome: "Loja, comércio ou e-commerce", classes: ["35"] },
  { id: "restaurante", nome: "Restaurante, bar, lanchonete ou delivery", classes: ["43"] },
  { id: "alimentos", nome: "Alimentos e doces (fabricação)", classes: ["30", "29"] },
  { id: "bebidas", nome: "Bebidas (sucos, cervejas, destilados)", classes: ["32", "33"] },
  { id: "roupas", nome: "Roupas, calçados e moda", classes: ["25"] },
  { id: "cosmeticos", nome: "Cosméticos, perfumes e higiene", classes: ["3"] },
  { id: "beleza", nome: "Salão, estética ou clínica de beleza", classes: ["44"] },
  { id: "saude", nome: "Saúde, clínica ou consultório", classes: ["44"] },
  { id: "farmacia", nome: "Farmácia, remédios ou suplementos", classes: ["5"] },
  { id: "educacao", nome: "Escola, cursos ou treinamentos", classes: ["41"] },
  { id: "academia", nome: "Academia, esporte ou eventos", classes: ["41"] },
  { id: "tecnologia", nome: "Software, aplicativo ou tecnologia", classes: ["42", "9"] },
  { id: "construcao", nome: "Construção, reformas ou engenharia", classes: ["37", "42"] },
  { id: "imoveis", nome: "Imobiliária ou seguros", classes: ["36"] },
  { id: "financeiro", nome: "Financeiro, crédito ou contabilidade", classes: ["36", "35"] },
  { id: "transporte", nome: "Transporte, logística ou turismo", classes: ["39"] },
  { id: "hotel", nome: "Hotel, pousada ou hospedagem", classes: ["43"] },
  { id: "juridico", nome: "Advocacia, consultoria ou segurança", classes: ["45"] },
  { id: "pet", nome: "Pet shop ou veterinária", classes: ["31", "44"] },
  { id: "moveis", nome: "Móveis e decoração", classes: ["20"] },
  { id: "joias", nome: "Joias, relógios e acessórios", classes: ["14"] },
  { id: "grafica", nome: "Gráfica, papelaria ou editora", classes: ["16", "40"] },
];

export const ramoPorId = (id: string) => RAMOS.find((r) => r.id === id) ?? null;
