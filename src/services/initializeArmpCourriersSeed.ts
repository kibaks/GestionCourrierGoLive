/**
 * Seed de 2500 courriers ARMP catégorisés par direction/division/service.
 * Chaque entité utilise des sujets spécialisés selon sa mission réelle.
 *
 * Structure ARMP (ids tirés de entiteOrganisationnelleService.getArmpEntities()) :
 *
 * DG (1) → Direction Générale
 *   ├─ (3)  Commissaires aux Comptes
 *   ├─ (4)  Comité de Règlement des Différends
 *   ├─ (5)  Services Rattachés à la DG
 *   │    ├─ Div (11) Administration des Provinces
 *   │    │    ├─ Svc (21) Admin Provinces Est  → Sous-svc (35) Classement & Archives
 *   │    │    └─ Svc (22) Admin Provinces Ouest
 *   │    ├─ Div (12) Audit interne
 *   │    │    └─ Svc (23) Audit et Contrôle
 *   │    └─ Div (13) Secrétariat Permanent CGPMP
 *   │         └─ Svc (24) Secrétariat CGPMP
 *   ├─ (6)  Direction de la Régulation
 *   │    └─ Div (14) Audits et Enquêtes
 *   │         └─ Svc (25) Enquêtes Régulation → Sous-svc (36) Contentieux, (37) Conformité
 *   ├─ (7)  Direction Statistiques & Communication
 *   ├─ (8)  Direction Administrative et Financière
 *   │    ├─ Div (15) Services Généraux → Bur (44) Courrier & Archives, (45) Achats & Marchés
 *   │    │    └─ Svc (26) Logistique et Moyens généraux
 *   │    ├─ Div (16) Ressources Humaines → Bur (46) Sourcing & Recrutement
 *   │    │    ├─ Svc (27) Recrutement et Carrières → Sous-svc (38) Paie, (39) Avantages sociaux
 *   │    │    └─ Svc (28) Formation et Développement
 *   │    ├─ Div (17) Finance et Comptabilité → Bur (47) Comptabilité, (48) Trésorerie
 *   │    │    ├─ Svc (29) Comptabilité Générale → Sous-svc (40) Clôture & Consolidation
 *   │    │    └─ Svc (30) Comptabilité Analytique → Sous-svc (41) Suivi Budget
 *   │    └─ Div (18) Facturation et Recouvrement → Bur (49) Facturation Client
 *   │         ├─ Svc (31) Facturation
 *   │         └─ Svc (32) Recouvrement → Sous-svc (42) Recouvrement Créances
 *   ├─ (9)  Direction Formation et Appuis Techniques
 *   │    ├─ Div (19) Formation → Bur (50) Formation Interne
 *   │    │    └─ Svc (33) Formation des Acteurs → Sous-svc (43) Formation Continue
 *   │    └─ Div (20) Appuis Techniques
 *   │         └─ Svc (34) Appuis et Accompagnement
 *   └─ (10) Direction PPP
 */

import { courrierService } from './courrierService';
import { adminService } from './adminService';
import { entiteOrganisationnelleService } from './entiteOrganisationnelleService';
import { laravelApiService } from './laravelApiService';
import { TypeCourrier, SensCourrier, Priorite, StatutCourrier, EntiteOrganisationnelle } from '../types';

// ─── Types internes ──────────────────────────────────────────────────────────

interface EntiteSpec {
  directionId: string;
  directionNom: string;
  serviceId?: string;
  serviceNom?: string;
  /** Sujets spécialisés selon la mission de l'entité */
  sujetsEntrant: string[];
  sujetsSort: string[];
  /** Noms d'expéditeurs/destinataires externes ou internes typiques */
  interlocuteursExternesEntrant: string[];
  interlocuteursExternesSortant: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const result: T[] = [];
  for (let i = 0; i < Math.min(n, copy.length); i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

function randDate(daysBack: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * daysBack));
  d.setHours(Math.floor(Math.random() * 8) + 8, Math.floor(Math.random() * 60));
  return d;
}

function randPriorite(): Priorite {
  const r = Math.random();
  if (r < 0.05) return Priorite.URGENTE;
  if (r < 0.20) return Priorite.HAUTE;
  if (r < 0.80) return Priorite.NORMALE;
  return Priorite.BASSE;
}

function randStatut(sens: SensCourrier): StatutCourrier {
  const statuts = sens === SensCourrier.ENTRANT
    ? [StatutCourrier.ENREGISTRE, StatutCourrier.EN_ATTENTE_DG, StatutCourrier.ASSIGNE, StatutCourrier.EN_TRAITEMENT, StatutCourrier.TRAITE]
    : [StatutCourrier.ENREGISTRE, StatutCourrier.EN_ATTENTE_DG, StatutCourrier.EN_TRAITEMENT, StatutCourrier.TRAITE, StatutCourrier.ARCHIVE];
  const weights = [0.15, 0.20, 0.25, 0.25, 0.15];
  let r = Math.random();
  for (let i = 0; i < statuts.length; i++) {
    r -= weights[i];
    if (r <= 0) return statuts[i];
  }
  return StatutCourrier.ENREGISTRE;
}

function refInterne(prefix: string, year: number, seq: number): string {
  return `${prefix}-INT-${year}-${String(seq).padStart(4, '0')}`;
}

// ─── Catalogue des entités avec sujets spécialisés ───────────────────────────

