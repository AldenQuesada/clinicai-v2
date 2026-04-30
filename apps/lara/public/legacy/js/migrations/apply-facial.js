/**
 * Run this in the browser console to create facial analysis tables.
 * Or paste the SQL in Supabase SQL Editor.
 *
 * Usage: copy-paste into browser console when logged into ClinicAI
 */
;(async function () {
  var sb = window._sbShared
  if (!sb) { console.error('Supabase not loaded'); return }

  var statements = [
    // Table: facial_photos (cache for bg-removed photos)
    `CREATE TABLE IF NOT EXISTS facial_photos (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      clinic_id uuid,
      lead_id uuid,
      angle text NOT NULL,
      original_hash text NOT NULL,
      photo_b64 text NOT NULL,
      created_at timestamptz DEFAULT now()
    )`,

    `CREATE INDEX IF NOT EXISTS idx_facial_photos_hash ON facial_photos(original_hash)`,

    // Table: facial_sessions
    `CREATE TABLE IF NOT EXISTS facial_sessions (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      clinic_id uuid,
      lead_id uuid NOT NULL,
      session_data jsonb NOT NULL,
      gpt_analysis jsonb,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )`,

    `CREATE INDEX IF NOT EXISTS idx_facial_sessions_lead ON facial_sessions(lead_id)`,

    // RPC: upsert facial photo
    `CREATE OR REPLACE FUNCTION upsert_facial_photo(
      p_clinic_id uuid, p_lead_id uuid, p_angle text, p_hash text, p_photo_b64 text
    ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE v_id uuid;
    BEGIN
      SELECT id INTO v_id FROM facial_photos WHERE original_hash = p_hash LIMIT 1;
      IF v_id IS NOT NULL THEN
        RETURN jsonb_build_object('ok', true, 'id', v_id, 'cached', true);
      END IF;
      INSERT INTO facial_photos (clinic_id, lead_id, angle, original_hash, photo_b64)
      VALUES (p_clinic_id, p_lead_id, p_angle, p_hash, p_photo_b64)
      RETURNING id INTO v_id;
      RETURN jsonb_build_object('ok', true, 'id', v_id, 'cached', false);
    END; $fn$`,

    // RPC: get cached photo
    `CREATE OR REPLACE FUNCTION get_facial_photo(p_hash text)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE v_row facial_photos%ROWTYPE;
    BEGIN
      SELECT * INTO v_row FROM facial_photos WHERE original_hash = p_hash LIMIT 1;
      IF v_row.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'found', false);
      END IF;
      RETURN jsonb_build_object('ok', true, 'found', true, 'photo_b64', v_row.photo_b64);
    END; $fn$`,

    // RPC: save session
    `CREATE OR REPLACE FUNCTION upsert_facial_session(
      p_clinic_id uuid, p_lead_id uuid, p_session_data jsonb, p_gpt_analysis jsonb DEFAULT NULL
    ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE v_id uuid;
    BEGIN
      SELECT id INTO v_id FROM facial_sessions WHERE lead_id = p_lead_id ORDER BY updated_at DESC LIMIT 1;
      IF v_id IS NOT NULL THEN
        UPDATE facial_sessions SET session_data = p_session_data, gpt_analysis = COALESCE(p_gpt_analysis, gpt_analysis), updated_at = now() WHERE id = v_id;
      ELSE
        INSERT INTO facial_sessions (clinic_id, lead_id, session_data, gpt_analysis)
        VALUES (p_clinic_id, p_lead_id, p_session_data, p_gpt_analysis)
        RETURNING id INTO v_id;
      END IF;
      RETURN jsonb_build_object('ok', true, 'id', v_id);
    END; $fn$`,

    // RPC: load session
    `CREATE OR REPLACE FUNCTION get_facial_session(p_lead_id uuid)
    RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    DECLARE v_row facial_sessions%ROWTYPE;
    BEGIN
      SELECT * INTO v_row FROM facial_sessions WHERE lead_id = p_lead_id ORDER BY updated_at DESC LIMIT 1;
      IF v_row.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'found', false);
      END IF;
      RETURN jsonb_build_object('ok', true, 'found', true, 'session_data', v_row.session_data, 'gpt_analysis', v_row.gpt_analysis);
    END; $fn$`,
  ]

  console.log('[Facial Migration] Starting...')
  for (var i = 0; i < statements.length; i++) {
    var sql = statements[i]
    var label = sql.substring(0, 50).replace(/\s+/g, ' ').trim()
    try {
      var { error } = await sb.rpc('exec_sql', { sql_text: sql })
      if (error) {
        console.warn('[' + (i + 1) + '/' + statements.length + '] ' + label + '... ERR:', error.message)
      } else {
        console.log('[' + (i + 1) + '/' + statements.length + '] ' + label + '... OK')
      }
    } catch (e) {
      console.warn('[' + (i + 1) + '] ERR:', e.message)
    }
  }
  console.log('[Facial Migration] Done!')
})()
