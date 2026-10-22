import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Controle de Gastos',
    short_name: 'Gastos',
    description: 'Controle pessoal de gastos, contas, faturas e investimentos',
    start_url: '/',
    display: 'standalone',
    lang: 'pt-BR',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      {
        src: '/pwa-icon/192',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/pwa-icon/512',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/pwa-icon/512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
