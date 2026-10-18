import type { PaymentMethod } from '@/server/domain/enums';

export type MerchantItem = {
  name: string;
  raw: string;
  category: string;
  min: number;
  max: number;
  methods: readonly PaymentMethod[];
};

export const MERCHANTS: readonly MerchantItem[] = [
  { name: 'iFood', raw: 'IFD*IFOOD', category: 'alimentacao-delivery', min: 35, max: 120, methods: ['credit_card_single'] },
  { name: 'Pão de Açúcar', raw: 'PAO DE ACUCAR 1234', category: 'alimentacao-mercado', min: 80, max: 650, methods: ['credit_card_single', 'debit_card'] },
  { name: 'Carrefour', raw: 'CARREFOUR HIPER', category: 'alimentacao-mercado', min: 120, max: 800, methods: ['credit_card_single', 'debit_card'] },
  { name: 'Padaria Real', raw: 'PADARIA REAL LTDA', category: 'alimentacao-padaria-cafe', min: 12, max: 45, methods: ['debit_card', 'pix'] },
  { name: 'Outback', raw: 'OUTBACK STEAKHOUSE', category: 'alimentacao-restaurante', min: 150, max: 380, methods: ['credit_card_single'] },
  { name: 'Uber', raw: 'UBER *TRIP', category: 'transporte-app', min: 12, max: 65, methods: ['credit_card_single'] },
  { name: '99', raw: '99APP *99POP', category: 'transporte-app', min: 10, max: 50, methods: ['credit_card_single'] },
  { name: 'Shell', raw: 'POSTO SHELL AV PAULISTA', category: 'transporte-combustivel', min: 150, max: 320, methods: ['credit_card_single', 'debit_card'] },
  { name: 'Sem Parar', raw: 'SEM PARAR', category: 'transporte-estacionamento-pedagio', min: 30, max: 120, methods: ['credit_card_single'] },
  { name: 'Drogasil', raw: 'DROGASIL 0456', category: 'saude-farmacia', min: 25, max: 210, methods: ['credit_card_single', 'debit_card'] },
  { name: 'Smart Fit', raw: 'SMARTFIT', category: 'saude-academia', min: 119.9, max: 119.9, methods: ['credit_card_single'] },
  { name: 'Netflix', raw: 'NETFLIX.COM', category: 'lazer-streaming', min: 55.9, max: 55.9, methods: ['credit_card_single'] },
  { name: 'Spotify', raw: 'SPOTIFY', category: 'lazer-streaming', min: 21.9, max: 21.9, methods: ['credit_card_single'] },
  { name: 'Steam', raw: 'STEAMGAMES.COM', category: 'lazer-jogos', min: 20, max: 250, methods: ['credit_card_single'] },
  { name: 'Ingresso.com', raw: 'INGRESSO.COM', category: 'lazer-eventos', min: 60, max: 400, methods: ['credit_card_single'] },
  { name: 'Amazon', raw: 'AMAZON BR', category: 'compras-casa', min: 40, max: 500, methods: ['credit_card_single'] },
  { name: 'Renner', raw: 'LOJAS RENNER', category: 'compras-vestuario', min: 80, max: 450, methods: ['credit_card_single'] },
  { name: 'Udemy', raw: 'UDEMY', category: 'educacao-cursos', min: 27.9, max: 89.9, methods: ['credit_card_single'] },
  { name: 'Petz', raw: 'PETZ', category: 'pets', min: 60, max: 300, methods: ['credit_card_single', 'pix'] },
] as const;
