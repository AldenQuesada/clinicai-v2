-- DOWN da mig 800-36 · backfill nao tem rollback (nao reverte tokens setados)
-- Down apenas registra que foi noop.
SELECT 'mig 800-36 down · backfill irreversivel · noop' AS msg;
