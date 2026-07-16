/**
 * Service de courriers — insertion et persistance via API Laravel (MySQL) uniquement, pas Firestore.
 * Ce fichier exporte courrierServiceFirebase qui délègue à storageSyncService → laravelApiService.
 */

import { courrierServiceFirebase } from './courrierServiceFirebase';

export const courrierService = courrierServiceFirebase;
