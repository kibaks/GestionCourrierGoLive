/**
 * Script de migration des données Firestore → MySQL (gestion_courrier)
 *
 * Prérequis:
 * - npm install dotenv mysql2 bcryptjs (déjà dans le projet si besoin)
 * - .env avec VITE_FIREBASE_* et MYSQL_* (ou DB_* depuis laravel-api/.env)
 * - Les tables MySQL doivent exister (exécuter laravel-api/database/run-migrations.sql avant)
 *
 * Exécution: npm run migrate:firebase-mysql
 */

import 'dotenv/config';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const DEFAULT_PASSWORD_HASH = bcrypt.hashSync('MigreFirebase2024!', 10);

function toDate(v: unknown): Date | null {
  if (v == null) return null;
  if (typeof (v as { toDate?: () => Date }).toDate === 'function') return (v as { toDate: () => Date }).toDate();
  if (v instanceof Date) return v;
  if (typeof v === 'string') return new Date(v);
  return null;
}

function toMysqlDate(d: Date | null): string | null {
  if (!d || isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function firebaseConfig() {
  const apiKey = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId) throw new Error('Variables VITE_FIREBASE_API_KEY et VITE_FIREBASE_PROJECT_ID (ou FIREBASE_*) requises dans .env');
  return {
    apiKey,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || '',
  };
}

async function getMysqlPool() {
  const host = process.env.MYSQL_HOST || process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.MYSQL_PORT || process.env.DB_PORT || 3306);
  const user = process.env.MYSQL_USER || process.env.DB_USERNAME || 'root';
  const password = process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '';
  const database = process.env.MYSQL_DATABASE || process.env.DB_DATABASE || 'gestion_courrier';
  return mysql.createPool({ host, port, user, password, database, waitForConnections: true, connectionLimit: 10 });
}

