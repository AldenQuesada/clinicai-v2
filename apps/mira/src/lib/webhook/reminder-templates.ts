/**
 * Lembretes engracados pre-expiry voucher_confirm (DECISAO ALDEN).
 *
 * Quando voucher_confirm tem 5min ou menos pra expirar, Mira manda mensagem
 * curta + bem humorada lembrando a parceira de confirmar SIM/NAO.
 *
 * 7 templates rotacionados por hash(phone+expires_at) · diversidade sem state extra.
 */

const TEMPLATES = [
  'Ô {firstName}, ainda tô segurando o voucher pra {recipientName} aqui ⏳ confirma SIM ou NÃO antes que eu pense que você esqueceu de mim 😅',
  'Faltam 5 minutinhos pra esse voucher virar pó 🌬️ {recipientName} ainda vai? digita SIM ou NÃO',
  'Lembrete amigável: voucher pra {recipientName} expira em 5min · me dá um SIM ou NÃO 🙏',
  '{firstName}, tô de olho no relógio aqui ⏰ o voucher pra {recipientName} sai em 5min, posso emitir? SIM/NÃO',
  'Olha, {firstName}, eu adoro confirmar coisas mas preciso de uma resposta ✨ voucher pra {recipientName} · SIM ou NÃO?',
  'Ainda tô esperando aqui 👀 o voucher pra {recipientName} expira em 5min · SIM emite, NÃO descarto. Sua escolha!',
  'Última chamada antes do voucher pra {recipientName} virar abóbora 🎃 SIM ou NÃO, {firstName}?',
] as const

function djb2Hash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i)
  }
  return Math.abs(h)
}

export function pickReminderTemplate(seed: string): string {
  const idx = djb2Hash(seed) % TEMPLATES.length
  return TEMPLATES[idx]
}

export function renderReminder(opts: {
  firstName: string
  recipientName: string
  seed: string
}): string {
  const tpl = pickReminderTemplate(opts.seed)
  return tpl
    .replace(/\{firstName\}/g, opts.firstName || 'parceira')
    .replace(/\{recipientName\}/g, opts.recipientName || 'sua amiga')
}

export const REMINDER_TEMPLATES_FOR_REPORT = TEMPLATES
