-- =====================================================================
-- WardWatch: Neighbourhood Issue Reporter
-- MySQL schema. Run this once:  mysql -u root -p < db/schema.sql
-- Works on MySQL 8.x and MariaDB 10.5+.
-- =====================================================================

DROP DATABASE IF EXISTS wardwatch;
CREATE DATABASE wardwatch CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE wardwatch;

-- ---------------------------------------------------------------------
-- Users: citizens report issues, admins (ward officers) manage them
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  role          ENUM('citizen','admin') NOT NULL DEFAULT 'citizen',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- Categories: each has a triage weight (how serious by default)
-- and a target resolution time in hours (the SLA)
-- ---------------------------------------------------------------------
CREATE TABLE categories (
  code        VARCHAR(30) PRIMARY KEY,
  label       VARCHAR(60) NOT NULL,
  base_weight TINYINT NOT NULL,      -- 1 (minor) to 5 (dangerous)
  sla_hours   INT NOT NULL           -- target time to resolve
);

INSERT INTO categories (code, label, base_weight, sla_hours) VALUES
  ('pothole',       'Pothole',             3, 168),
  ('streetlight',   'Streetlight failure', 3,  72),
  ('waste',         'Waste accumulation',  2,  48),
  ('water_leakage', 'Water leakage',       4,  48),
  ('drainage',      'Blocked drain',       4,  72),
  ('other',         'Something else',      1, 168);

-- ---------------------------------------------------------------------
-- Issues
-- status workflow:
--   submitted -> acknowledged -> in_progress -> resolved -> closed
--   submitted/acknowledged -> rejected (remark required)
--   resolved -> reopened (by reporter) -> in_progress
-- priority           : set/confirmed by the admin
-- suggested_priority : computed automatically from triage_score
-- ---------------------------------------------------------------------
CREATE TABLE issues (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  title              VARCHAR(150) NOT NULL,
  description        TEXT NOT NULL,
  category_code      VARCHAR(30) NOT NULL,
  latitude           DECIMAL(9,6) NOT NULL,
  longitude          DECIMAL(9,6) NOT NULL,
  landmark           VARCHAR(200),
  photo_path         VARCHAR(255),
  status             ENUM('submitted','acknowledged','in_progress','resolved',
                          'closed','reopened','rejected') NOT NULL DEFAULT 'submitted',
  priority           ENUM('low','medium','high','critical') NULL,
  suggested_priority ENUM('low','medium','high','critical') NOT NULL DEFAULT 'low',
  triage_score       INT NOT NULL DEFAULT 0,
  supporters         INT NOT NULL DEFAULT 0,
  reopen_count       INT NOT NULL DEFAULT 0,
  escalated          TINYINT(1) NOT NULL DEFAULT 0,
  remarks            TEXT,
  reporter_id        INT NOT NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  resolved_at        DATETIME NULL,
  closed_at          DATETIME NULL,
  CONSTRAINT fk_issue_category FOREIGN KEY (category_code) REFERENCES categories(code),
  CONSTRAINT fk_issue_reporter FOREIGN KEY (reporter_id)  REFERENCES users(id),
  INDEX idx_status (status),
  INDEX idx_category_status (category_code, status),
  INDEX idx_location (latitude, longitude)
);

-- ---------------------------------------------------------------------
-- "Me too": other residents backing an existing issue instead of
-- filing a duplicate. One row per (issue, user).
-- ---------------------------------------------------------------------
CREATE TABLE issue_supporters (
  issue_id   INT NOT NULL,
  user_id    INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (issue_id, user_id),
  CONSTRAINT fk_support_issue FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
  CONSTRAINT fk_support_user  FOREIGN KEY (user_id)  REFERENCES users(id)
);

-- ---------------------------------------------------------------------
-- Audit trail of everything that happens to an issue.
-- actor_id NULL means the system did it (escalation, auto-close).
-- ---------------------------------------------------------------------
CREATE TABLE issue_history (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  issue_id   INT NOT NULL,
  actor_id   INT NULL,
  action     ENUM('created','status','priority','remark','support','escalated') NOT NULL,
  from_value VARCHAR(30),
  to_value   VARCHAR(30),
  note       TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_history_issue FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
  CONSTRAINT fk_history_actor FOREIGN KEY (actor_id) REFERENCES users(id),
  INDEX idx_history_issue (issue_id, created_at)
);
