/**
 * ClinicAI — Permissions Service
 *
 * Fonte única da verdade para lógica de permissões na UI.
 *
 * Hierarquia de roles (do maior para o menor acesso):
 *   owner → admin → therapist → receptionist → viewer
 *
 * API pública (window.PermissionsService):
 *   can(action)           — boolean: usuário atual pode realizar a ação?
 *   canAny(actions)       — boolean: pode realizar pelo menos uma das ações?
 *   canAll(actions)       — boolean: pode realizar todas as ações?
 *   getRole()             — string: role do usuário atual
 *   isAtLeast(role)       — boolean: hierarquia — ex: isAtLeast('admin') = owner ou admin
 *   guardElement(el, action) — oculta/desabilita elemento se sem permissão
 *   applyGuards(root)     — aplica guards em todos os [data-requires-action] do container
 */

;(function () {
  'use strict'

  // ── Hierarquia de roles (índice = nível, maior = mais permissão) ──
  const ROLE_HIERARCHY = ['viewer', 'receptionist', 'therapist', 'admin', 'owner']

  // ── Mapa de ações → roles mínimos necessários ─────────────────────
  // Adicione novas ações aqui conforme o sistema crescer.
  const ACTION_ROLES = {
    // Gestão de usuários
    'users:view':           ['receptionist', 'therapist', 'admin', 'owner'],
    'users:invite':         ['admin', 'owner'],
    'users:deactivate':     ['admin', 'owner'],
    'users:reactivate':     ['admin', 'owner'],
    'users:change-role':    ['owner'],
    'invites:revoke':       ['admin', 'owner'],

    // Agenda
    'agenda:view':              ['receptionist', 'therapist', 'admin', 'owner'],
    'agenda:create':            ['receptionist', 'admin', 'owner'],
    'agenda:edit':              ['receptionist', 'therapist', 'admin', 'owner'],
    'agenda:delete':            ['admin', 'owner'],
    // Visibilidade multi-profissional
    'agenda:view-all-pros':     ['receptionist', 'admin', 'owner'],   // veem todos implicitamente
    'agenda:manage-visibility': ['admin', 'owner'],                    // configura pares
    'agenda:share-own':         ['therapist', 'admin', 'owner'],       // compartilha a própria
    // Perfil clínico
    'professional:manage-all':  ['admin', 'owner'],
    'professional:manage-own':  ['therapist', 'admin', 'owner'],

    // Pacientes
    'patients:view':        ['receptionist', 'therapist', 'admin', 'owner'],
    'patients:create':      ['receptionist', 'therapist', 'admin', 'owner'],
    'patients:edit':        ['receptionist', 'therapist', 'admin', 'owner'],
    'patients:delete':      ['admin', 'owner'],
    'patients:prontuario':  ['therapist', 'admin', 'owner'],
    'prontuario:view':      ['therapist', 'admin', 'owner'],
    'prontuario:create':    ['therapist', 'admin', 'owner'],
    'prontuario:edit':      ['therapist', 'admin', 'owner'],
    'prontuario:delete':    ['admin', 'owner'],

    // Financeiro
    'financeiro:view':      ['viewer', 'admin', 'owner'],
    'financeiro:edit':      ['admin', 'owner'],

    // Configurações
    'settings:view':        ['admin', 'owner'],
    'settings:edit':        ['admin', 'owner'],
    'settings:clinic-data': ['owner'],

    // Relatórios / Exportação
    'reports:view':         ['viewer', 'receptionist', 'therapist', 'admin', 'owner'],
    'reports:export':       ['admin', 'owner'],

    // Notificações
    'notifications:view':      ['receptionist', 'therapist', 'admin', 'owner', 'viewer'],
    'notifications:send':      ['admin', 'owner'],
    'notifications:broadcast': ['admin', 'owner'],
  }

  // ── Helpers internos ──────────────────────────────────────────────

  function _getProfile() {
    return typeof window.getCurrentProfile === 'function' ? window.getCurrentProfile() : null
  }

  function _getRole() {
    return (_getProfile()?.role || '').toLowerCase()
  }

  function _roleIndex(role) {
    const idx = ROLE_HIERARCHY.indexOf(role)
    return idx === -1 ? -1 : idx
  }

  // ── API pública ───────────────────────────────────────────────────

  /**
   * Verifica se o usuário atual tem permissão para uma ação específica.
   * @param {string} action — ex: 'users:invite', 'agenda:delete'
   * @returns {boolean}
   */
  function can(action) {
    const role = _getRole()
    if (!role) return false

    const allowed = ACTION_ROLES[action]
    if (!allowed) {
      console.warn('[PermissionsService] Ação desconhecida:', action)
      return false
    }

    return allowed.includes(role)
  }

  /**
   * Retorna true se o usuário pode realizar PELO MENOS UMA das ações.
   * @param {string[]} actions
   * @returns {boolean}
   */
  function canAny(actions) {
    return actions.some(a => can(a))
  }

  /**
   * Retorna true se o usuário pode realizar TODAS as ações.
   * @param {string[]} actions
   * @returns {boolean}
   */
  function canAll(actions) {
    return actions.every(a => can(a))
  }

  /**
   * Retorna o role do usuário atual.
   * @returns {string}
   */
  function getRole() {
    return _getRole()
  }

  /**
   * Verifica se o usuário tem pelo menos o nível de role especificado.
   * Ex: isAtLeast('admin') retorna true para 'admin' e 'owner'.
   * @param {string} minRole
   * @returns {boolean}
   */
  function isAtLeast(minRole) {
    const userIdx = _roleIndex(_getRole())
    const minIdx  = _roleIndex(minRole)
    if (userIdx === -1 || minIdx === -1) return false
    return userIdx >= minIdx
  }

  /**
   * Aplica guard em um elemento do DOM baseado em uma ação.
   * - Se não tem permissão: oculta com display:none
   * - Se tem permissão: remove display:none
   *
   * @param {HTMLElement} el
   * @param {string}      action
   * @param {'hide'|'disable'} [mode='hide'] — 'hide' oculta, 'disable' desabilita
   */
  function guardElement(el, action, mode) {
    if (!el) return
    const allowed = can(action)
    if (mode === 'disable') {
      el.disabled = !allowed
      el.setAttribute('aria-disabled', String(!allowed))
    } else {
      el.style.display = allowed ? '' : 'none'
    }
  }

  /**
   * Percorre todos os elementos com [data-requires-action] dentro de `root`
   * e aplica guardElement em cada um.
   *
   * HTML: <button data-requires-action="users:invite">Convidar</button>
   *       <button data-requires-action="users:deactivate" data-guard-mode="disable">Desativar</button>
   *
   * @param {HTMLElement|Document} [root=document]
   */
  function applyGuards(root) {
    const container = root || document
    container.querySelectorAll('[data-requires-action]').forEach(el => {
      const action = el.dataset.requiresAction
      const mode   = el.dataset.guardMode || 'hide'
      guardElement(el, action, mode)
    })
  }

  // ── Exposição global ──────────────────────────────────────────────
  window.PermissionsService = Object.freeze({
    can,
    canAny,
    canAll,
    getRole,
    isAtLeast,
    guardElement,
    applyGuards,
  })

})()