const CATALOGUE: EntiteSpec[] = [

  // ── Direction Générale (1) ────────────────────────────────────────────────
  {
    directionId: '1', directionNom: 'Direction Générale',
    sujetsEntrant: [
      'Rapport annuel de performance ARMP — exercice {annee}',
      'Note d\'orientation stratégique sur la réforme des marchés publics',
      'Demande d\'audience auprès du Directeur Général',
      'Convocation à la réunion du Conseil d\'Administration',
      'Compte rendu de la session plénière du Comité de Régulation',
      'Transmission du plan de passation des marchés — exercice {annee}',
      'Rapport d\'évaluation du dispositif de contrôle des marchés publics',
      'Lettre de félicitations — prix d\'excellence ARMP {annee}',
      'Demande de clarification sur les procédures de passation',
      'Note de service — révision du règlement intérieur',
    ],
    sujetsSort: [
      'Circulaire DG N°{seq}/{annee} — consignes générales aux directions',
      'Note d\'instruction relative à l\'application du Code des marchés publics',
      'Transmission du budget prévisionnel consolidé {annee}',
      'Lettre de mission aux directeurs — objectifs {annee}',
      'Convocation — réunion de coordination inter-directions',
      'Décision DG portant nomination du responsable de la cellule {service}',
      'Rapport de synthèse transmis au Ministère de tutelle',
      'Communiqué interne — politique de gouvernance ARMP',
      'Directive relative à la gestion des correspondances officielles',
      'Avis de vacance de poste — Direction Générale',
    ],
    interlocuteursExternesEntrant: ['Ministère du Budget et des Finances', 'Présidence de la République', 'Assemblée Nationale', 'Sénat', 'Banque Mondiale', 'FMI', 'Union Africaine', 'OCDE', 'Gouvernorat du Haut-Katanga'],
    interlocuteursExternesSortant: ['Ministère du Budget et des Finances', 'Présidence de la République', 'Gouvernorat du Kongo Central', 'Gouvernorat du Sud-Kivu'],
  },

  // ── Commissaires aux Comptes (3) ──────────────────────────────────────────
  {
    directionId: '3', directionNom: 'Commissaires aux Comptes',
    sujetsEntrant: [
      'Rapport de commissariat aux comptes — exercice {annee}',
      'Observations sur les états financiers de l\'ARMP',
      'Demande de documents comptables pour audit externe',
      'Lettre de management relative aux insuffisances relevées',
      'Plan d\'audit annuel — transmission pour validation',
      'Rapport intermédiaire de commissariat — semestre 1 {annee}',
    ],
    sujetsSort: [
      'Certification des comptes ARMP — exercice {annee}',
      'Rapport de commissariat aux comptes définitif {annee}',
      'Note de réserve sur les états financiers',
      'Recommandations aux organes de direction — suite audit {annee}',
      'Transmission du rapport aux instances de tutelle',
    ],
    interlocuteursExternesEntrant: ['Cabinet d\'audit BDO', 'Cabinet Deloitte RDC', 'Cour des Comptes', 'Ministère des Finances'],
    interlocuteursExternesSortant: ['Cour des Comptes', 'Ministère des Finances', 'Parlement'],
  },

  // ── Comité de Règlement des Différends (4) ────────────────────────────────
  {
    directionId: '4', directionNom: 'Comité de Règlement des Différends',
    sujetsEntrant: [
      'Recours en annulation — appel d\'offres {ref} — {soumissionnaire}',
      'Plainte relative à l\'attribution irrégulière du marché N°{ref}',
      'Demande de suspension de procédure de passation — {entite}',
      'Transmission du dossier de recours — {soumissionnaire}',
      'Observations de l\'autorité contractante sur le recours N°{ref}',
      'Demande de désistement — recours N°{ref}',
      'Notification de décision du CRD — dossier N°{ref}',
      'Demande de prorogation du délai de recours',
    ],
    sujetsSort: [
      'Décision CRD N°{seq}/{annee} — rejet du recours {ref}',
      'Décision CRD N°{seq}/{annee} — annulation partielle du marché {ref}',
      'Notification de la décision aux parties — dossier {ref}',
      'Convocation des parties à l\'audience du {date}',
      'Rapport de synthèse des décisions CRD — {annee}',
      'Transmission des décisions CRD au Ministère',
    ],
    interlocuteursExternesEntrant: ['Soumissionnaire SARL Bâtitec', 'Entreprise Génie Civil Congo', 'Cabinet d\'Avocats Maître Nkunda', 'Autorité Contractante — Mairie de Kinshasa'],
    interlocuteursExternesSortant: ['Soumissionnaire SARL Bâtitec', 'Autorité Contractante — REGIDESO', 'Ministère des Travaux Publics'],
  },

  // ── Services Rattachés DG / Admin Provinces Est (21) ──────────────────────
  {
    directionId: '5', directionNom: 'Services Rattachés à la Direction Générale',
    serviceId: '21', serviceNom: 'Service Administration Provinces Est',
    sujetsEntrant: [
      'Rapport trimestriel d\'activité — Antenne ARMP Nord-Kivu',
      'Transmission du plan de passation — Province du Maniema {annee}',
      'Signalement d\'irrégularité de passation — Province du Sud-Kivu',
      'Demande d\'appui technique — Antenne ARMP Ituri',
      'Rapport de mission de supervision — Province Orientale',
      'Compte rendu de sensibilisation aux marchés publics — Goma',
    ],
    sujetsSort: [
      'Instruction aux antennes Est — application circulaire DG N°{seq}/{annee}',
      'Programme de supervision des procédures — Provinces de l\'Est {annee}',
      'Rapport consolidé des provinces de l\'Est — T{trim} {annee}',
      'Note de service — affectation d\'un agent à l\'antenne de Bukavu',
      'Convocation — réunion de coordination antennes Est',
    ],
    interlocuteursExternesEntrant: ['Gouvernorat du Nord-Kivu', 'Division Provinciale Budget — Maniema', 'Antenne ARMP Butembo'],
    interlocuteursExternesSortant: ['Gouvernorat du Sud-Kivu', 'Antenne ARMP Goma', 'Division Provinciale des Finances — Ituri'],
  },

  // ── Services Rattachés DG / Admin Provinces Ouest (22) ───────────────────
  {
    directionId: '5', directionNom: 'Services Rattachés à la Direction Générale',
    serviceId: '22', serviceNom: 'Service Administration Provinces Ouest',
    sujetsEntrant: [
      'Rapport trimestriel d\'activité — Antenne ARMP Bandundu',
      'Transmission du plan de passation — Province du Kongo Central {annee}',
      'Demande d\'appui technique — Antenne ARMP Équateur',
      'Signalement d\'irrégularité — Province du Mai-Ndombe',
      'Rapport de mission — Province de l\'Équateur',
    ],
    sujetsSort: [
      'Instruction aux antennes Ouest — circulaire DG {annee}',
      'Programme de supervision des procédures — Provinces de l\'Ouest {annee}',
      'Rapport consolidé des provinces de l\'Ouest — T{trim} {annee}',
      'Affectation d\'agent — Antenne ARMP Matadi',
    ],
    interlocuteursExternesEntrant: ['Gouvernorat du Kongo Central', 'Division Provinciale Budget — Équateur', 'Antenne ARMP Matadi'],
    interlocuteursExternesSortant: ['Gouvernorat du Mai-Ndombe', 'Antenne ARMP Bandundu'],
  },

  // ── Services Rattachés DG / Audit interne / Svc Audit et Contrôle (23) ───
  {
    directionId: '5', directionNom: 'Services Rattachés à la Direction Générale',
    serviceId: '23', serviceNom: 'Service Audit et Contrôle',
    sujetsEntrant: [
      'Plan d\'audit interne annuel — exercice {annee}',
      'Rapport de mission d\'audit — {entite} T{trim} {annee}',
      'Demande de documents pour audit de la DAF',
      'Observations suite audit interne — Direction Régulation',
      'Rapport de suivi des recommandations d\'audit {annee}',
      'Note de risque — processus de facturation et recouvrement',
    ],
    sujetsSort: [
      'Rapport d\'audit interne définitif — {entite} {annee}',
      'Lettre de management — recommandations audit DAF',
      'Plan d\'amélioration post-audit — T{trim} {annee}',
      'Transmission du rapport d\'audit au DG',
      'Note de clôture mission audit — Direction Formation',
    ],
    interlocuteursExternesEntrant: ['Inspection Générale des Finances', 'Cour des Comptes', 'Cabinet Mazars RDC'],
    interlocuteursExternesSortant: ['Inspection Générale des Finances', 'Cour des Comptes'],
  },

  // ── Services Rattachés DG / Secrétariat CGPMP (24) ───────────────────────
  {
    directionId: '5', directionNom: 'Services Rattachés à la Direction Générale',
    serviceId: '24', serviceNom: 'Service Secrétariat CGPMP',
    sujetsEntrant: [
      'Convocation à la session du CGPMP — {date}',
      'Transmission des dossiers pour ordre du jour CGPMP',
      'Comptes rendus de session CGPMP N°{seq}/{annee}',
      'Demande d\'inscription à l\'ordre du jour CGPMP',
      'Rapport de suivi des décisions CGPMP — T{trim} {annee}',
    ],
    sujetsSort: [
      'Procès-verbal de session CGPMP N°{seq}/{annee}',
      'Décisions du CGPMP — session N°{seq}/{annee}',
      'Convocation membres CGPMP — session extraordinaire',
      'Diffusion des décisions CGPMP aux entités membres',
    ],
    interlocuteursExternesEntrant: ['Ministère du Budget', 'Présidence de la République', 'Primature'],
    interlocuteursExternesSortant: ['Ministère du Budget', 'Entités membres du CGPMP'],
  },

  // ── Direction de la Régulation (6) ────────────────────────────────────────
  {
    directionId: '6', directionNom: 'Direction de la Régulation',
    sujetsEntrant: [
      'Demande d\'avis sur la procédure de passation — marché N°{ref}',
      'Transmission des PPM — entité contractante {entite}',
      'Rapport d\'audit de passation — {entite} {annee}',
      'Demande d\'approbation de dérogation aux procédures',
      'Signalement de violation des procédures — {entite}',
      'Demande d\'interprétation du Code des marchés publics Art. {num}',
    ],
    sujetsSort: [
      'Avis de régulation N°{seq}/{annee} — marché {ref}',
      'Note circulaire régulation — application décret N°{ref}',
      'Rapport annuel de régulation des marchés publics {annee}',
      'Décision de sanction — {entite} — irrégularité procédurale',
      'Transmission des avis au Ministère de tutelle',
      'Guide de passation révisé — version {annee}',
    ],
    interlocuteursExternesEntrant: ['Ministère des Travaux Publics', 'REGIDESO', 'SNEL', 'Mairie de Kinshasa', 'Province du Kasaï'],
    interlocuteursExternesSortant: ['Ministère du Budget', 'Entités contractantes', 'REGIDESO', 'SNEL'],
  },

  // ── Régulation / Enquêtes Régulation (25) ────────────────────────────────
  {
    directionId: '6', directionNom: 'Direction de la Régulation',
    serviceId: '25', serviceNom: 'Service Enquêtes Régulation',
    sujetsEntrant: [
      'Dénonciation de corruption dans l\'attribution du marché N°{ref}',
      'Demande d\'enquête sur les pratiques de passation — {entite}',
      'Rapport de constat d\'irrégularité — {entite}',
      'Transmission des éléments de preuves — plainte N°{ref}',
      'Demande d\'accès aux documents de passation — marché {ref}',
    ],
    sujetsSort: [
      'Rapport d\'enquête N°{seq}/{annee} — {entite}',
      'Convocation à l\'audition — {entite} — enquête N°{ref}',
      'Décision de classement sans suite — plainte N°{ref}',
      'Transmission du rapport d\'enquête à la direction',
      'Note de saisine du Parquet — faits de corruption — {entite}',
    ],
    interlocuteursExternesEntrant: ['Lanceur d\'alerte anonyme', 'Entreprise lésée Constructions Plus', 'Parquet de Grande Instance'],
    interlocuteursExternesSortant: ['Parquet de Grande Instance', 'Ministère de la Justice', 'Direction Générale ARMP'],
  },

  // ── Direction Statistiques & Communication (7) ───────────────────────────
  {
    directionId: '7', directionNom: 'Direction des Statistiques et de la Communication',
    sujetsEntrant: [
      'Transmission des données de passation — T{trim} {annee} — {entite}',
      'Demande de publication au Bulletin Officiel des Marchés Publics',
      'Rapport de communication institutionnelle — {annee}',
      'Demande d\'entretien presse — Journal La Prospérité',
      'Transmission du rapport statistique sectoriel — {entite}',
      'Demande d\'accès aux statistiques des marchés publics',
    ],
    sujetsSort: [
      'Bulletin statistique des marchés publics — T{trim} {annee}',
      'Communiqué de presse ARMP — résultats {annee}',
      'Rapport annuel statistique des marchés publics {annee}',
      'Publication au BOMP — avis de marché N°{ref}',
      'Note d\'information — mise à jour du portail ARMP',
      'Tableau de bord des marchés publics — {annee}',
    ],
    interlocuteursExternesEntrant: ['Journal La Prospérité', 'Radio Okapi', 'Ministère du Plan', 'Banque Mondiale'],
    interlocuteursExternesSortant: ['Journal La Prospérité', 'Radio Okapi', 'Ministère du Plan', 'Entités contractantes'],
  },

  // ── DAF (8) ───────────────────────────────────────────────────────────────
  {
    directionId: '8', directionNom: 'Direction Administrative et Financière',
    sujetsEntrant: [
      'Transmission du budget rectificatif {annee} — Ministère des Finances',
      'Notification de virement de crédits — {entite}',
      'Rapport de contrôle financier — T{trim} {annee}',
      'Demande d\'arbitrage budgétaire inter-directions',
      'Avis de liquidation des dépenses — exercice {annee}',
    ],
    sujetsSort: [
      'Transmission du budget consolidé DAF — exercice {annee}',
      'Note de service — procédures de dépenses et engagements',
      'Rapport de situation financière — T{trim} {annee}',
      'Circulaire DAF N°{seq}/{annee} — clôture exercice budgétaire',
      'Instruction sur la gestion des immobilisations',
    ],
    interlocuteursExternesEntrant: ['Ministère des Finances', 'Banque Centrale du Congo', 'DGRAD'],
    interlocuteursExternesSortant: ['Ministère des Finances', 'Banque Centrale du Congo', 'DGRAD'],
  },

  // ── DAF / Services Généraux / Logistique (26) ────────────────────────────
  {
    directionId: '8', directionNom: 'Direction Administrative et Financière',
    serviceId: '26', serviceNom: 'Service Logistique et Moyens généraux',
    sujetsEntrant: [
      'Devis pour fournitures de bureau — {fournisseur}',
      'Facture de location des locaux — {bailleur}',
      'Demande de maintenance préventive — parc automobile ARMP',
      'Bon de livraison matériel informatique — {fournisseur}',
      'Demande de réapprovisionnement des consommables',
      'Rapport d\'inventaire des immobilisations — T{trim} {annee}',
    ],
    sujetsSort: [
      'Bon de commande N°{seq}/{annee} — {fournisseur}',
      'Note de service — utilisation du parc automobile',
      'Rapport d\'inventaire annuel des équipements',
      'Demande de réforme du matériel obsolète',
      'Procès-verbal de réception — mobilier de bureau',
    ],
    interlocuteursExternesEntrant: ['SARL Bureautique Plus', 'Kinshasa Motors', 'Total Énergies RDC', 'Bailleur Immeuble Gombé'],
    interlocuteursExternesSortant: ['SARL Bureautique Plus', 'Kinshasa Motors', 'Fournisseur Informatique Congo'],
  },

  // ── DAF / RH / Recrutement et Carrières (27) ─────────────────────────────
  {
    directionId: '8', directionNom: 'Direction Administrative et Financière',
    serviceId: '27', serviceNom: 'Service Recrutement et Carrières',
    sujetsEntrant: [
      'Candidature au poste de {poste} — {candidat}',
      'Demande de mutation — agent {agent}',
      'Dossier de mise en retraite — {agent}',
      'Rapport de stage — {stagaire}',
      'Demande d\'avancement d\'échelon — {agent}',
      'Résultats du test de recrutement — session {annee}',
    ],
    sujetsSort: [
      'Avis de recrutement — poste de {poste} — {annee}',
      'Décision de nomination — {agent} — {poste}',
      'Contrat de travail — {agent} — durée déterminée',
      'Note de service — affectation de {agent} à {direction}',
      'Attestation de travail — {agent}',
      'Tableau de bord RH — T{trim} {annee}',
    ],
    interlocuteursExternesEntrant: ['Candidat M. Kabongo Jean', 'ONEM (Office National de l\'Emploi)', 'Université de Kinshasa'],
    interlocuteursExternesSortant: ['ONEM', 'CNSS (Caisse Nationale de Sécurité Sociale)', 'Université de Kinshasa'],
  },

  // ── DAF / RH / Formation et Développement (28) ───────────────────────────
  {
    directionId: '8', directionNom: 'Direction Administrative et Financière',
    serviceId: '28', serviceNom: 'Service Formation et Développement',
    sujetsEntrant: [
      'Offre de formation — {organisme} — {theme}',
      'Attestation de participation — {agent} — formation {theme}',
      'Rapport de formation externe — {agent} — {theme}',
      'Plan de développement des compétences — T{trim} {annee}',
    ],
    sujetsSort: [
      'Programme annuel de formation RH — {annee}',
      'Convocation à la formation interne — {theme}',
      'Rapport de formation — session {theme} — {annee}',
      'Bilan des formations réalisées — T{trim} {annee}',
    ],
    interlocuteursExternesEntrant: ['ECOFI Formation', 'ISTA Kinshasa', 'Institut de Gestion des Marchés Publics'],
    interlocuteursExternesSortant: ['ECOFI Formation', 'Agents ARMP bénéficiaires'],
  },

  // ── DAF / Finance et Comptabilité / Comptabilité Générale (29) ───────────
  {
    directionId: '8', directionNom: 'Direction Administrative et Financière',
    serviceId: '29', serviceNom: 'Service Comptabilité Générale',
    sujetsEntrant: [
      'Relevé bancaire — compte ARMP N°{ref} — {mois} {annee}',
      'Facture fournisseur N°{ref} — {fournisseur} — montant {montant} CDF',
      'Avis de débit — virement N°{ref}',
      'Confirmation de paiement — {fournisseur}',
      'Rapport de rapprochement bancaire — {mois} {annee}',
    ],
    sujetsSort: [
      'État financier mensuel — {mois} {annee}',
      'Balance comptable — T{trim} {annee}',
      'Ordre de virement N°{seq}/{annee} — {fournisseur} — {montant} CDF',
      'Rapport de clôture mensuelle — {mois} {annee}',
      'Note de justification des écarts budgétaires',
    ],
    interlocuteursExternesEntrant: ['Banque Centrale du Congo', 'Rawbank', 'Équatoriale Banque'],
    interlocuteursExternesSortant: ['Rawbank', 'Équatoriale Banque', 'Fournisseurs ARMP'],
  },

  // ── DAF / Finance et Comptabilité / Comptabilité Analytique (30) ─────────
  {
    directionId: '8', directionNom: 'Direction Administrative et Financière',
    serviceId: '30', serviceNom: 'Service Comptabilité Analytique',
    sujetsEntrant: [
      'Demande de justification des coûts — projet {ref}',
      'Rapport d\'analyse des charges par centre de coût — T{trim} {annee}',
      'Transmission des données de consommation budgétaire',
    ],
    sujetsSort: [
      'Tableau de bord analytique — T{trim} {annee}',
      'Rapport de suivi des coûts par direction — {annee}',
      'Note de réallocation budgétaire analytique — {annee}',
      'Rapport de variance budgétaire — {mois} {annee}',
    ],
    interlocuteursExternesEntrant: ['Contrôle Budgétaire — Ministère des Finances'],
    interlocuteursExternesSortant: ['Direction Générale ARMP', 'Ministère des Finances'],
  },

  // ── DAF / Facturation et Recouvrement / Facturation (31) ─────────────────
  {
    directionId: '8', directionNom: 'Direction Administrative et Financière',
    serviceId: '31', serviceNom: 'Service Facturation',
    sujetsEntrant: [
      'Contestation de facture N°{ref} — {entite}',
      'Demande de duplicata de facture — {entite}',
      'Accusé de réception — facture ARMP N°{ref}',
      'Demande de proforma — redevance de régulation {annee}',
    ],
    sujetsSort: [
      'Facture de redevance de régulation N°{ref}/{annee} — {entite}',
      'Avis d\'échéance — redevance trimestrielle T{trim} {annee}',
      'État récapitulatif des factures émises — T{trim} {annee}',
      'Relance pour règlement — facture N°{ref} — {entite}',
    ],
    interlocuteursExternesEntrant: ['REGIDESO', 'SNEL', 'Mairie de Kinshasa', 'Province du Kasaï Central'],
    interlocuteursExternesSortant: ['REGIDESO', 'SNEL', 'Mairie de Kinshasa', 'Entités contractantes'],
  },

  // ── DAF / Facturation et Recouvrement / Recouvrement (32) ────────────────
  {
    directionId: '8', directionNom: 'Direction Administrative et Financière',
    serviceId: '32', serviceNom: 'Service Recouvrement',
    sujetsEntrant: [
      'Promesse de paiement — {entite} — facture N°{ref}',
      'Demande d\'échelonnement — dette {entite} — {montant} CDF',
      'Saisine pour recouvrement forcé — {entite}',
      'Attestation de bonne situation fiscale — {entite}',
    ],
    sujetsSort: [
      'Mise en demeure de paiement N°{seq}/{annee} — {entite}',
      'Rapport de recouvrement mensuel — {mois} {annee}',
      'Saisine de la DGRAD pour recouvrement — {entite}',
      'Rapport de situation des créances — T{trim} {annee}',
    ],
    interlocuteursExternesEntrant: ['DGRAD', 'REGIDESO (débiteur)', 'SNEL (débiteur)', 'Gouvernorat débiteur'],
    interlocuteursExternesSortant: ['DGRAD', 'Entités débitrices', 'Huissier de Justice'],
  },

  // ── Direction Formation et Appuis Techniques (9) ─────────────────────────
  {
    directionId: '9', directionNom: 'Direction de la Formation et des Appuis Techniques',
    sujetsEntrant: [
      'Demande de formation sur les marchés publics — {entite}',
      'Rapport de session de formation — {lieu} — {annee}',
      'Évaluation des besoins en formation — Province {province}',
      'Demande d\'appui technique — {entite}',
      'Compte rendu de mission d\'appui — {entite} — T{trim} {annee}',
    ],
    sujetsSort: [
      'Programme de formation annuel {annee} — DFAT',
      'Convocation à la session de formation — {lieu} — {date}',
      'Rapport annuel de la DFAT — {annee}',
      'Note de mission — appui technique à {entite}',
      'Manuel de formation révisé — passation des marchés publics {annee}',
    ],
    interlocuteursExternesEntrant: ['Province du Kasaï', 'Mairie de Matadi', 'Université de Lubumbashi', 'Programme PRCG'],
    interlocuteursExternesSortant: ['Province du Nord-Kivu', 'Mairie de Kisangani', 'Entités contractantes provinciales'],
  },

  // ── DFAT / Formation des Acteurs (33) ─────────────────────────────────────
  {
    directionId: '9', directionNom: 'Direction de la Formation et des Appuis Techniques',
    serviceId: '33', serviceNom: 'Service Formation des Acteurs',
    sujetsEntrant: [
      'Liste des participants — session formation {lieu} {annee}',
      'Rapport de formation des acteurs — {province}',
      'Évaluation post-formation — {province} — T{trim} {annee}',
      'Demande de matériels pédagogiques — {province}',
      'Retour d\'expérience formation — {entite}',
    ],
    sujetsSort: [
      'Attestations de formation — session {lieu} {annee}',
      'Programme détaillé de formation — {lieu} {date}',
      'Rapport de mission de formation — {province}',
      'Convocation — formation des acteurs — {lieu}',
    ],
    interlocuteursExternesEntrant: ['Gouvernorat du Haut-Katanga', 'Gouvernorat du Kasaï Oriental', 'ONG Transparence RDC'],
    interlocuteursExternesSortant: ['Gouvernorat du Haut-Katanga', 'Entités contractantes de Lubumbashi'],
  },

  // ── DFAT / Appuis Techniques (34) ─────────────────────────────────────────
  {
    directionId: '9', directionNom: 'Direction de la Formation et des Appuis Techniques',
    serviceId: '34', serviceNom: 'Service Appuis et Accompagnement',
    sujetsEntrant: [
      'Demande d\'accompagnement pour DAO — marché {ref} — {entite}',
      'Rapport de mission d\'accompagnement — {entite}',
      'Demande de révision du plan de passation — {entite}',
      'Sollicitation d\'avis technique — procédure restreinte — {entite}',
    ],
    sujetsSort: [
      'Rapport d\'appui technique — {entite} — {annee}',
      'Note d\'accompagnement DAO — marché {ref}',
      'Programme annuel des appuis techniques — {annee}',
      'Fiche de mission d\'appui — {entite}',
    ],
    interlocuteursExternesEntrant: ['REGIDESO', 'SNEL', 'Mairie de Mbandaka'],
    interlocuteursExternesSortant: ['REGIDESO', 'Province de l\'Équateur', 'Mairie de Matadi'],
  },

  // ── Direction PPP (10) ────────────────────────────────────────────────────
  {
    directionId: '10', directionNom: 'Direction de Partenariat Public-Privé',
    sujetsEntrant: [
      'Proposition de partenariat PPP — {partenaire}',
      'Rapport d\'évaluation PPP — {projet}',
      'Demande d\'agrément PPP — {entreprise}',
      'Transmission du dossier de faisabilité PPP — {projet}',
      'Résultats de la consultation PPP — {projet}',
    ],
    sujetsSort: [
      'Avis d\'appel à partenariat — {projet}',
      'Rapport annuel PPP — {annee}',
      'Décision d\'agrément PPP — {entreprise}',
      'Convention de partenariat — {partenaire} — {annee}',
      'Note d\'orientation PPP — secteur {secteur}',
    ],
    interlocuteursExternesEntrant: ['Groupe RAWBANK', 'Orange RDC', 'Vodacom Congo', 'Groupe EGAL'],
    interlocuteursExternesSortant: ['Ministère du Plan', 'Groupe RAWBANK', 'Fédération des Entreprises du Congo'],
  },
];

