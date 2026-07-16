# Migration Firestore → MySQL (Laravel API)

Ce script copie les données des collections Firestore vers la base MySQL **utilisée par l’API Laravel** (`gestion_courrier`). Après exécution, les données sont disponibles via l’API Laravel (MySQL).

## Prérequis

1. **Tables MySQL** : exécuter d’abord les migrations SQL pour créer les tables :
   ```bash
   npm run migrate:mysql
   ```
   (utilise les variables `MYSQL_*` ou `DB_*` du `.env` ; ou en CLI : `mysql -u root -P 3306 -p < laravel-api/database/run-migrations.sql`)

2. **Fichier `.env`** à la racine du projet (ou variables d’environnement) :
   - **Firebase** : `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID` (et optionnellement les autres `VITE_FIREBASE_*`)
   - **MySQL** : `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`  
     Ou les variables Laravel : `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`

3. **Dépendances** : `npm install` (dotenv, mysql2, bcryptjs, tsx sont ajoutés au projet)

## Exécution

1. Créer les tables : `npm run migrate:mysql`
2. Copier les données Firestore : `npm run migrate:firebase-mysql`

## Données migrées

| Firestore | Table MySQL |
|-----------|-------------|
| `utilisateurs` | `users` (mot de passe par défaut hashé : les utilisateurs devront réinitialiser) |
| `courriers` | `courriers` (inclut `sens`, `extra_fields`) |
| `dossiers_fichiers` | `courrier_fichiers` |
| `assignations` | `assignations` |
| `workflow_etapes` | `workflow_etapes` |
| `annotations` | `annotations` |
| `rappels` | `rappels` |
| `entites_organisationnelles` | `entites_organisationnelles` |
| `config/formulaire` (document) | `config` (clé `formulaire`) |

Les enregistrements existants sont mis à jour en cas de doublon (`ON DUPLICATE KEY UPDATE`).

## Utilisateurs migrés

Les comptes Firestore n’ont pas de mot de passe stocké en base. Le script attribue un mot de passe temporaire hashé (bcrypt) à chaque utilisateur migré. **Pensez à demander aux utilisateurs de réinitialiser leur mot de passe** après migration (ou à définir un mot de passe par défaut connu et à le documenter).
