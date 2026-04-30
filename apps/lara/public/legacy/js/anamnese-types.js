/**
 * anamnese-types.js
 * Constantes e enums para o módulo de ficha de anamnese.
 * Elimina magic strings espalhadas nos arquivos do módulo.
 */

// ── Tipos de campo ────────────────────────────────────────────────────────────
export const FIELD_TYPES = /** @type {const} */ ({
  TEXT:                   'text',
  TEXTAREA:               'textarea',
  RICH_TEXT:              'rich_text',
  NUMBER:                 'number',
  DATE:                   'date',
  BOOLEAN:                'boolean',
  RADIO_SELECT:           'radio_select',
  SINGLE_SELECT:          'single_select',
  MULTI_SELECT:           'multi_select',
  SINGLE_SELECT_DYNAMIC:  'single_select_dynamic',
  SCALE_SELECT:           'scale_select',
  FILE_UPLOAD:            'file_upload',
  IMAGE_UPLOAD:           'image_upload',
  IMAGE_PAIR:             'image_pair',
  SECTION_TITLE:          'section_title',
  LABEL:                  'label',
  DESCRIPTION_TEXT:       'description_text',
})

// ── Displays de campo (settings_json.display) ─────────────────────────────────
export const FIELD_DISPLAYS = /** @type {const} */ ({
  SCALE_SELECT:   'scale_select',
  SEPARATOR:      'separator',
  BLOCK:          'block',
  IMAGE_PAIR:     'image_pair',
  RADIO_SELECT:   'radio_select',
  SINGLE_SELECT:  'single_select',
})

// ── Status de solicitação ─────────────────────────────────────────────────────
export const REQUEST_STATUS = /** @type {const} */ ({
  PENDING:     'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED:   'completed',
  EXPIRED:     'expired',
  CANCELLED:   'cancelled',
})

// ── Operadores de condição ────────────────────────────────────────────────────
export const COND_OPERATORS = /** @type {const} */ ({
  EQUALS:     'equals',
  NOT_EQUALS: 'not_equals',
  INCLUDES:   'includes',
})

// ── Campos sensíveis (LGPD) — não indexar em normalized_text ─────────────────
export const PII_FIELD_KEYS = new Set([
  'cpf', '__gd_cpf',
  'rg',  '__gd_rg',
])
