/**
 * PhoneCopyChip · phone formatado · click pra copiar.
 *
 * Util pra secretaria que precisa ligar pro paciente ou colar nº em
 * outro sistema (agenda, prontuario externo). 1 click · feedback visual.
 */

'use client';

import { useState } from 'react';
import { Phone, Check } from 'lucide-react';
import { formatPhoneBR } from '@clinicai/utils';

interface Props {
  phone: string | null | undefined;
}

export function PhoneCopyChip({ phone }: Props) {
  const [copied, setCopied] = useState(false);
  if (!phone) return null;

  const formatted = formatPhoneBR(phone);
  const digits = phone.replace(/\D/g, '');

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(digits);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard pode falhar em browser sem permissao */
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Copiar ${digits}`}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] transition-colors hover:bg-white/[0.04]"
      style={{ color: 'rgba(245, 240, 232, 0.75)' }}
    >
      {copied ? (
        <Check className="w-3 h-3" strokeWidth={2} style={{ color: '#10B981' }} />
      ) : (
        <Phone className="w-3 h-3" strokeWidth={1.5} />
      )}
      <span className="tabular-nums">{formatted}</span>
    </button>
  );
}
