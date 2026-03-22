DROP INDEX IF EXISTS publish_jobs_post_id_unique;

ALTER TABLE public.publish_jobs
  ADD CONSTRAINT publish_jobs_post_id_unique UNIQUE (post_id);
