import { eq } from 'drizzle-orm';
import { institutions, categories } from './schema';
import type { Db } from './client';

export const SEED_INSTITUTIONS = [
  { slug: 'nubank', name: 'Nubank', color: '#820AD1' },
  { slug: 'itau', name: 'Itaú', color: '#EC7000' },
  { slug: 'mercado-pago', name: 'Mercado Pago', color: '#00B1EA' },
  { slug: 'inter', name: 'Inter', color: '#FF7A00' },
  { slug: 'pagbank', name: 'PagBank', color: '#1BB99A' },
  { slug: 'carteira', name: 'Carteira', color: '#6B7280' },
] as const;

type SeedCategory = {
  slug: string;
  name: string;
  icon: string;
  color: string;
  children?: Array<{ slug: string; name: string }>;
};

export const SEED_EXPENSE_CATEGORIES: SeedCategory[] = [
  {
    slug: 'alimentacao',
    name: 'Alimentação',
    icon: 'utensils',
    color: '#F97316',
    children: [
      { slug: 'alimentacao-mercado', name: 'Mercado' },
      { slug: 'alimentacao-restaurante', name: 'Restaurante' },
      { slug: 'alimentacao-delivery', name: 'Delivery' },
      { slug: 'alimentacao-padaria-cafe', name: 'Padaria e café' },
    ],
  },
  {
    slug: 'transporte',
    name: 'Transporte',
    icon: 'car',
    color: '#3B82F6',
    children: [
      { slug: 'transporte-combustivel', name: 'Combustível' },
      { slug: 'transporte-app', name: 'App de transporte' },
      { slug: 'transporte-publico', name: 'Transporte público' },
      { slug: 'transporte-estacionamento-pedagio', name: 'Estacionamento e pedágio' },
      { slug: 'transporte-manutencao', name: 'Manutenção do veículo' },
    ],
  },
  {
    slug: 'moradia',
    name: 'Moradia',
    icon: 'home',
    color: '#8B5CF6',
    children: [
      { slug: 'moradia-aluguel', name: 'Aluguel' },
      { slug: 'moradia-condominio', name: 'Condomínio' },
      { slug: 'moradia-energia', name: 'Energia' },
      { slug: 'moradia-agua', name: 'Água' },
      { slug: 'moradia-internet-telefone', name: 'Internet e telefone' },
      { slug: 'moradia-manutencao', name: 'Manutenção da casa' },
    ],
  },
  {
    slug: 'saude',
    name: 'Saúde',
    icon: 'heart-pulse',
    color: '#EF4444',
    children: [
      { slug: 'saude-farmacia', name: 'Farmácia' },
      { slug: 'saude-consultas', name: 'Consultas e exames' },
      { slug: 'saude-plano', name: 'Plano de saúde' },
      { slug: 'saude-academia', name: 'Academia' },
    ],
  },
  {
    slug: 'lazer',
    name: 'Lazer',
    icon: 'gamepad-2',
    color: '#EC4899',
    children: [
      { slug: 'lazer-streaming', name: 'Streaming' },
      { slug: 'lazer-jogos', name: 'Jogos' },
      { slug: 'lazer-saidas', name: 'Bares e saídas' },
      { slug: 'lazer-eventos', name: 'Eventos e shows' },
    ],
  },
  {
    slug: 'educacao',
    name: 'Educação',
    icon: 'graduation-cap',
    color: '#14B8A6',
    children: [
      { slug: 'educacao-cursos', name: 'Cursos' },
      { slug: 'educacao-livros', name: 'Livros' },
    ],
  },
  {
    slug: 'compras',
    name: 'Compras',
    icon: 'shopping-bag',
    color: '#EAB308',
    children: [
      { slug: 'compras-vestuario', name: 'Vestuário' },
      { slug: 'compras-eletronicos', name: 'Eletrônicos' },
      { slug: 'compras-casa', name: 'Casa e decoração' },
      { slug: 'compras-presentes', name: 'Presentes' },
    ],
  },
  { slug: 'assinaturas', name: 'Assinaturas e serviços', icon: 'repeat', color: '#6366F1' },
  { slug: 'viagem', name: 'Viagem', icon: 'plane', color: '#0EA5E9' },
  { slug: 'pets', name: 'Pets', icon: 'paw-print', color: '#A16207' },
  { slug: 'cuidados-pessoais', name: 'Cuidados pessoais', icon: 'sparkles', color: '#D946EF' },
  { slug: 'impostos-taxas', name: 'Impostos e taxas', icon: 'receipt', color: '#64748B' },
  { slug: 'outros', name: 'Outros', icon: 'circle-help', color: '#9CA3AF' },
];

export const SEED_INCOME_CATEGORIES: SeedCategory[] = [
  { slug: 'salario', name: 'Salário', icon: 'briefcase', color: '#16A34A' },
  { slug: 'rendimentos', name: 'Rendimentos', icon: 'trending-up', color: '#22C55E' },
  { slug: 'reembolso', name: 'Reembolso', icon: 'undo-2', color: '#4ADE80' },
  { slug: 'vendas', name: 'Vendas', icon: 'tag', color: '#15803D' },
  { slug: 'outras-receitas', name: 'Outras receitas', icon: 'plus-circle', color: '#86EFAC' },
];

export async function seedBase(db: Db): Promise<void> {
  await db.insert(institutions).values([...SEED_INSTITUTIONS]).onConflictDoNothing({ target: institutions.slug });

  const groups = [
    { kind: 'expense' as const, list: SEED_EXPENSE_CATEGORIES },
    { kind: 'income' as const, list: SEED_INCOME_CATEGORIES },
  ];
  for (const { kind, list } of groups) {
    for (const [i, parent] of list.entries()) {
      await db
        .insert(categories)
        .values({
          slug: parent.slug,
          name: parent.name,
          kind,
          icon: parent.icon,
          color: parent.color,
          isSystem: true,
          sortOrder: i,
        })
        .onConflictDoNothing({ target: categories.slug });
      const [row] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, parent.slug));
      if (!row) throw new Error(`Categoria não encontrada após seed: ${parent.slug}`);
      for (const [j, child] of (parent.children ?? []).entries()) {
        await db
          .insert(categories)
          .values({
            slug: child.slug,
            name: child.name,
            kind,
            icon: parent.icon,
            color: parent.color,
            isSystem: true,
            sortOrder: j,
            parentId: row.id,
          })
          .onConflictDoNothing({ target: categories.slug });
      }
    }
  }
}
