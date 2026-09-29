-- Content rating is a film-level (title-level) attribute the creator picks
-- at creation and can edit later. It already lived on `titles`, not
-- `episodes` — this just gives it a fixed set of values instead of any
-- free-form text, so the UI can render a real picker.
alter table public.titles
  add constraint titles_content_rating_check
  check (content_rating in ('G', '13+', '16+', '18+'));
