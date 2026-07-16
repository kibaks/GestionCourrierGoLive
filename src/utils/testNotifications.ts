import { simpleNotificationService } from '../services/simpleNotificationService';
import { NotificationHelper } from '../services/notificationHelper';

/**
 * Fonction de test pour vérifier que les notifications fonctionnent
 */
export const testNotifications = () => {
  console.log('🧪 Démarrage du test de notifications...');
  
  // Test 1: Création directe via simpleNotificationService
  console.log('\n📝 Test 1: Création directe');
  const testUser = 'test-user-id';
  const directNotification = simpleNotificationService.create({
    userId: testUser,
    type: 'system',
    title: 'Test de notification',
    message: 'Ceci est une notification de test directe',
    priority: 'normal'
  });
  console.log('✅ Notification directe créée:', directNotification);
  
  // Test 2: Création via NotificationHelper
  console.log('\n🔔 Test 2: Création via NotificationHelper');
  const helperNotification = NotificationHelper.createCourrierEnregistre({
    userId: testUser,
    courrierId: 'test-courrier-id',
    courrierNumero: 'TEST-001',
    courrierObjet: 'Test de notification'
  });
  console.log('✅ Notification helper créée:', helperNotification);
  
  // Test 3: Récupération des notifications
  console.log('\n📋 Test 3: Récupération des notifications');
  const retrievedNotifications = simpleNotificationService.getByUserId(testUser);
  console.log('📥 Notifications récupérées:', retrievedNotifications);
  console.log('📊 Nombre de notifications:', retrievedNotifications.length);
  
  // Test 4: Vérification localStorage
  console.log('\n💾 Test 4: Vérification localStorage');
  const localStorageData = localStorage.getItem('simple_notifications');
  if (localStorageData) {
    const parsed = JSON.parse(localStorageData);
    console.log('💿 Données localStorage:', parsed.length, 'notifications');
    console.log('🔍 Première notification:', parsed[0]);
  } else {
    console.log('❌ Aucune donnée trouvée dans localStorage');
  }
  
  console.log('\n🏁 Test de notifications terminé');
  return {
    directNotification,
    helperNotification,
    retrievedNotifications,
    localStorageData: localStorageData ? JSON.parse(localStorageData) : null
  };
};

// Exporter pour utilisation dans la console
(window as any).testNotifications = testNotifications;
console.log('💡 Pour tester les notifications, tapez: testNotifications() dans la console');
