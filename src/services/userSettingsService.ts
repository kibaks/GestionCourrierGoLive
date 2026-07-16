/**
 * Service de paramètres utilisateur — localStorage uniquement (pas Firestore).
 * Évite les erreurs "client is offline" lors du chargement de scan_settings, etc.
 */
class UserSettingsService {
  /**
   * Récupère les paramètres depuis localStorage uniquement.
   */
  async getSettings<T>(key: string, defaultValue: T): Promise<T> {
    const cached = this.getFromLocalStorage<T>(key);
    return cached !== null ? cached : defaultValue;
  }

  /**
   * Version synchrone : retourne immédiatement depuis localStorage.
   */
  getSettingsSync<T>(key: string, defaultValue: T): T {
    const cached = this.getFromLocalStorage<T>(key);
    return cached !== null ? cached : defaultValue;
  }

  /**
   * Sauvegarde les paramètres dans localStorage uniquement.
   */
  async saveSettings<T>(key: string, value: T): Promise<void> {
    this.saveToLocalStorage(key, value);
  }

  /**
   * Supprime les paramètres (localStorage uniquement).
   */
  async deleteSettings(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Erreur lors de la suppression des paramètres ${key}:`, error);
    }
  }

  /**
   * Migration désactivée : paramètres gérés uniquement en localStorage.
   */
  async migrateAllSettings(): Promise<void> {
    // No-op : plus de sync Firestore
  }

  private getFromLocalStorage<T>(key: string): T | null {
    try {
      const data = localStorage.getItem(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }

  private saveToLocalStorage<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Erreur lors de la sauvegarde dans localStorage pour ${key}:`, error);
    }
  }
}

export const userSettingsService = new UserSettingsService();

