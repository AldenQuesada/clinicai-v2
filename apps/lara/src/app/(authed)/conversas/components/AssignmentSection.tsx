/**
 * AssignmentSection · "Atribuído a" no LeadInfoPanel.
 *
 * P-12 multi-atendente · Fase 2.
 * Doc: docs/audits/2026-04-29-p12-multi-atendente-projeto.html
 *
 * 3 estados:
 *  1. Sem assignment: botão "+ Atribuir" abre dropdown de membros
 *  2. Atribuído a você: avatar + nome + botão "Liberar"
 *  3. Atribuído a outro: avatar + nome + warning "X está cuidando" +
 *     botão "Assumir mesmo assim" (soft-lock · não bloqueia)
 *
 * DNA visual: linhas finas champagne, Cormorant pra nomes, .badge-serious
 * pra warning amarelo.
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { UserCircle, ChevronDown, X, AlertTriangle } from 'lucide-react';
import { useClinicMembers, type ClinicMember } from '../hooks/useClinicMembers';
import { useAssignment } from '../hooks/useAssignment';

interface AssignmentSectionProps {
  conversationId: string;
  initialAssignedTo: string | null;
  initialAssignedAt: string | null;
  onChange?: () => void;
  /** compact: linha única (~36px) com 'Atendendo: X · [Liberar]' · usado
      na ZONA AGIR do painel direito. Default false (modo full original). */
  compact?: boolean;
}

