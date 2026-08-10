-- Migrations Laravel Gestion Courrier
-- Exécuter avec: mysql -u root -P 3307 < database/run-migrations.sql
-- Ou port 3306: mysql -u root -P 3306 < database/run-migrations.sql

CREATE DATABASE IF NOT EXISTS gestion_courrier CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE gestion_courrier;

-- Migration: create_courriers_table
CREATE TABLE IF NOT EXISTS courriers (
    id CHAR(36) NOT NULL PRIMARY KEY,
    numero VARCHAR(64) NOT NULL,
    type VARCHAR(16) NOT NULL,
    date_reception DATE NOT NULL,
    date_enregistrement DATETIME NOT NULL,
    expediteur VARCHAR(255) NOT NULL,
    destinataire VARCHAR(255) NOT NULL,
    objet VARCHAR(255) NOT NULL,
    priorite VARCHAR(16) NOT NULL DEFAULT 'NORMALE',
    statut VARCHAR(32) NOT NULL DEFAULT 'ENREGISTRE',
    enregistre_par VARCHAR(255) NOT NULL,
    direction VARCHAR(255) NULL,
    service VARCHAR(255) NULL,
    fichier VARCHAR(255) NULL,
    extra_fields JSON NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY courriers_numero_unique (numero),
    KEY courriers_enregistre_par_index (enregistre_par),
    KEY courriers_date_enregistrement_index (date_enregistrement),
    KEY courriers_type_date_enregistrement_index (type, date_enregistrement)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration: create_courrier_fichiers_table
CREATE TABLE IF NOT EXISTS courrier_fichiers (
    id CHAR(36) NOT NULL PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    type VARCHAR(16) NOT NULL,
    courrier_id CHAR(36) NOT NULL,
    parent_id CHAR(36) NULL,
    chemin VARCHAR(512) NULL,
    extension VARCHAR(32) NULL,
    taille BIGINT UNSIGNED NULL,
    est_accuse_reception TINYINT(1) NOT NULL DEFAULT 0,
    cree_par VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    KEY courrier_fichiers_courrier_id_index (courrier_id),
    KEY courrier_fichiers_parent_id_index (parent_id),
    CONSTRAINT courrier_fichiers_courrier_id_foreign
        FOREIGN KEY (courrier_id) REFERENCES courriers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration: create_users_table (JWT + permissions alignés Firebase)
CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    email_verified_at TIMESTAMP NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'AGENT',
    direction VARCHAR(255) NULL,
    service VARCHAR(255) NULL,
    actif TINYINT(1) NOT NULL DEFAULT 1,
    remember_token VARCHAR(100) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY users_email_unique (email),
    KEY users_role_index (role),
    KEY users_direction_service_index (direction, service)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration: create_assignations_table (filtrage courriers accessibles)
CREATE TABLE IF NOT EXISTS assignations (
    id CHAR(36) NOT NULL PRIMARY KEY,
    courrier_id CHAR(36) NOT NULL,
    assigne_a CHAR(36) NOT NULL,
    assigne_par CHAR(36) NOT NULL,
    date_assignation DATETIME NOT NULL,
    date_echeance DATETIME NULL,
    statut VARCHAR(32) NOT NULL DEFAULT 'EN_ATTENTE',
    instructions TEXT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    KEY assignations_courrier_id_index (courrier_id),
    KEY assignations_assigne_a_index (assigne_a),
    KEY assignations_assigne_a_date_index (assigne_a, date_assignation),
    CONSTRAINT assignations_courrier_id_foreign
        FOREIGN KEY (courrier_id) REFERENCES courriers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration: create_workflow_etapes_table (aligné Firebase workflow_etapes)
CREATE TABLE IF NOT EXISTS workflow_etapes (
    id CHAR(36) NOT NULL PRIMARY KEY,
    courrier_id CHAR(36) NOT NULL,
    etape VARCHAR(255) NOT NULL,
    assigne_a CHAR(36) NOT NULL,
    statut VARCHAR(32) NOT NULL DEFAULT 'EN_ATTENTE',
    date_debut DATETIME NULL,
    date_fin DATETIME NULL,
    commentaire TEXT NULL,
    cree_par CHAR(36) NOT NULL,
    duree_estimee SMALLINT UNSIGNED NULL,
    declencheur JSON NULL,
    ordre INT UNSIGNED NULL,
    est_condition TINYINT(1) NOT NULL DEFAULT 0,
    action_si_vrai CHAR(36) NULL,
    action_si_faux CHAR(36) NULL,
    responses JSON NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    KEY workflow_etapes_courrier_id_index (courrier_id),
    KEY workflow_etapes_assigne_a_index (assigne_a),
    CONSTRAINT workflow_etapes_courrier_id_foreign
        FOREIGN KEY (courrier_id) REFERENCES courriers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration: create_annotations_table (aligné Firebase annotations)
CREATE TABLE IF NOT EXISTS annotations (
    id CHAR(36) NOT NULL PRIMARY KEY,
    courrier_id CHAR(36) NOT NULL,
    created_by CHAR(36) NOT NULL,
    contenu TEXT NOT NULL,
    type VARCHAR(32) NOT NULL,
    workflow_etape_id CHAR(36) NULL,
    fichiers JSON NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    KEY annotations_courrier_id_index (courrier_id),
    KEY annotations_courrier_created_index (courrier_id, created_at),
    CONSTRAINT annotations_courrier_id_foreign
        FOREIGN KEY (courrier_id) REFERENCES courriers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration: create_rappels_table (aligné Firebase rappels)
CREATE TABLE IF NOT EXISTS rappels (
    id CHAR(36) NOT NULL PRIMARY KEY,
    assignation_id CHAR(36) NOT NULL,
    courrier_id CHAR(36) NOT NULL,
    date_rappel DATETIME NOT NULL,
    envoye TINYINT(1) NOT NULL DEFAULT 0,
    envoye_at DATETIME NULL,
    message TEXT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    KEY rappels_assignation_id_index (assignation_id),
    KEY rappels_envoye_date_index (envoye, date_rappel),
    CONSTRAINT rappels_assignation_id_foreign
        FOREIGN KEY (assignation_id) REFERENCES assignations (id) ON DELETE CASCADE,
    CONSTRAINT rappels_courrier_id_foreign
        FOREIGN KEY (courrier_id) REFERENCES courriers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration: create_config_table (config formulaire, export, scanners)
CREATE TABLE IF NOT EXISTS config (
    `key` VARCHAR(64) NOT NULL PRIMARY KEY,
    value JSON NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration: create_roles_table (paramétrage rôles)
CREATE TABLE IF NOT EXISTS roles (
    id CHAR(36) NOT NULL PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    code VARCHAR(32) NOT NULL,
    description TEXT NULL,
    permissions JSON NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY roles_code_unique (code),
    KEY roles_code_index (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration: create_departements_table (paramétrage départements)
CREATE TABLE IF NOT EXISTS departements (
    id CHAR(36) NOT NULL PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    code VARCHAR(64) NULL,
    description TEXT NULL,
    responsable_id CHAR(36) NULL,
    parent_id CHAR(36) NULL,
    actif TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    KEY departements_parent_id_index (parent_id),
    KEY departements_actif_index (actif)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration: create_entite_type_definitions_table (types Direction, Service, etc.)
CREATE TABLE IF NOT EXISTS entite_type_definitions (
    id CHAR(36) NOT NULL PRIMARY KEY,
    code VARCHAR(32) NOT NULL,
    libelle_singulier VARCHAR(255) NOT NULL,
    libelle_pluriel VARCHAR(255) NOT NULL,
    description TEXT NULL,
    icone VARCHAR(64) NULL,
    ordre INT UNSIGNED NOT NULL DEFAULT 0,
    actif TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY entite_type_definitions_code_unique (code),
    KEY entite_type_definitions_ordre_index (ordre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration: create_entites_organisationnelles_table (directions, services, sous-services)
CREATE TABLE IF NOT EXISTS entites_organisationnelles (
    id CHAR(36) NOT NULL PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    type VARCHAR(32) NOT NULL,
    description TEXT NULL,
    parent_id CHAR(36) NULL,
    ordre INT UNSIGNED NOT NULL DEFAULT 0,
    actif TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    KEY entites_organisationnelles_type_index (type),
    KEY entites_organisationnelles_parent_id_index (parent_id),
    KEY entites_organisationnelles_type_parent_index (type, parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration: create_responsabilite_definitions_table (paramétrage responsabilités)
CREATE TABLE IF NOT EXISTS responsabilite_definitions (
    id CHAR(36) NOT NULL PRIMARY KEY,
    code VARCHAR(64) NOT NULL,
    libelle VARCHAR(255) NOT NULL,
    description TEXT NULL,
    niveau VARCHAR(32) NOT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY responsabilite_definitions_code_unique (code),
    KEY responsabilite_definitions_niveau_index (niveau)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration: create_courrier_folders_table (dossiers de classement)
CREATE TABLE IF NOT EXISTS courrier_folders (
    id CHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    parent_id CHAR(36) NULL,
    user_id VARCHAR(128) NOT NULL,
    color VARCHAR(32) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    KEY courrier_folders_user_id_index (user_id),
    KEY courrier_folders_user_id_parent_id_index (user_id, parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration: create_courrier_folder_maps_table (mapping courrier -> dossier)
CREATE TABLE IF NOT EXISTS courrier_folder_maps (
    user_id VARCHAR(128) NOT NULL PRIMARY KEY,
    map JSON NULL,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
