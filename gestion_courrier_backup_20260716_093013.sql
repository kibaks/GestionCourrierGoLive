-- MySQL dump 10.13  Distrib 8.0.46, for Linux (x86_64)
--
-- Host: localhost    Database: gestion_courrier
-- ------------------------------------------------------
-- Server version	8.0.46-0ubuntu0.24.04.3

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `annotations`
--

DROP TABLE IF EXISTS `annotations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `annotations` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `courrier_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_by` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contenu` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `workflow_etape_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fichiers` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `annotations_courrier_id_index` (`courrier_id`),
  KEY `annotations_courrier_id_created_at_index` (`courrier_id`,`created_at`),
  CONSTRAINT `annotations_courrier_id_foreign` FOREIGN KEY (`courrier_id`) REFERENCES `courriers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `annotations`
--

LOCK TABLES `annotations` WRITE;
/*!40000 ALTER TABLE `annotations` DISABLE KEYS */;
/*!40000 ALTER TABLE `annotations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `assignations`
--

DROP TABLE IF EXISTS `assignations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `assignations` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `courrier_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `assigne_a` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `assigne_par` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date_assignation` datetime NOT NULL,
  `date_echeance` datetime DEFAULT NULL,
  `statut` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EN_ATTENTE',
  `instructions` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `assignations_courrier_id_index` (`courrier_id`),
  KEY `assignations_assigne_a_index` (`assigne_a`),
  KEY `assignations_assigne_a_date_assignation_index` (`assigne_a`,`date_assignation`),
  CONSTRAINT `assignations_courrier_id_foreign` FOREIGN KEY (`courrier_id`) REFERENCES `courriers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `assignations`
--

