import { CategorieCourrier } from './categorieCourrierService';
import { TypeCourrier, SensCourrier } from '../types';

/**
 * Catégories officielles ARMP RDC (onglet Documentation et publications du site armp-rdc.cd).
 * Ordre et couleurs alignés sur CourrierCategorizationSeeder.php.
 */
export const ARMP_OFFICIAL_CATEGORIES: Array<{ name: string; color: string }> = [
  { name: 'Décision d\'approbation', color: '#1d4ed8' },
  { name: 'Décisions du CRD', color: '#1e40af' },
  { name: 'Documentation', color: '#059669' },
  { name: 'Documents standards', color: '#047857' },
  { name: 'Edits provinciaux', color: '#7c2d12' },
  { name: 'Formations des Acteurs', color: '#c2410c' },
  { name: 'Lois', color: '#b91c1c' },
  { name: 'Plans de passation des marchés', color: '#0e7490' },
  { name: 'PPM des provinces', color: '#0891b2' },
  { name: 'PPM niveau central', color: '#2563eb' },
  { name: 'Publications', color: '#7c3aed' },
  { name: 'Rapports annuels ARMP', color: '#4338ca' },
  { name: 'Rapports et procès verbaux des marchés publics', color: '#9333ea' },
  { name: 'Règlements', color: '#374151' },
];

/** Normalise une chaîne pour comparaison insensible aux accents/casse. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\p{Diacritic}]/gu, '');
}

/**
 * Classe un courrier dans une catégorie existante en fonction de son objet.
 * Retourne l'ID de la catégorie suggérée, ou null si aucune correspondance.
 */
export function classifyByObjet(
  objet: string,
  folders: CategorieCourrier[]
): string | null {
  if (!objet?.trim() || folders.length === 0) return null;

  const obj = normalize(objet);

  // Recherche par mots-clés (ordre décroissant de spécificité)
  const keywordRules: Array<{ test: (s: string) => boolean; categoryName: string }> = [
    { test: s => s.includes('decision d\'approbation') || s.includes('approbation') || s.includes('approuv'), categoryName: 'Décision d\'approbation' },
    { test: s => s.includes('crd') || s.includes('conseil de regulation') || s.includes('discipline'), categoryName: 'Décisions du CRD' },
    { test: s => s.includes('loi') || s.includes('decret') || s.includes('ordonnance'), categoryName: 'Lois' },
    { test: s => s.includes('reglement') || s.includes('modalite') || s.includes('instruction'), categoryName: 'Règlements' },
    { test: s => s.includes('formation') || s.includes('atelier') || s.includes('renforcement') || s.includes('capacite'), categoryName: 'Formations des Acteurs' },
    { test: s => s.includes('rapport annuel') || (s.includes('rapport') && s.includes('annuel')), categoryName: 'Rapports annuels ARMP' },
    { test: s => s.includes('proces-verbal') || s.includes('pv') || (s.includes('rapport') && s.includes('marche public')), categoryName: 'Rapports et procès verbaux des marchés publics' },
    { test: s => s.includes('document standard') || s.includes('cctp') || s.includes('rc') || s.includes('dce') || s.includes('dossier'), categoryName: 'Documents standards' },
    { test: s => s.includes('edit') || s.includes('provincial') || s.includes('gouverneur'), categoryName: 'Edits provinciaux' },
    { test: s => s.includes('ppm des provinces') || (s.includes('ppm') && s.includes('province')), categoryName: 'PPM des provinces' },
    { test: s => s.includes('ppm niveau central') || (s.includes('central') && s.includes('ministere')) || s.includes('primature'), categoryName: 'PPM niveau central' },
    { test: s => s.includes('plan de passation') || (s.includes('ppm') && s.includes('passation')), categoryName: 'Plans de passation des marchés' },
    { test: s => s.includes('publication') || s.includes('communique') || s.includes('annonce'), categoryName: 'Publications' },
    { test: s => s.includes('documentation') || s.includes('note') || s.includes('guide'), categoryName: 'Documentation' },
  ];

  for (const rule of keywordRules) {
    if (rule.test(obj)) {
      const folder = folders.find(f => normalize(f.name) === normalize(rule.categoryName));
      if (folder) return folder.id;
    }
  }

  return null;
}

/**
 * Détermine une catégorie par défaut quand l'objet ne permet pas de classifier,
 * en fonction du sens et du type du courrier.
 */
export function getDefaultCategoryIndex(
  sens: SensCourrier,
  type: TypeCourrier
): number {
  if (sens === SensCourrier.ENTRANT && type === TypeCourrier.EXTERNE) return 0;
  if (sens === SensCourrier.ENTRANT && type === TypeCourrier.INTERNE) return 1;
  if (sens === SensCourrier.SORTANT && type === TypeCourrier.EXTERNE) return 2;
  return 3;
}

/**
 * Recherche le meilleur dossier candidat pour un nouveau courrier.
 * Si l'objet permet de classifier, retourne ce dossier ; sinon retourne un dossier
 * par défaut selon le sens/type s'il existe.
 */
export function resolveDefaultFolderId(
  objet: string,
  folders: CategorieCourrier[],
  sens: SensCourrier,
  type: TypeCourrier
): string | null {
  const byObjet = classifyByObjet(objet, folders);
  if (byObjet) return byObjet;

  const defaultIndex = getDefaultCategoryIndex(sens, type);
  const fallbackNames = [
    'Décision d\'approbation',
    'Décisions du CRD',
    'Documentation',
    'Documents standards',
  ];
  const fallbackFolder = folders.find(f =>
    normalize(f.name) === normalize(fallbackNames[defaultIndex])
  );
  return fallbackFolder?.id ?? folders[0]?.id ?? null;
}
