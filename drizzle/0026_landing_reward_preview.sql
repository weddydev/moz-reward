-- P1-08 (C-50): the shop landing `/s/[code]` shows the reward preview (next reward + gold needed) to anyone.
-- loyalty_programs stays readable by the team, admins and current members only (0024/0025): instead of a public
-- policy, this one function hands out the public part of a live shop's programme versions — ingot size, main
-- reward text, milestones with every mystery reward's text blanked, and the two dates the app resolves the
-- version in force with. No earn rules, no `created_by`. Live = what the landing shows as live (not pending,
-- suspended or closed); any other shop id returns no rows.
-- Owned by moz_rls (the NOLOGIN owner of every SECURITY DEFINER helper, 0010), which gets column-level SELECT
-- on just these columns plus read policies for itself; EXECUTE for moz_app only (the public landing read).
-- contract: none needed (new function, grants and policies; no table rewrite).
SET lock_timeout = '5s';--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.shop_reward_preview(p_shop_id uuid)
RETURNS TABLE (
  version integer,
  ingot_size integer,
  main_reward text,
  milestones jsonb,
  active_from timestamptz,
  rewards_from timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT lp.version,
         lp.ingot_size,
         lp.main_reward->>'text',
         COALESCE((
           SELECT jsonb_agg(
                    jsonb_build_object(
                      'percent', (m->>'percent')::int,
                      'reward', CASE WHEN (m->>'isMystery')::boolean THEN '' ELSE m->>'reward' END,
                      'isMystery', (m->>'isMystery')::boolean
                    ) ORDER BY (m->>'percent')::int)
           FROM jsonb_array_elements(lp.milestones) AS m
         ), '[]'::jsonb),
         lp.active_from,
         lp.rewards_from
  FROM public.loyalty_programs lp
  JOIN public.shops s ON s.id = lp.shop_id
  WHERE lp.shop_id = p_shop_id
    AND s.status NOT IN ('pending', 'suspended', 'closed')
  ORDER BY lp.version
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.shop_reward_preview(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.shop_reward_preview(uuid) TO moz_app;--> statement-breakpoint
GRANT SELECT (shop_id, version, ingot_size, main_reward, milestones, active_from, rewards_from)
  ON loyalty_programs TO moz_rls;--> statement-breakpoint
GRANT SELECT (id, status) ON shops TO moz_rls;--> statement-breakpoint
CREATE POLICY loyalty_programs_rls_preview ON loyalty_programs AS PERMISSIVE FOR SELECT TO moz_rls
  USING (true);--> statement-breakpoint
CREATE POLICY shops_rls_preview ON shops AS PERMISSIVE FOR SELECT TO moz_rls USING (true);--> statement-breakpoint
GRANT CREATE ON SCHEMA public TO moz_rls;--> statement-breakpoint
ALTER FUNCTION public.shop_reward_preview(uuid) OWNER TO moz_rls;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM moz_rls;
