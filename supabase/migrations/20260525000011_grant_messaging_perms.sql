-- Grant table-level permissions for the authenticated role.
-- RLS policies on messages reference conversation_participants via EXISTS —
-- without SELECT permission on that table the policy evaluation itself fails
-- with "permission denied", even before the RLS check can run.

grant select on conversations             to authenticated;
grant select on conversation_participants to authenticated;
grant update on conversation_participants to authenticated;  -- needed for useMarkRead
grant select on messages                  to authenticated;
grant insert on messages                  to authenticated;
