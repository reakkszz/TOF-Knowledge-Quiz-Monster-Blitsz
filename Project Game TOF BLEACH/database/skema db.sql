-- database.sql
-- Format: MySQL / MariaDB

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `Response`;
DROP TABLE IF EXISTS `User`;
SET FOREIGN_KEY_CHECKS = 1;

-- --------------------------------------------------------
-- Struktur untuk tabel `User`
-- --------------------------------------------------------
CREATE TABLE `User` (
  `UserID` INT(11) NOT NULL AUTO_INCREMENT,
  `Username` VARCHAR(50) NOT NULL,
  PRIMARY KEY (`UserID`),
  UNIQUE KEY `Username` (`Username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------
-- Struktur untuk tabel `Response`
-- --------------------------------------------------------
CREATE TABLE `Response` (
  `ResponseID` INT(11) NOT NULL AUTO_INCREMENT,
  `UserID` INT(11) NOT NULL,
  `Answer_given` INT(11) DEFAULT 1,
  `Is_correct` INT(11) DEFAULT 0,
  `Response_time_ms` INT(11) DEFAULT 0,
  `Points_earned` INT(11) DEFAULT 0,
  PRIMARY KEY (`ResponseID`),
  KEY `fk_user_response` (`UserID`),
  CONSTRAINT `fk_user_response` FOREIGN KEY (`UserID`) REFERENCES `User` (`UserID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;