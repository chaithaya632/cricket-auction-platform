-- =============================================================================
-- Migration 001: PostgreSQL Extensions
-- =============================================================================
-- Enable required PostgreSQL extensions for the ACC Auction Portal.
-- =============================================================================

-- UUID generation for primary keys
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Trigram matching for future text search capabilities
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