// ─── Sujets génériques (fallback pour entités non listées dans le CATALOGUE) ──

const INTERLOCUTEURS_GENERIQUES = [
  'Ministère de tutelle',
  'Partenaires institutionnels',
  'Direction Générale ARMP',
  'Entités contractantes',
  'Gouvernorat provincial',
  'Inspection Générale des Finances',
];

function buildGenericSpec(entite: EntiteOrganisationnelle, directionNom: string): EntiteSpec {
  const n = entite.nom;
  return {
    directionId: entite.parentId || entite.id,
    directionNom,
    serviceId: entite.type !== 'direction' && entite.type !== 'direction_generale' ? entite.id : undefined,
    serviceNom: entite.type !== 'direction' && entite.type !== 'direction_generale' ? n : undefined,
    sujetsEntrant: [
      `Rapport d'activité — ${n} — T{trim} {annee}`,
      `Note de transmission adressée à ${n}`,
      `Demande d'information — ${n} — {annee}`,
      `Courrier entrant — ${n} — réf. {ref}`,
      `Correspondance officielle reçue par ${n} — {mois} {annee}`,
    ],
    sujetsSort: [
      `Circulaire ${n} N°{seq}/{annee}`,
      `Note interne — ${n} — T{trim} {annee}`,
      `Rapport transmis par ${n} — {annee}`,
      `Instruction de ${n} aux services`,
      `Compte rendu — ${n} — {annee}`,
    ],
    interlocuteursExternesEntrant: INTERLOCUTEURS_GENERIQUES,
    interlocuteursExternesSortant: INTERLOCUTEURS_GENERIQUES,
  };
}

