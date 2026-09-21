-- =============================================================================
-- Migration 008: Audit Logs
-- =============================================================================
-- Captures sensitive administrative actions for accountability.
-- Supports auditing undo, direct assignment, bucket relaxation, scouting,
-- administrative changes, user/role changes, franchise changes, etc.
-- =============================================================================

CREATE TABLE audit_logs (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id       uuid REFERENCES seasons(id) ON DELETE SET NULL,  -- nullable for global actions
  actor_user_id   uuid NOT NULL REFERENCES users(id),
  action          text NOT NULL,
  entity_type     text NOT NULL,
  entity_id       uuid,
  reason          text,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_season_idx ON audit_logs(season_id) WHERE season_id IS NOT NULL;
CREATE INDEX audit_logs_actor_idx ON audit_logs(actor_user_id);
CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
CREATE INDEX audit_logs_created_idx ON audit_logs(created_at);
