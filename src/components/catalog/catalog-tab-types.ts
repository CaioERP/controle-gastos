export const CATALOG_TABS = [
  { value: 'categorias', label: 'Categorias' },
  { value: 'regras', label: 'Regras' },
  { value: 'estabelecimentos', label: 'Estabelecimentos' },
] as const;

export type CatalogTab = (typeof CATALOG_TABS)[number]['value'];

export function parseCatalogTab(value: string | undefined): CatalogTab {
  return CATALOG_TABS.find((t) => t.value === value)?.value ?? 'categorias';
}
