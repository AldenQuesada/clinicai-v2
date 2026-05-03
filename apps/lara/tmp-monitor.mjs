import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync('./.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim();
const sb = createClient(url, key);

const startTs = new Date().toISOString();
console.log(`[monitor] start · only new msgs after ${startTs}`);

let cursor = startTs;
let lastEvolutionInboundTs = null;
const MIH_NUM_ID = 'ead8a6f9-6e0e-4a89-8268-155392794f69';
const MIH_API = 'https://evolution.aldenquesada.site';
const MIH_KEY = '4ACB899F2D91-4EEC-8AB5-CD81F01109EC';

async function pollDb() {
  const { data: msgs } = await sb
    .from('wa_messages')
    .select('id, conversation_id, direction, sender, content, content_type, sent_at, channel, phone')
    .gt('sent_at', cursor)
    .order('sent_at', { ascending: true })
    .limit(20);
  for (const m of msgs ?? []) {
    const ts = new Date(m.sent_at).toLocaleTimeString('pt-BR', { hour12: false });
    const arrow = m.direction === 'inbound' ? '⬇️' : '⬆️';
    const tag = m.direction === 'inbound' ? '[PACIENTE]' : `[${m.sender || '?'}]`;
    const phone = m.phone || '-';
    console.log(`${ts} ${arrow} ${tag} ${phone} (${m.content_type}/${m.channel})`);
    console.log(`         ${(m.content || '').slice(0, 140).replace(/\n/g, ' / ')}`);
    cursor = m.sent_at;
  }
}

async function pollEvolution() {
  try {
    const r = await fetch(`${MIH_API}/chat/findMessages/Mih`, {
      method: 'POST',
      headers: { 'apikey': MIH_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ where: {}, limit: 5 }),
    });
    const d = await r.json();
    const arr = d.messages?.records || d;
    if (!Array.isArray(arr) || !arr.length) return;
    const last = arr[0];
    const ts = last.messageTimestamp ? new Date(last.messageTimestamp * 1000).toISOString() : null;
    if (ts && ts !== lastEvolutionInboundTs) {
      lastEvolutionInboundTs = ts;
      const txt = last.message?.conversation || last.message?.extendedTextMessage?.text || '['+last.messageType+']';
      const t = new Date(ts).toLocaleTimeString('pt-BR', { hour12: false });
      const dir = last.key?.fromMe ? '⬆️Mih→' : '⬇️→Mih';
      const phone = (last.key?.senderPn || last.key?.remoteJid || '').replace('@s.whatsapp.net', '').replace('@lid', '');
      console.log(`${t} ${dir} EVOLUTION ${phone} (${last.pushName || '?'}): ${txt.slice(0, 120).replace(/\n/g, ' / ')}`);
    }
  } catch (e) {
    /* silent · Evolution pode demorar */
  }
}

// Loop · poll a cada 3s · roda 10min (200 ciclos)
let n = 0;
const id = setInterval(async () => {
  await pollDb();
  await pollEvolution();
  n++;
  if (n % 20 === 0) console.log(`[monitor] tick ${n}/200 · cursor=${cursor}`);
  if (n >= 200) { clearInterval(id); console.log('[monitor] DONE'); process.exit(0); }
}, 3000);
