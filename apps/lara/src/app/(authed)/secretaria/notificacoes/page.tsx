/**
 * /secretaria/notificacoes · Settings de notificação acessíveis pra role
 * 'secretaria' (que não vê /configuracoes principal).
 *
 * Reusa NotificationSettingsPanel do /configuracoes · zero duplicação.
 */

import { NotificationSettingsPanel } from '../../configuracoes/NotificationSettingsPanel'

export default function SecretariaNotificacoesPage() {
  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-display text-[hsl(var(--foreground))]">
          Notificações
        </h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1 font-display italic">
          Configure som e avisos no <em>computador</em> quando chegar mensagem
        </p>
      </div>

      <NotificationSettingsPanel />

      <div className="mt-6 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] p-5">
        <h3 className="text-xs uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2 font-display-uppercase">
          Dica
        </h3>
        <p className="text-sm text-[hsl(var(--foreground))]">
          Se nenhum aviso aparecer, o navegador pode estar bloqueando.
          Procure pelo <strong>cadeado</strong> ou <strong>i</strong> na barra de endereço,
          e marque <em>Permitir notificações</em>.
        </p>
      </div>
    </div>
  )
}
