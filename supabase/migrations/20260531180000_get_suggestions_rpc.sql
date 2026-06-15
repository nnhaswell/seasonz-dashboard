-- ============================================================
-- get_suggestions RPC — Returns suggested people to connect with
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_suggestions(
  p_user_id uuid,
  p_limit   int DEFAULT 20
)
RETURNS TABLE (
  user_id           uuid,
  display_name      text,
  handle            text,
  avatar_url        text,
  bio               text,
  active_season     text,
  common_tag_labels text[],
  my_seasons        text[],
  their_seasons     text[],
  overlap_count     int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (p.id)
    p.id::uuid,
    p.display_name,
    p.handle,
    p.avatar_url,
    p.bio,
    p.active_season,
    ARRAY[]::text[] as common_tag_labels,
    ARRAY[p.active_season]::text[] as my_seasons,
    ARRAY[p.active_season]::text[] as their_seasons,
    0 as overlap_count
  FROM public.profiles p
  WHERE p.id != p_user_id
    AND p.onboarding_complete = true
    -- Exclude existing connections
    AND NOT EXISTS (
      SELECT 1 FROM public.connections c
      WHERE (c.user_id = p_user_id AND c.connected_user_id = p.id)
         OR (c.user_id = p.id AND c.connected_user_id = p_user_id)
    )
  ORDER BY p.id, p.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_suggestions(uuid, int) TO authenticated;
