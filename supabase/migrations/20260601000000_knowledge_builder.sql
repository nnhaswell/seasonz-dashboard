-- =====================================================
-- Knowledge Builder Tables
-- =====================================================

-- Knowledge configurations (user's settings)
CREATE TABLE IF NOT EXISTS knowledge_configs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('vocabulary', 'quotes', 'facts', 'tips')),
  topic         TEXT NOT NULL,
  language      TEXT,  -- only for vocabulary
  frequency     TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Knowledge items (actual content shown to users)
CREATE TABLE IF NOT EXISTS knowledge_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id     UUID NOT NULL REFERENCES knowledge_configs(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('vocabulary', 'quotes', 'facts', 'tips')),
  content       JSONB NOT NULL,  -- { word, definition, example } or { quote, author } etc
  shown_date    DATE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(config_id, shown_date)  -- one item per config per day
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_configs_user ON knowledge_configs(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_knowledge_items_user_date ON knowledge_items(user_id, shown_date);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_config ON knowledge_items(config_id);

-- RLS Policies
ALTER TABLE knowledge_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_items ENABLE ROW LEVEL SECURITY;

-- Users can only see/modify their own configs
CREATE POLICY knowledge_configs_user_policy ON knowledge_configs
  FOR ALL USING (auth.uid() = user_id);

-- Users can only see their own knowledge items
CREATE POLICY knowledge_items_user_policy ON knowledge_items
  FOR ALL USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON knowledge_configs TO authenticated;
GRANT ALL ON knowledge_items TO authenticated;