async function main() {
  console.log('=== Migration Firestore → MySQL ===\n');

  const app = initializeApp(firebaseConfig());
  const db = getFirestore(app);
  const pool = await getMysqlPool();

  const run = async (name: string, fn: () => Promise<number>) => {
    try {
      const n = await fn();
      console.log(`  ${name}: ${n} enregistrement(s)`);
      return n;
    } catch (e) {
      console.error(`  ${name}: ERREUR`, e);
      throw e;
    }
  };

  // 1. Utilisateurs (utilisateurs → users)
  await run('Utilisateurs → users', async () => {
    const snap = await getDocs(collection(db, 'utilisateurs'));
    let count = 0;
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      const id = d.id;
      const name = (data.nom ?? data.name ?? '') as string;
      const email = (data.email ?? '') as string;
      const role = (data.role ?? 'AGENT') as string;
      const direction = (data.direction ?? null) as string | null;
      const service = (data.service ?? null) as string | null;
      const actif = data.actif !== false ? 1 : 0;
      const createdAt = toMysqlDate(toDate(data.dateCreation ?? data.createdAt) ?? new Date());
      const updatedAt = toMysqlDate(toDate(data.dateModification ?? data.updatedAt) ?? new Date());
      const password = DEFAULT_PASSWORD_HASH;
      await pool.execute(
        `INSERT INTO users (id, name, email, password, role, direction, service, actif, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), role=VALUES(role), direction=VALUES(direction), service=VALUES(service), actif=VALUES(actif), updated_at=VALUES(updated_at)`,
        [id, name, email, password, role, direction, service, actif, createdAt, updatedAt]
      );
      count++;
    }
    return count;
  });

  // 2. Courriers
  await run('Courriers → courriers', async () => {
    const snap = await getDocs(collection(db, 'courriers'));
    let count = 0;
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      const id = d.id;
      const numero = (data.numero ?? '') as string;
      const type = (data.type ?? 'EXTERNE') as string;
      const sens = (data.sens ?? null) as string | null;
      const dateReception = toMysqlDate(toDate(data.dateReception)) ?? '1970-01-01';
      const dateEnregistrement = toMysqlDate(toDate(data.dateEnregistrement)) ?? toMysqlDate(new Date()) ?? '1970-01-01 00:00:00';
      const expediteur = (data.expediteur ?? '') as string;
      const destinataire = (data.destinataire ?? '') as string;
      const objet = (data.objet ?? '') as string;
      const priorite = (data.priorite ?? 'NORMALE') as string;
      const statut = (data.statut ?? 'ENREGISTRE') as string;
      const enregistrePar = (data.enregistrePar ?? data.createdBy ?? '') as string;
      const direction = (data.direction ?? null) as string | null;
      const service = (data.service ?? null) as string | null;
      const fichier = (data.fichier ?? null) as string | null;
      const extraFields = data.extraFields != null ? JSON.stringify(data.extraFields) : null;
      const createdAt = toMysqlDate(toDate(data.createdAt) ?? new Date());
      const updatedAt = toMysqlDate(toDate(data.updatedAt) ?? new Date());
      await pool.execute(
        `INSERT INTO courriers (id, numero, type, sens, date_reception, date_enregistrement, expediteur, destinataire, objet, priorite, statut, enregistre_par, direction, service, fichier, extra_fields, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE numero=VALUES(numero), sens=VALUES(sens), statut=VALUES(statut), extra_fields=VALUES(extra_fields), updated_at=VALUES(updated_at)`,
        [id, numero, type, sens, dateReception, dateEnregistrement, expediteur, destinataire, objet, priorite, statut, enregistrePar, direction, service, fichier, extraFields, createdAt, updatedAt]
      );
      count++;
    }
    return count;
  });

  // 3. Dossiers/fichiers (dossiers_fichiers → courrier_fichiers)
  try {
    const snap = await getDocs(collection(db, 'dossiers_fichiers'));
    let count = 0;
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      const id = d.id;
      const nom = (data.nom ?? '') as string;
      const type = (data.type ?? 'fichier') as string;
      const courrierId = (data.courrierId ?? '') as string;
      const parentId = (data.parentId ?? null) as string | null;
      const chemin = (data.chemin ?? null) as string | null;
      const extension = (data.extension ?? null) as string | null;
      const taille = data.taille != null ? Number(data.taille) : null;
      const estAccuseReception = (data.estAccuseReception === true || data.estAccuseReception === 1) ? 1 : 0;
      const creePar = (data.creePar ?? '') as string;
      const createdAt = toMysqlDate(toDate(data.dateCreation ?? data.createdAt) ?? new Date());
      const updatedAt = toMysqlDate(toDate(data.dateModification ?? data.updatedAt) ?? new Date());
      await pool.execute(
        `INSERT INTO courrier_fichiers (id, nom, type, courrier_id, parent_id, chemin, extension, taille, est_accuse_reception, cree_par, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE nom=VALUES(nom), updated_at=VALUES(updated_at)`,
        [id, nom, type, courrierId, parentId, chemin, extension, taille, estAccuseReception, creePar, createdAt, updatedAt]
      );
      count++;
    }
    console.log('  dossiers_fichiers → courrier_fichiers:', count, 'enregistrement(s)');
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'NOT_FOUND' || String(e).includes('not found')) {
      console.log('  dossiers_fichiers: collection absente, ignoré');
    } else {
      console.error('  dossiers_fichiers → courrier_fichiers: ERREUR', e);
      throw e;
    }
  }

  // 4. Assignations
  await run('Assignations → assignations', async () => {
    const snap = await getDocs(collection(db, 'assignations'));
    let count = 0;
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      const id = d.id;
      const courrierId = (data.courrierId ?? '') as string;
      const assigneA = (data.assigneA ?? '') as string;
      const assignePar = (data.assignePar ?? '') as string;
      const dateAssignation = toMysqlDate(toDate(data.dateAssignation) ?? new Date()) ?? '1970-01-01 00:00:00';
      const dateEcheance = toMysqlDate(toDate(data.dateEcheance));
      const statut = (data.statut ?? 'EN_ATTENTE') as string;
      const instructions = (data.instructions ?? null) as string | null;
      const createdAt = toMysqlDate(toDate(data.createdAt) ?? new Date());
      const updatedAt = toMysqlDate(toDate(data.updatedAt) ?? new Date());
      await pool.execute(
        `INSERT INTO assignations (id, courrier_id, assigne_a, assigne_par, date_assignation, date_echeance, statut, instructions, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE statut=VALUES(statut), updated_at=VALUES(updated_at)`,
        [id, courrierId, assigneA, assignePar, dateAssignation, dateEcheance, statut, instructions, createdAt, updatedAt]
      );
      count++;
    }
    return count;
  });

  // 5. Workflow étapes
  await run('Workflow étapes → workflow_etapes', async () => {
    const snap = await getDocs(collection(db, 'workflow_etapes'));
    let count = 0;
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      const id = d.id;
      const courrierId = (data.courrierId ?? '') as string;
      const etape = (data.etape ?? '') as string;
      const assigneA = (data.assigneA ?? '') as string;
      const statut = (data.statut ?? 'EN_ATTENTE') as string;
      const dateDebut = toMysqlDate(toDate(data.dateDebut));
      const dateFin = toMysqlDate(toDate(data.dateFin));
      const commentaire = (data.commentaire ?? null) as string | null;
      const creePar = (data.creePar ?? '') as string;
      const dureeEstimee = data.dureeEstimee != null ? Number(data.dureeEstimee) : null;
      const declencheur = data.declencheur != null ? JSON.stringify(data.declencheur) : null;
      const ordre = data.ordre != null ? Number(data.ordre) : null;
      const estCondition = (data.estCondition === true || data.estCondition === 1) ? 1 : 0;
      const actionSiVrai = (data.actionSiVrai ?? null) as string | null;
      const actionSiFaux = (data.actionSiFaux ?? null) as string | null;
      const responses = data.responses != null ? JSON.stringify(data.responses) : null;
      const createdAt = toMysqlDate(toDate(data.createdAt) ?? new Date());
      const updatedAt = toMysqlDate(toDate(data.updatedAt) ?? new Date());
      await pool.execute(
        `INSERT INTO workflow_etapes (id, courrier_id, etape, assigne_a, statut, date_debut, date_fin, commentaire, cree_par, duree_estimee, declencheur, ordre, est_condition, action_si_vrai, action_si_faux, responses, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE statut=VALUES(statut), updated_at=VALUES(updated_at)`,
        [id, courrierId, etape, assigneA, statut, dateDebut, dateFin, commentaire, creePar, dureeEstimee, declencheur, ordre, estCondition, actionSiVrai, actionSiFaux, responses, createdAt, updatedAt]
      );
      count++;
    }
    return count;
  });

  // 6. Annotations
  await run('Annotations → annotations', async () => {
    const snap = await getDocs(collection(db, 'annotations'));
    let count = 0;
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      const id = d.id;
      const courrierId = (data.courrierId ?? '') as string;
      const createdBy = (data.createdBy ?? data.auteur ?? '') as string;
      const contenu = (data.contenu ?? '') as string;
      const type = (data.type ?? 'COMMENTAIRE') as string;
      const workflowEtapeId = (data.workflowEtapeId ?? null) as string | null;
      const fichiers = data.fichiers != null ? JSON.stringify(data.fichiers) : null;
      const createdAt = toMysqlDate(toDate(data.createdAt) ?? new Date());
      const updatedAt = toMysqlDate(toDate(data.updatedAt) ?? new Date());
      await pool.execute(
        `INSERT INTO annotations (id, courrier_id, created_by, contenu, type, workflow_etape_id, fichiers, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE contenu=VALUES(contenu), updated_at=VALUES(updated_at)`,
        [id, courrierId, createdBy, contenu, type, workflowEtapeId, fichiers, createdAt, updatedAt]
      );
      count++;
    }
    return count;
  });

  // 7. Rappels
  await run('Rappels → rappels', async () => {
    const snap = await getDocs(collection(db, 'rappels'));
    let count = 0;
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      const id = d.id;
      const assignationId = (data.assignationId ?? '') as string;
      const courrierId = (data.courrierId ?? '') as string;
      const dateRappel = toMysqlDate(toDate(data.dateRappel) ?? new Date()) ?? '1970-01-01 00:00:00';
      const envoye = (data.envoye === true || data.envoye === 1) ? 1 : 0;
      const envoyeAt = toMysqlDate(toDate(data.envoyeAt));
      const message = (data.message ?? null) as string | null;
      const createdAt = toMysqlDate(toDate(data.createdAt) ?? new Date());
      const updatedAt = toMysqlDate(toDate(data.updatedAt) ?? new Date());
      await pool.execute(
        `INSERT INTO rappels (id, assignation_id, courrier_id, date_rappel, envoye, envoye_at, message, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE envoye=VALUES(envoye), envoye_at=VALUES(envoye_at), updated_at=VALUES(updated_at)`,
        [id, assignationId, courrierId, dateRappel, envoye, envoyeAt, message, createdAt, updatedAt]
      );
      count++;
    }
    return count;
  });

  // 8. Entités organisationnelles
  await run('Entités → entites_organisationnelles', async () => {
    const snap = await getDocs(collection(db, 'entites_organisationnelles'));
    let count = 0;
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      const id = d.id;
      const nom = (data.nom ?? '') as string;
      const type = (data.type ?? 'service') as string;
      const description = (data.description ?? null) as string | null;
      const parentId = (data.parentId ?? null) as string | null;
      const ordre = data.ordre != null ? Number(data.ordre) : 0;
      const actif = data.actif !== false ? 1 : 0;
      const createdAt = toMysqlDate(toDate(data.createdAt ?? data.dateCreation) ?? new Date());
      const updatedAt = toMysqlDate(toDate(data.updatedAt ?? data.dateModification) ?? new Date());
      await pool.execute(
        `INSERT INTO entites_organisationnelles (id, nom, type, description, parent_id, ordre, actif, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE nom=VALUES(nom), ordre=VALUES(ordre), actif=VALUES(actif), updated_at=VALUES(updated_at)`,
        [id, nom, type, description, parentId, ordre, actif, createdAt, updatedAt]
      );
      count++;
    }
    return count;
  });

  // 9. Config formulaire (document config/formulaire → table config key='formulaire')
  try {
    const configSnap = await getDoc(doc(db, 'config', 'formulaire'));
    if (configSnap.exists()) {
      const value = configSnap.data();
      const valueJson = value != null ? JSON.stringify(value) : null;
      const now = toMysqlDate(new Date()) ?? '1970-01-01 00:00:00';
      await pool.execute(
        `INSERT INTO config (\`key\`, value, created_at, updated_at) VALUES ('formulaire', ?, ?, ?)
         ON DUPLICATE KEY UPDATE value=VALUES(value), updated_at=VALUES(updated_at)`,
        [valueJson, now, now]
      );
      console.log('  config/formulaire → config: 1 enregistrement');
    } else {
      console.log('  config/formulaire: document absent, ignoré');
    }
  } catch (e) {
    console.error('  config/formulaire: ERREUR', e);
  }

  await pool.end();
  console.log('\n=== Migration terminée ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
