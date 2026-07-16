/**
 * Helpers pour la conversion de données Firestore
 */

import { Timestamp } from 'firebase/firestore';

/**
 * Convertir un Timestamp Firestore en Date JavaScript
 */
export const timestampToDate = (timestamp: Timestamp | Date | string | null | undefined): Date | null => {
  if (!timestamp) return null;
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp === 'string') return new Date(timestamp);
  if (timestamp instanceof Timestamp) return timestamp.toDate();
  return null;
};

/**
 * Convertir une Date JavaScript en Timestamp Firestore
 */
export const dateToTimestamp = (date: Date | string | null | undefined): Timestamp | null => {
  if (!date) return null;
  const dateObj = date instanceof Date ? date : new Date(date);
  if (isNaN(dateObj.getTime())) return null;
  return Timestamp.fromDate(dateObj);
};

/**
 * Convertir un document Firestore en objet avec dates converties
 */
export const convertFirestoreDoc = <T extends Record<string, any>>(doc: any): T => {
  const data = doc.data ? doc.data() : doc;
  const id = doc.id || data.id;
  
  const converted: any = { id, ...data };
  
  // Convertir tous les Timestamps en Dates
  for (const key in converted) {
    if (converted[key] instanceof Timestamp) {
      converted[key] = converted[key].toDate();
    } else if (converted[key] && typeof converted[key] === 'object' && !Array.isArray(converted[key])) {
      // Récursivement convertir les objets imbriqués
      converted[key] = convertFirestoreDoc(converted[key]);
    }
  }
  
  return converted as T;
};

/**
 * Préparer un objet pour l'écriture dans Firestore (convertir les Dates en Timestamps)
 * Supprime également les valeurs undefined car Firestore ne les accepte pas
 */
export const prepareForFirestore = <T extends Record<string, any>>(data: T): any => {
  const prepared: any = {};
  
  for (const key in data) {
    const value = data[key];
    
    // Ignorer les valeurs undefined (Firestore ne les accepte pas)
    if (value === undefined) {
      continue;
    }
    
    // Vérifier si c'est une Date (en utilisant une vérification plus sûre)
    if (value && typeof value === 'object' && value.constructor === Date) {
      prepared[key] = Timestamp.fromDate(value as Date);
    } else if (value && typeof value === 'object' && !Array.isArray(value) && value.constructor !== Date) {
      // Récursivement préparer les objets imbriqués
      prepared[key] = prepareForFirestore(value);
    } else {
      prepared[key] = value;
    }
  }
  
  return prepared;
};

