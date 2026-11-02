-- Adds the directory's ad-warning report reason.
--
-- This migration contains nothing else on purpose. PostgreSQL permits
-- ALTER TYPE ... ADD VALUE inside a transaction but forbids *using* the new
-- value in that same transaction, and the migrator runs one file per
-- transaction. Later migrations may therefore reference 'LOTS_OF_ADS'.
ALTER TYPE "watch_report_reason" ADD VALUE IF NOT EXISTS 'LOTS_OF_ADS';
