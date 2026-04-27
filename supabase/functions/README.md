# Supabase Edge Functions · clinicai-v2

Code-source canônico das edge functions B2B. Mig 2026-04-27 · trazido do
clinic-dashboard legacy. Runtime continua hospedado no Supabase project
`oqboitkpcvuaudouwvkl` · esta pasta é a fonte da verdade do código.

## Edges B2B (12)

| Edge | Função | Chamada por |
|---|---|---|
| `b2b-comm-dispatch` | renderiza template + envia WhatsApp via Evolution | triggers DB `_b2b_invoke_edge` |
| `b2b-mira-inbound` | webhook Evolution → roteia mensagem | n8n/Evolution (legacy · `apps/mira/api/webhook/evolution` é o canônico) |
| `b2b-mira-router` | classify intent + roteia handlers | b2b-mira-inbound (legacy) |
| `b2b-mira-welcome` | welcome new partner | trigger `_b2b_on_partnership_active` |
| `b2b-voucher-audio` | TTS Lara/Mira (Anthropic + ElevenLabs) | trigger `trg_b2b_voucher_audio_auto` |
| `b2b-voucher-og` | OG image preview voucher (Sharp/Canvas) | URL share | `b2b-voucher-share` | redirect público compartilhável |
| `b2b-candidate-evaluate` | scout AI evaluation (Anthropic) | manual admin |
| `b2b-insights-generator` | insights AI (Anthropic) | cron |
| `b2b-playbook-ia` | playbook AI (Anthropic) | manual admin |
| `b2b-scout-scan` | scout scan partnerships discovery | cron |
| `b2b-weekly-insight` | weekly insight | cron |

## Deploy

Pré-requisitos:
- Supabase CLI logado (`supabase login`)
- Projeto linkado (`supabase link --project-ref oqboitkpcvuaudouwvkl`)
- Secrets configurados: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `EVOLUTION_API_KEY`

```bash
# Deploy uma edge
cd supabase
supabase functions deploy b2b-comm-dispatch

# Deploy todas B2B
for f in b2b-comm-dispatch b2b-mira-inbound b2b-mira-router b2b-mira-welcome \
         b2b-voucher-audio b2b-voucher-og b2b-voucher-share \
         b2b-candidate-evaluate b2b-insights-generator b2b-playbook-ia \
         b2b-scout-scan b2b-weekly-insight; do
  supabase functions deploy "$f"
done
```

## URL de invocação

`https://oqboitkpcvuaudouwvkl.supabase.co/functions/v1/<edge-name>`

DB chama via função `_b2b_invoke_edge(p_path, p_body)` que faz pg_net
http_post fire-and-forget. Cf. mig 800-15 ou similar.

## Notas

- **Inbound webhook canônico**: `apps/mira/src/app/api/webhook/evolution/route.ts` é
  o entry point novo. `b2b-mira-inbound` legacy ainda existe mas pode ser
  desativada quando n8n/Evolution apontar pro novo.
- **Router migrado**: lógica de intent classification + handlers vive em
  `apps/mira/src/lib/webhook/handlers/*.ts`. `b2b-mira-router` legacy é
  histórico.
- **Não deletar do Supabase project** sem confirmar que nada chama. DB
  triggers ainda invocam várias.

## Roadmap aposentar legacy

1. ✅ Source code copiado pra clinicai-v2 (este commit)
2. ⏭️ Deploy via clinicai-v2 (substituir versão hospedada · mesma URL)
3. ⏭️ n8n/Evolution apontar pra `apps/mira/api/webhook/evolution`
4. ⏭️ Remover `b2b-mira-inbound` e `b2b-mira-router` do Supabase (após n8n migrado)
5. ⏭️ Pausar deploy clinic-dashboard no Easypanel
6. ⏭️ Redirect 301 painel.miriandpaula.com.br → mira.miriandpaula.com.br
