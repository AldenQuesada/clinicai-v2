import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Central WhatsApp | ClinicAI',
};

export default function ConversasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Pega altura total da tela e corta overflow. Fundo principal.
    <div className="flex h-screen w-full overflow-hidden bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))]">
      {children}
    </div>
  );
}