LOCK TABLES `assignations` WRITE;
/*!40000 ALTER TABLE `assignations` DISABLE KEYS */;
/*!40000 ALTER TABLE `assignations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `config`
--

DROP TABLE IF EXISTS `config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `config` (
  `key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `config`
--

LOCK TABLES `config` WRITE;
/*!40000 ALTER TABLE `config` DISABLE KEYS */;
/*!40000 ALTER TABLE `config` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `courrier_fichiers`
--

DROP TABLE IF EXISTS `courrier_fichiers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `courrier_fichiers` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nom` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `courrier_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `parent_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `chemin` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `extension` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `taille` bigint unsigned DEFAULT NULL,
  `est_accuse_reception` tinyint(1) NOT NULL DEFAULT '0',
  `cree_par` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `courrier_fichiers_courrier_id_index` (`courrier_id`),
  KEY `courrier_fichiers_parent_id_index` (`parent_id`),
  CONSTRAINT `courrier_fichiers_courrier_id_foreign` FOREIGN KEY (`courrier_id`) REFERENCES `courriers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `courrier_fichiers`
--

LOCK TABLES `courrier_fichiers` WRITE;
/*!40000 ALTER TABLE `courrier_fichiers` DISABLE KEYS */;
/*!40000 ALTER TABLE `courrier_fichiers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `courrier_folder_maps`
--

DROP TABLE IF EXISTS `courrier_folder_maps`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `courrier_folder_maps` (
  `user_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `map` json DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `courrier_folder_maps`
--

LOCK TABLES `courrier_folder_maps` WRITE;
/*!40000 ALTER TABLE `courrier_folder_maps` DISABLE KEYS */;
/*!40000 ALTER TABLE `courrier_folder_maps` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `courrier_folders`
--

DROP TABLE IF EXISTS `courrier_folders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `courrier_folders` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `parent_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `color` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `visibility` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'private',
  `direction` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `service` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `courrier_folders_user_id_parent_id_index` (`user_id`,`parent_id`),
  KEY `courrier_folders_user_id_index` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `courrier_folders`
--

LOCK TABLES `courrier_folders` WRITE;
/*!40000 ALTER TABLE `courrier_folders` DISABLE KEYS */;
/*!40000 ALTER TABLE `courrier_folders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `courriers`
--

DROP TABLE IF EXISTS `courriers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `courriers` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `numero` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sens` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_reception` date NOT NULL,
  `date_enregistrement` datetime NOT NULL,
  `expediteur` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `destinataire` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `objet` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `priorite` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'NORMALE',
  `statut` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ENREGISTRE',
  `enregistre_par` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `direction` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `service` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fichier` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `extra_fields` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `courriers_numero_unique` (`numero`),
  KEY `courriers_enregistre_par_index` (`enregistre_par`),
  KEY `courriers_date_enregistrement_index` (`date_enregistrement`),
  KEY `courriers_type_date_enregistrement_index` (`type`,`date_enregistrement`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `courriers`
--

LOCK TABLES `courriers` WRITE;
/*!40000 ALTER TABLE `courriers` DISABLE KEYS */;
/*!40000 ALTER TABLE `courriers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `departements`
--

DROP TABLE IF EXISTS `departements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `departements` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nom` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `responsable_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parent_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `actif` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `departements_parent_id_index` (`parent_id`),
  KEY `departements_actif_index` (`actif`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `departements`
--

LOCK TABLES `departements` WRITE;
/*!40000 ALTER TABLE `departements` DISABLE KEYS */;
/*!40000 ALTER TABLE `departements` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `entite_type_definitions`
--

DROP TABLE IF EXISTS `entite_type_definitions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `entite_type_definitions` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `libelle_singulier` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `libelle_pluriel` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `icone` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ordre` int unsigned NOT NULL DEFAULT '0',
  `actif` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `entite_type_definitions_code_unique` (`code`),
  KEY `entite_type_definitions_ordre_index` (`ordre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `entite_type_definitions`
--

LOCK TABLES `entite_type_definitions` WRITE;
/*!40000 ALTER TABLE `entite_type_definitions` DISABLE KEYS */;
/*!40000 ALTER TABLE `entite_type_definitions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `entites_organisationnelles`
--

DROP TABLE IF EXISTS `entites_organisationnelles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `entites_organisationnelles` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nom` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `parent_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ordre` int unsigned NOT NULL DEFAULT '0',
  `actif` tinyint(1) NOT NULL DEFAULT '1',
  `responsable_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `entites_organisationnelles_type_index` (`type`),
  KEY `entites_organisationnelles_parent_id_index` (`parent_id`),
  KEY `entites_organisationnelles_type_parent_id_index` (`type`,`parent_id`),
  KEY `entites_organisationnelles_responsable_id_foreign` (`responsable_id`),
  CONSTRAINT `entites_organisationnelles_responsable_id_foreign` FOREIGN KEY (`responsable_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `entites_organisationnelles`
--

LOCK TABLES `entites_organisationnelles` WRITE;
/*!40000 ALTER TABLE `entites_organisationnelles` DISABLE KEYS */;
/*!40000 ALTER TABLE `entites_organisationnelles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `migrations`
--

DROP TABLE IF EXISTS `migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `migrations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `migration` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `batch` int NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `migrations`
--

LOCK TABLES `migrations` WRITE;
/*!40000 ALTER TABLE `migrations` DISABLE KEYS */;
INSERT INTO `migrations` VALUES (1,'2019_12_14_000001_create_personal_access_tokens_table',1),(2,'2024_02_01_000000_create_courriers_table',1),(3,'2024_02_01_000001_create_courrier_fichiers_table',1),(4,'2024_02_01_000002_create_users_table',1),(5,'2024_02_01_000003_create_assignations_table',1),(6,'2024_02_01_000004_create_annotations_table',1),(7,'2024_02_01_000005_create_workflow_etapes_table',1),(8,'2024_02_01_000006_create_rappels_table',1),(9,'2024_02_01_000007_create_config_table',1),(10,'2024_02_01_000008_create_roles_table',1),(11,'2024_02_01_000009_create_departements_table',1),(12,'2024_02_01_000010_create_entite_type_definitions_table',1),(13,'2024_02_01_000011_create_entites_organisationnelles_table',1),(14,'2024_02_01_000012_create_responsabilite_definitions_table',1),(15,'2024_02_01_000013_create_courrier_folders_table',1),(16,'2024_02_01_000014_create_courrier_folder_maps_table',1),(17,'2024_06_11_000000_modify_duree_estimee_decimal',1),(18,'2025_02_06_000000_add_sens_to_courriers_table',1),(19,'2025_03_01_000001_add_entite_id_to_users_table',1),(20,'2025_03_01_000002_add_responsable_id_to_entites_organisationnelles_table',1),(21,'2026_03_13_142030_create_notifications_table',1),(22,'2026_04_11_061535_add_folder_id_to_courriers_table',1),(23,'2026_04_14_230000_add_visibility_to_courrier_folders_table',1);
/*!40000 ALTER TABLE `migrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `priority` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal',
  `read` tinyint(1) NOT NULL DEFAULT '0',
  `readAt` timestamp NULL DEFAULT NULL,
  `relatedId` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `relatedType` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `actionUrl` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `notifications_userid_index` (`userId`),
  KEY `notifications_userid_read_index` (`userId`,`read`),
  KEY `notifications_userid_type_index` (`userId`,`type`),
  KEY `notifications_created_at_index` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `personal_access_tokens`
--

DROP TABLE IF EXISTS `personal_access_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `personal_access_tokens` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tokenable_type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tokenable_id` bigint unsigned NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `token` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `abilities` text COLLATE utf8mb4_unicode_ci,
  `last_used_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `personal_access_tokens_token_unique` (`token`),
  KEY `personal_access_tokens_tokenable_type_tokenable_id_index` (`tokenable_type`,`tokenable_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `personal_access_tokens`
--

LOCK TABLES `personal_access_tokens` WRITE;
/*!40000 ALTER TABLE `personal_access_tokens` DISABLE KEYS */;
/*!40000 ALTER TABLE `personal_access_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `rappels`
--

DROP TABLE IF EXISTS `rappels`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rappels` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `assignation_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `courrier_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date_rappel` datetime NOT NULL,
  `envoye` tinyint(1) NOT NULL DEFAULT '0',
  `envoye_at` datetime DEFAULT NULL,
  `message` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `rappels_assignation_id_index` (`assignation_id`),
  KEY `rappels_envoye_date_rappel_index` (`envoye`,`date_rappel`),
  KEY `rappels_courrier_id_foreign` (`courrier_id`),
  CONSTRAINT `rappels_assignation_id_foreign` FOREIGN KEY (`assignation_id`) REFERENCES `assignations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `rappels_courrier_id_foreign` FOREIGN KEY (`courrier_id`) REFERENCES `courriers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rappels`
--

LOCK TABLES `rappels` WRITE;
/*!40000 ALTER TABLE `rappels` DISABLE KEYS */;
/*!40000 ALTER TABLE `rappels` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `responsabilite_definitions`
--

DROP TABLE IF EXISTS `responsabilite_definitions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `responsabilite_definitions` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `libelle` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `niveau` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `responsabilite_definitions_code_unique` (`code`),
  KEY `responsabilite_definitions_niveau_index` (`niveau`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `responsabilite_definitions`
--

LOCK TABLES `responsabilite_definitions` WRITE;
/*!40000 ALTER TABLE `responsabilite_definitions` DISABLE KEYS */;
/*!40000 ALTER TABLE `responsabilite_definitions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nom` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `permissions` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `roles_code_unique` (`code`),
  KEY `roles_code_index` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `roles`
--

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'AGENT',
  `direction` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `service` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entite_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `actif` tinyint(1) NOT NULL DEFAULT '1',
  `remember_token` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`),
  KEY `users_role_index` (`role`),
  KEY `users_direction_service_index` (`direction`,`service`),
  KEY `users_entite_id_foreign` (`entite_id`),
  CONSTRAINT `users_entite_id_foreign` FOREIGN KEY (`entite_id`) REFERENCES `entites_organisationnelles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `workflow_etapes`
--

DROP TABLE IF EXISTS `workflow_etapes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workflow_etapes` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `courrier_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `etape` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `assigne_a` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `statut` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EN_ATTENTE',
  `date_debut` datetime DEFAULT NULL,
  `date_fin` datetime DEFAULT NULL,
  `commentaire` text COLLATE utf8mb4_unicode_ci,
  `cree_par` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `duree_estimee` decimal(5,2) DEFAULT NULL,
  `declencheur` json DEFAULT NULL,
  `ordre` int unsigned DEFAULT NULL,
  `est_condition` tinyint(1) NOT NULL DEFAULT '0',
  `action_si_vrai` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action_si_faux` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `responses` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `workflow_etapes_courrier_id_index` (`courrier_id`),
  KEY `workflow_etapes_assigne_a_index` (`assigne_a`),
  CONSTRAINT `workflow_etapes_courrier_id_foreign` FOREIGN KEY (`courrier_id`) REFERENCES `courriers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `workflow_etapes`
--

LOCK TABLES `workflow_etapes` WRITE;
/*!40000 ALTER TABLE `workflow_etapes` DISABLE KEYS */;
/*!40000 ALTER TABLE `workflow_etapes` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  9:30:14
