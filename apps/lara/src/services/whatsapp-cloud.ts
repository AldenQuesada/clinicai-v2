/**
 * WhatsApp Cloud API Service
 *
 * Replaces Evolution API with the official Meta WhatsApp Cloud API.
 * Handles: sending text/image/audio, downloading media, webhook verification.
 */

const GRAPH_API = 'https://graph.facebook.com/v21.0';

export class WhatsAppCloudService {
  private accessToken: string;
  private phoneNumberId: string;

  constructor(accessToken?: string, phoneNumberId?: string) {
    this.accessToken = accessToken || process.env.WHATSAPP_ACCESS_TOKEN!;
    this.phoneNumberId = phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID!;
  }

  // ── Send text message ──────────────────────────────────────
  async sendText(to: string, text: string) {
    const url = `${GRAPH_API}/${this.phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: text },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[WA Cloud] sendText failed:', err);
      return { ok: false, error: err };
    }
    const data = await res.json();
    return { ok: true, data };
  }

  // ── Send image by URL ──────────────────────────────────────
  async sendImage(to: string, imageUrl: string, caption?: string) {
    const url = `${GRAPH_API}/${this.phoneNumberId}/messages`;
    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'image',
      image: { link: imageUrl, ...(caption ? { caption } : {}) },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[WA Cloud] sendImage failed:', err);
      return { ok: false, error: err };
    }
    return { ok: true, data: await res.json() };
  }

  // ── Download media from Meta (by media ID) ─────────────────
  async downloadMedia(mediaId: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    try {
      // Step 1: get the media URL
      const metaRes = await fetch(`${GRAPH_API}/${mediaId}`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (!metaRes.ok) return null;
      const metaData = await metaRes.json();
      const mediaUrl = metaData.url;
      const mimeType = metaData.mime_type || 'application/octet-stream';

      // Step 2: download the actual binary
      const fileRes = await fetch(mediaUrl, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (!fileRes.ok) return null;

      const arrayBuffer = await fileRes.arrayBuffer();
      return { buffer: Buffer.from(arrayBuffer), contentType: mimeType };
    } catch (err) {
      console.error('[WA Cloud] downloadMedia failed:', err);
      return null;
    }
  }

  // ── Mark message as read ───────────────────────────────────
  async markAsRead(messageId: string) {
    const url = `${GRAPH_API}/${this.phoneNumberId}/messages`;
    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    }).catch(() => {});
  }
}
