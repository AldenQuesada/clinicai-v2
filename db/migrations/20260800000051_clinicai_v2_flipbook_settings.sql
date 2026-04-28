-- Adiciona coluna `settings jsonb` em flipbooks pra armazenar configurações
-- de TODOS os painéis do editor (controls visibility, pagination style,
-- background, logo, bg-audio, toc, lead-capture, redirect_url, etc).
--
-- Estrutura plana key→value (merge raso via PATCH /api/flipbooks/[id]/settings).
--
-- Exemplos de chaves:
--   controls    : { download:bool, share:bool, fullscreen:bool, ... }
--   pagination  : { style: 'thumbs-numbers' | 'numbers' | 'thumbs' | 'hidden' }
--   background  : { type:'color'|'image', color:'#xxx', image_url, ... }
--   page_effect : { effect, disposition, sound }
--   logo        : { url, position, size, href? }
--   bg_audio    : { url, page_start, page_end, volume, loop }
--   toc         : { enabled, entries: [{label,page}] }
--   redirect_url: string
--   lead_capture: { page, title, dismissible }
BEGIN;

ALTER TABLE public.flipbooks
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
NOTIFY pgrst, 'reload schema';