/**
 * Construit la liste complète des specs de seed en fusionnant :
 * 1. Les entités réelles chargées depuis l'API (ou le cache)
 * 2. Le CATALOGUE statique comme source de sujets spécialisés
 *
 * Pour chaque entité active (direction, division, service, sous-service, bureau) :
 *   - Si une entrée du CATALOGUE correspond (même directionId + serviceId), on l'utilise.
 *   - Sinon, on génère des sujets génériques via buildGenericSpec().
 * Les entités de type direction_generale sont couvertes par l'entrée directionId='1'.
 */
function buildDynamicSpecs(allEntites: EntiteOrganisationnelle[]): EntiteSpec[] {
  const active = allEntites.filter(e => e.actif !== false && e.type !== 'direction_generale' && e.type !== 'cellule');

  // Index du CATALOGUE par clé "directionId|serviceId" (serviceId vide si absent)
  const catalogueIndex = new Map<string, EntiteSpec>();
  for (const spec of CATALOGUE) {
    const key = `${spec.directionId}|${spec.serviceId ?? ''}`;
    catalogueIndex.set(key, spec);
  }

  // Résoudre le nom de la direction racine pour une entité donnée
  const resolveDirectionNom = (entite: EntiteOrganisationnelle): string => {
    let current: EntiteOrganisationnelle | undefined = entite;
    while (current) {
      if (current.type === 'direction' || current.type === 'direction_generale') return current.nom;
      current = current.parentId ? allEntites.find(e => e.id === current!.parentId) : undefined;
    }
    return entite.nom;
  };

  // Résoudre l'ID de la direction racine pour une entité donnée
  const resolveDirectionId = (entite: EntiteOrganisationnelle): string => {
    let current: EntiteOrganisationnelle | undefined = entite;
    while (current) {
      if (current.type === 'direction' || current.type === 'direction_generale') return current.id;
      current = current.parentId ? allEntites.find(e => e.id === current!.parentId) : undefined;
    }
    return entite.id;
  };

  const specs: EntiteSpec[] = [];
  const seen = new Set<string>();

  for (const entite of active) {
    const directionId = resolveDirectionId(entite);
    const serviceId = (entite.type === 'direction' || entite.type === 'direction_generale') ? '' : entite.id;
    const key = `${directionId}|${serviceId}`;

    if (seen.has(key)) continue;
    seen.add(key);

    const catalogueSpec = catalogueIndex.get(key);
    if (catalogueSpec) {
      specs.push(catalogueSpec);
    } else {
      const directionNom = resolveDirectionNom(entite);
      specs.push(buildGenericSpec(entite, directionNom));
    }
  }

  // S'assurer que les entités du CATALOGUE non présentes en base sont quand même incluses
  for (const spec of CATALOGUE) {
    const key = `${spec.directionId}|${spec.serviceId ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      specs.push(spec);
    }
  }

  return specs.length > 0 ? specs : CATALOGUE;
}

// ─── Variables de remplacement dans les sujets ───────────────────────────────

const ANNEES = [2023, 2024, 2025];
const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const TRIMESTRES = [1, 2, 3, 4];
const PROVINCES = ['Haut-Katanga', 'Kasaï Central', 'Nord-Kivu', 'Équateur', 'Kongo Central', 'Maniema', 'Ituri', 'Tanganyika'];
const POSTES = ['Chargé de passation des marchés', 'Juriste', 'Expert financier', 'Analyste statistique', 'Informaticien', 'Secrétaire de direction'];
const CANDIDATS = ['M. Mutombo Paul', 'Mme Kabila Aimée', 'M. Nkutu Jacques', 'Mme Mbuyi Hélène', 'M. Kalala Denis'];
const AGENTS = ['M. Tshibanda Robert', 'Mme Nzuzi Cécile', 'M. Lufungula André', 'Mme Kitenge Patience', 'M. Mwamba Serge'];
const FOURNISSEURS = ['SARL Bureautique Plus', 'Kinshasa Motors SARL', 'Imprimerie Moderne Congo', 'Fournisseur Informatique Congo', 'Agence de Sécurité Atlas'];
const BAILLEURS = ['SCI Gombé Immo', 'Propriété Commerciale Kinshasa', 'SICINVEST'];
const ENTITES = ['REGIDESO', 'SNEL', 'Mairie de Kinshasa', 'Province du Kasaï', 'OCC', 'DGRAD', 'Ministère des Travaux Publics'];
const REFS = () => `MP-${pick(ANNEES)}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`;
const MONTANTS = ['2 500 000', '5 000 000', '12 000 000', '48 000 000', '125 000 000', '500 000 000'];
const PARTENAIRES = ['Groupe RAWBANK', 'Orange RDC', 'Vodacom Congo', 'Total Énergies', 'Ciments du Congo'];
const PROJETS = ['Modernisation du portail ARMP', 'Construction du siège provincial', 'Digitalisation des marchés publics', 'Extension réseau fibre optique'];
const SECTEURS = ['numérique', 'énergie', 'infrastructure', 'santé', 'éducation'];
const THEMES = ['Gestion des marchés publics', 'Passation par appel d\'offres', 'Contrôle interne', 'Comptabilité publique', 'Leadership et management'];
const ORGANISMES = ['ECOFI Formation', 'ISTA Kinshasa', 'HEC Afrique', 'Banque Mondiale — PRCG'];

function fillTemplate(tpl: string, seq: number): string {
  const annee = pick(ANNEES);
  const trim = pick(TRIMESTRES);
  return tpl
    .replace(/{annee}/g, String(annee))
    .replace(/{seq}/g, String(seq).padStart(3, '0'))
    .replace(/{trim}/g, String(trim))
    .replace(/{mois}/g, pick(MOIS))
    .replace(/{province}/g, pick(PROVINCES))
    .replace(/{date}/g, `${Math.floor(Math.random() * 28) + 1}/${Math.floor(Math.random() * 12) + 1}/${annee}`)
    .replace(/{poste}/g, pick(POSTES))
    .replace(/{candidat}/g, pick(CANDIDATS))
    .replace(/{agent}/g, pick(AGENTS))
    .replace(/{stagaire}/g, pick(AGENTS))
    .replace(/{direction}/g, pick(['Direction de la Régulation', 'DAF', 'DFAT', 'Direction PPP']))
    .replace(/{fournisseur}/g, pick(FOURNISSEURS))
    .replace(/{bailleur}/g, pick(BAILLEURS))
    .replace(/{entite}/g, pick(ENTITES))
    .replace(/{ref}/g, REFS())
    .replace(/{montant}/g, pick(MONTANTS))
    .replace(/{num}/g, String(Math.floor(Math.random() * 120) + 1))
    .replace(/{partenaire}/g, pick(PARTENAIRES))
    .replace(/{projet}/g, pick(PROJETS))
    .replace(/{secteur}/g, pick(SECTEURS))
    .replace(/{theme}/g, pick(THEMES))
    .replace(/{organisme}/g, pick(ORGANISMES))
    .replace(/{lieu}/g, pick(PROVINCES))
    .replace(/{soumissionnaire}/g, pick(['SARL Bâtitec', 'GCC Congo', 'Constructions Plus', 'Bureau d\'Études KEMA']))
    .replace(/{num}/g, String(Math.floor(Math.random() * 150) + 1));
}

// ─── Fonction principale de seed ─────────────────────────────────────────────

export async function initializeArmpCourriersSeed(
  targetCount: number = 2500,
  onProgress?: (done: number, total: number) => void
): Promise<{ created: number; errors: number }> {

  if (!laravelApiService.isConfigured()) {
    throw new Error('API Laravel non configurée. Configurez VITE_LARAVEL_API_URL avant de lancer le seed.');
  }

  const users = adminService.getAllUsers();
  const secretaire = users.find(u => u.email?.includes('secretaire')) || users[0];
  if (!secretaire) throw new Error('Aucun utilisateur secretaire trouvé.');

  // Charger les entités réelles depuis l'API (ou repli sur les données démo)
  await entiteOrganisationnelleService.refreshFromApi();
  const allEntites = entiteOrganisationnelleService.getAllEntities();
  console.log(`📋 Seed : ${allEntites.length} entités organisationnelles chargées depuis la base.`);

  // Construire les specs dynamiquement depuis les entités réelles + CATALOGUE statique
  const dynamicSpecs = buildDynamicSpecs(allEntites);
  console.log(`📋 Seed : ${dynamicSpecs.length} specs de seed construites (${CATALOGUE.length} cataloguées + ${dynamicSpecs.length - CATALOGUE.length} génériques).`);

  // Index entité par (directionId|serviceId) pour retrouver l'entiteId réel
  const entiteIdIndex = new Map<string, string>();
  for (const e of allEntites) {
    if (e.type === 'direction' || e.type === 'direction_generale') {
      entiteIdIndex.set(`${e.id}|`, e.id);
    } else {
      // Trouver la direction parente
      let cur: EntiteOrganisationnelle | undefined = e;
      while (cur && cur.type !== 'direction' && cur.type !== 'direction_generale') {
        cur = cur.parentId ? allEntites.find(x => x.id === cur!.parentId) : undefined;
      }
      const dirId = cur?.id ?? e.id;
      entiteIdIndex.set(`${dirId}|${e.id}`, e.id);
    }
  }

  let created = 0;
  let errors = 0;
  let seq = 1;
  const year = new Date().getFullYear();

  /**
   * Distribution : chaque spec génère :
   *   - 60% INTERNE (30% entrant + 30% sortant)
   *   - 20% EXTERNE entrant (partenaires/tutelle → ARMP)
   *   - 20% EXTERNE sortant (ARMP → partenaires/tutelle)
   * Les courriers sont générés round-robin sur les specs pour atteindre exactement targetCount.
   */
  // Lot de 100 (max accepté par Laravel bulkStore) — 2500 ÷ 100 = 25 requêtes
  const BATCH = 100;
  // Concurrence : envoyer jusqu'à 5 lots simultanément → ~5x plus rapide
  const CONCURRENCY = 5;
  let batchPayloads: any[] = [];
  let pendingBatches: any[][] = [];
  let total = 0;

  const sendBatch = async (batch: any[]): Promise<void> => {
    if (batch.length === 0) return;
    try {
      const results = await courrierService.createCourriersBulk(batch);
      created += results.length;
      errors += batch.length - results.length;
    } catch {
      // Fallback individuel uniquement en dernier recours
      for (const p of batch) {
        try {
          await courrierService.createCourrier(p);
          created++;
        } catch {
          errors++;
        }
      }
    }
    onProgress?.(created, targetCount);
  };

  const flushParallel = async (): Promise<void> => {
    if (batchPayloads.length > 0) {
      pendingBatches.push([...batchPayloads]);
      batchPayloads = [];
    }
    if (pendingBatches.length === 0) return;
    // Envoyer CONCURRENCY lots en parallèle
    while (pendingBatches.length > 0) {
      const chunk = pendingBatches.splice(0, CONCURRENCY);
      await Promise.all(chunk.map(b => sendBatch(b)));
    }
  };

  // Tableau des modes de génération (pondéré)
  type Mode = 'INT_ENT' | 'INT_SORT' | 'EXT_ENT' | 'EXT_SORT';
  const MODES: Mode[] = [
    'INT_ENT', 'INT_ENT', 'INT_ENT',
    'INT_SORT', 'INT_SORT', 'INT_SORT',
    'EXT_ENT', 'EXT_ENT',
    'EXT_SORT', 'EXT_SORT',
  ];

  let specIdx = 0;
  let modeIdx = 0;

  if (dynamicSpecs.length === 0) return { created: 0, errors: 0 };

  while (total < targetCount) {
    const spec = dynamicSpecs[specIdx % dynamicSpecs.length];
    const mode: Mode = MODES[modeIdx % MODES.length];
    specIdx++;
    modeIdx++;
    total++;

    const dateReception = randDate(730);
    const priorite = randPriorite();

    // Résoudre l'entiteId réel depuis l'index (pour la traçabilité)
    const entiteKey = `${spec.directionId}|${spec.serviceId ?? ''}`;
    const entiteId = entiteIdIndex.get(entiteKey) ?? spec.serviceId ?? spec.directionId;

    if (mode === 'INT_ENT') {
      const objet = fillTemplate(pick(spec.sujetsEntrant), seq++);
      const expediteur = pick([
        ...spec.interlocuteursExternesEntrant,
        // un tiers des entrants internes vient d'une autre direction ARMP
        'Direction de la Régulation', 'DAF', 'Direction des Statistiques et de la Communication',
        'Direction de la Formation et des Appuis Techniques',
      ]);
      batchPayloads.push({
        type: TypeCourrier.INTERNE,
        sens: SensCourrier.ENTRANT,
        dateReception,
        expediteur,
        destinataire: spec.serviceNom || spec.directionNom,
        objet,
        priorite,
        statut: randStatut(SensCourrier.ENTRANT),
        enregistrePar: secretaire.id,
        direction: spec.directionNom,
        service: spec.serviceNom || undefined,
        extraFields: {
          referenceInterne: refInterne(spec.directionId, year, seq),
          entiteId,
          directionId: spec.directionId,
          serviceId: spec.serviceId || undefined,
        },
      });
    } else if (mode === 'INT_SORT') {
      const objet = fillTemplate(pick(spec.sujetsSort), seq++);
      batchPayloads.push({
        type: TypeCourrier.INTERNE,
        sens: SensCourrier.SORTANT,
        dateReception,
        expediteur: spec.serviceNom || spec.directionNom,
        destinataire: pick([
          ...spec.interlocuteursExternesSortant,
          'Direction de la Régulation', 'DAF', 'Direction Générale',
          'Direction de la Formation et des Appuis Techniques',
        ]),
        objet,
        priorite,
        statut: randStatut(SensCourrier.SORTANT),
        enregistrePar: secretaire.id,
        direction: spec.directionNom,
        service: spec.serviceNom || undefined,
        extraFields: {
          referenceInterne: refInterne(spec.directionId, year, seq),
          entiteId,
          directionId: spec.directionId,
          serviceId: spec.serviceId || undefined,
        },
      });
    } else if (mode === 'EXT_ENT') {
      const objet = fillTemplate(pick(spec.sujetsEntrant), seq++);
      batchPayloads.push({
        type: TypeCourrier.EXTERNE,
        sens: SensCourrier.ENTRANT,
        dateReception,
        expediteur: pick(spec.interlocuteursExternesEntrant),
        destinataire: spec.serviceNom || spec.directionNom,
        objet,
        priorite,
        statut: randStatut(SensCourrier.ENTRANT),
        enregistrePar: secretaire.id,
        direction: spec.directionNom,
        service: spec.serviceNom || undefined,
        extraFields: {
          referenceExterne: `REF-EXT-${year}-${String(seq).padStart(4, '0')}`,
          entiteId,
          directionId: spec.directionId,
          serviceId: spec.serviceId || undefined,
        },
      });
    } else {
      const objet = fillTemplate(pick(spec.sujetsSort), seq++);
      batchPayloads.push({
        type: TypeCourrier.EXTERNE,
        sens: SensCourrier.SORTANT,
        dateReception,
        expediteur: spec.serviceNom || spec.directionNom,
        destinataire: pick(spec.interlocuteursExternesSortant),
        objet,
        priorite,
        statut: randStatut(SensCourrier.SORTANT),
        enregistrePar: secretaire.id,
        direction: spec.directionNom,
        service: spec.serviceNom || undefined,
        extraFields: {
          referenceExterne: `ARMP-OUT-${year}-${String(seq).padStart(4, '0')}`,
          entiteId,
          directionId: spec.directionId,
          serviceId: spec.serviceId || undefined,
        },
      });
    }

    if (batchPayloads.length >= BATCH) {
      pendingBatches.push([...batchPayloads]);
      batchPayloads = [];
      // Déclencher l'envoi parallèle dès qu'on a CONCURRENCY lots en attente
      if (pendingBatches.length >= CONCURRENCY) await flushParallel();
    }
  }

  await flushParallel();

  console.log(`✅ Seed ARMP terminé : ${created} courriers créés, ${errors} erreurs.`);
  return { created, errors };
}
