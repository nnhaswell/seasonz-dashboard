-- =====================================================
-- Tag Refresh — superuser write access (incl. org-wide group_id NULL)
-- Champion policies only cover a champion's own group; org-wide pushes
-- (group_id IS NULL) need a superuser to create the bank + round.
-- =====================================================

CREATE POLICY trb_superuser_all ON public.tag_refresh_banks
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_superuser = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_superuser = true));

CREATE POLICY trbw_superuser_all ON public.tag_refresh_bank_words
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_superuser = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_superuser = true));

CREATE POLICY trr_superuser_all ON public.tag_refresh_rounds
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_superuser = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_superuser = true));