/** Avatar pequeno · 24px · usa avatar_url se disponivel · senão inicial Cormorant gold */
function MemberAvatar({ member, size = 24 }: { member: ClinicMember; size?: number }) {
  const initial = (member.firstName || member.fullName || '?').trim().charAt(0).toUpperCase();
  if (member.avatarUrl) {
    return (
      <img
        src={member.avatarUrl}
        alt={member.fullName}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <span
        className="font-display italic leading-none text-[hsl(var(--primary))]"
        style={{ fontSize: Math.round(size * 0.5) }}
      >
        {initial}
      </span>
    </div>
  );
}

export function AssignmentSection({
  conversationId,
  initialAssignedTo,
  initialAssignedAt,
  onChange,
  compact = false,
}: AssignmentSectionProps) {
  const { members, me, isLoading: isMembersLoading, findById } = useClinicMembers();
  const { assignedTo, isLoading, error, assignTo, unassign } = useAssignment({
    conversationId,
    initial: { assignedTo: initialAssignedTo, assignedAt: initialAssignedAt },
    onChange,
  });

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Click-outside fecha dropdown
  useEffect(() => {
    if (!dropdownOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [dropdownOpen]);

  const assignedMember = assignedTo ? findById(assignedTo) : null;
  const isMine = assignedTo && me && assignedTo === me;
  const isAssignedToOther = assignedTo && me && assignedTo !== me;

  const handlePick = async (userId: string) => {
    setDropdownOpen(false);
    await assignTo(userId);
  };

  // Modo compact · linha única (~36px) usada na ZONA AGIR do painel direito
  if (compact) {
    return (
      <div ref={containerRef} className="px-5 py-2 border-b border-white/[0.06] flex items-center justify-between gap-2 relative">
        <span className="font-meta uppercase text-[9px] tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
          Atendendo
        </span>
        {!assignedTo ? (
          <button
            type="button"
            onClick={() => setDropdownOpen((v) => !v)}
            className="text-[11px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors cursor-pointer inline-flex items-center gap-1"
          >
            <span>+ Atribuir</span>
            <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
          </button>
        ) : isMine ? (
          <span className="inline-flex items-center gap-2 text-[11px] text-[hsl(var(--foreground))]">
            <span className="font-display italic text-[hsl(var(--primary))]">Você</span>
            <button
              type="button"
              onClick={() => unassign()}
              disabled={isLoading}
              title="Liberar conversa"
              className="font-meta uppercase text-[8.5px] tracking-[0.15em] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--danger))] transition-colors cursor-pointer disabled:opacity-50"
            >
              Liberar
            </button>
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-[11px] text-[hsl(var(--warning))]">
            <AlertTriangle className="w-3 h-3" strokeWidth={2} />
            <span className="font-display italic">{assignedMember?.firstName ?? 'outro'}</span>
            {me && (
              <button
                type="button"
                onClick={() => handlePick(me)}
                disabled={isLoading}
                className="font-meta uppercase text-[8.5px] tracking-[0.15em] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--warning))] transition-colors cursor-pointer disabled:opacity-50"
              >
                Assumir
              </button>
            )}
          </span>
        )}
        {/* Dropdown só aparece pra "+ Atribuir" no modo compact */}
        {!assignedTo && dropdownOpen && (
          <MembersDropdown members={members} me={me} onPick={handlePick} />
        )}
      </div>
    )
  }

  return (
    <div ref={containerRef}>
      <h4 className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-[0.18em] flex items-center gap-2 mb-3">
        <UserCircle className="w-3 h-3" strokeWidth={1.5} />
        Atribuído a
      </h4>

      {/* Estado 1 · Sem assignment */}
      {!assignedTo && (
        <div className="relative">
          <button
            type="button"
            disabled={isLoading || isMembersLoading}
            onClick={() => setDropdownOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-md text-[12px] bg-white/[0.02] border border-dashed border-white/[0.08] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))]/40 hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/[0.04] transition-colors group disabled:opacity-50 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <span className="text-[14px] leading-none">+</span>
              <span>Atribuir a alguém</span>
            </span>
            <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
          </button>
          {dropdownOpen && <MembersDropdown members={members} me={me} onPick={handlePick} />}
        </div>
      )}

      {/* Estado 2 · Atribuído a mim */}
      {assignedTo && isMine && (
        <div className="bg-[hsl(var(--primary))]/[0.06] border border-[hsl(var(--primary))]/[0.25] rounded-md p-3 space-y-2">
          <div className="flex items-center gap-2.5">
            {assignedMember ? (
              <MemberAvatar member={assignedMember} size={28} />
            ) : (
              <div className="w-7 h-7 rounded-full bg-white/[0.04] border border-white/[0.06]" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-display text-[14px] text-[hsl(var(--foreground))] leading-tight truncate">
                {assignedMember?.fullName || 'Você'}
              </p>
              <p className="font-meta text-[8.5px] tracking-[0.18em] uppercase text-[hsl(var(--primary))] mt-0.5">
                Você está cuidando
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => unassign()}
            className="w-full text-center text-[10.5px] uppercase tracking-[0.15em] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] py-1.5 border-t border-[hsl(var(--primary))]/[0.15] transition-colors disabled:opacity-50 cursor-pointer"
          >
            Liberar conversa
          </button>
        </div>
      )}

      {/* Estado 3 · Atribuído a outro · warning soft-lock */}
      {assignedTo && isAssignedToOther && (
        <div className="bg-[hsl(var(--warning))]/[0.06] border border-[hsl(var(--warning))]/[0.25] rounded-md p-3 space-y-2">
          <div className="flex items-center gap-2.5">
            {assignedMember ? (
              <MemberAvatar member={assignedMember} size={28} />
            ) : (
              <div className="w-7 h-7 rounded-full bg-white/[0.04] border border-white/[0.06]" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-display text-[14px] text-[hsl(var(--foreground))] leading-tight truncate">
                {assignedMember?.fullName || 'Outro atendente'}
              </p>
              <p className="font-meta text-[8.5px] tracking-[0.18em] uppercase text-[hsl(var(--warning))] mt-0.5 flex items-center gap-1">
                <AlertTriangle className="w-2.5 h-2.5" strokeWidth={2} />
                {assignedMember?.firstName ? `${assignedMember.firstName} está cuidando` : 'Está cuidando'}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-1 pt-1 border-t border-[hsl(var(--warning))]/[0.15]">
            <button
              type="button"
              disabled={isLoading || !me}
              onClick={() => me && handlePick(me)}
              className="w-full text-center text-[10.5px] uppercase tracking-[0.15em] text-[hsl(var(--warning))] hover:text-[hsl(var(--foreground))] py-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Assumir mesmo assim
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => unassign()}
              className="w-full text-center text-[10px] uppercase tracking-[0.15em] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] py-1 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Liberar
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-[10px] text-[hsl(var(--danger))] mt-2 flex items-center gap-1">
          <span className="inline-block w-1 h-1 rounded-full bg-[hsl(var(--danger))]" />
          {error}
        </p>
      )}
    </div>
  );
}

/** Dropdown de membros · usado pelos botoes de Atribuir/Reatribuir */
function MembersDropdown({
  members,
  me,
  onPick,
}: {
  members: ClinicMember[];
  me: string | null;
  onPick: (userId: string) => void;
}) {
  if (members.length === 0) {
    return (
      <div className="absolute left-0 right-0 top-full mt-1 bg-[hsl(var(--chat-panel-bg))] border border-[hsl(var(--chat-border))] rounded-md shadow-luxury-md z-30 p-3">
        <p className="text-[11px] text-[hsl(var(--muted-foreground))] italic font-display text-center">
          Nenhum membro ativo na clínica.
        </p>
      </div>
    );
  }
  return (
    <div className="absolute left-0 right-0 top-full mt-1 bg-[hsl(var(--chat-panel-bg))] border border-[hsl(var(--chat-border))] rounded-md shadow-luxury-md overflow-hidden z-30 max-h-64 overflow-y-auto custom-scrollbar">
      {/* Atalho · me atribuir (só aparece se temos `me`) */}
      {me && (
        <>
          <button
            type="button"
            onClick={() => onPick(me)}
            className="w-full text-left px-3 py-2 text-[12px] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/10 flex items-center gap-2 font-medium transition-colors"
          >
            <span className="text-[14px] leading-none">→</span>
            <span>Atribuir a mim</span>
          </button>
          <div className="h-px bg-[hsl(var(--chat-border))]" />
        </>
      )}
      {members.map((m) => (
        <button
          type="button"
          key={m.id}
          onClick={() => onPick(m.id)}
          className="w-full text-left px-3 py-2 text-[12px] text-[hsl(var(--foreground))] hover:bg-white/[0.03] flex items-center gap-2.5 transition-colors"
        >
          <div className="shrink-0">
            <MembersDropdownAvatar member={m} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate">{m.fullName}</p>
            {m.role && (
              <p className="text-[9px] uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))] opacity-70 mt-0.5">
                {m.role}
              </p>
            )}
          </div>
          {me && m.id === me && (
            <span className="text-[8.5px] uppercase tracking-[0.15em] text-[hsl(var(--primary))] opacity-80 shrink-0">
              Você
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function MembersDropdownAvatar({ member }: { member: ClinicMember }) {
  const initial = (member.firstName || member.fullName || '?').trim().charAt(0).toUpperCase();
  if (member.avatarUrl) {
    return (
      <img
        src={member.avatarUrl}
        alt={member.fullName}
        className="w-6 h-6 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="w-6 h-6 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
      <span className="font-display italic leading-none text-[hsl(var(--primary))] text-[12px]">
        {initial}
      </span>
    </div>
  );
}
