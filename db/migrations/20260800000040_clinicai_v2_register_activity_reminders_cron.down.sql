-- DOWN da mig 800-40 · remove o registro do cron
BEGIN;
DELETE FROM public.mira_cron_jobs WHERE job_name = 'mira-activity-reminders';
COMMIT;
