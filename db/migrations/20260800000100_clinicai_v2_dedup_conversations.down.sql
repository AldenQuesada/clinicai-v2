-- Rollback Mig 100 · drop UNIQUE INDEX. Convs ja merged · nao desfaz.
DROP INDEX IF EXISTS public.uq_wa_conv_clinic_phone_last8;
