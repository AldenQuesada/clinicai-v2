/**
 * AssinadoConfirmacao · tela exibida quando o paciente reabre um link
 * de documento ja assinado. Tema luxury dark · sem CTA de re-assinatura
 * (idempotencia · cada request tem 1 assinatura imutavel).
 */

const FONT_SERIF = `'Cormorant Garamond', Georgia, serif`
const FONT_SANS = `'Montserrat', sans-serif`

export function AssinadoConfirmacao({ message }: { message?: string }) {
  return (
    <div style={styles.body}>
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={styles.eyebrow}>Documento já assinado</div>
          <h1 style={styles.title}>
            Tudo <em style={styles.titleAccent}>certo</em>
          </h1>
          <p style={styles.subtitle}>
            {message || 'Este documento ja foi assinado e registrado.'}
          </p>
          <p style={styles.muted}>
            Sua assinatura tem validade jurídica conforme a Lei 14.063/2020 e está
            armazenada em registro imutável. Você pode fechar esta página com
            tranquilidade.
          </p>
          <div style={styles.footer}>Clínica Mirian de Paula · Maringá</div>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  body: {
    margin: 0,
    padding: 0,
    background: 'linear-gradient(135deg, #0E0E18 0%, #1A1A2E 100%)',
    fontFamily: FONT_SERIF,
    color: '#E8E4D9',
    minHeight: '100vh',
  },
  wrap: { maxWidth: 720, margin: '0 auto', padding: '32px 16px 64px' },
  card: {
    background: '#16162A',
    borderRadius: 16,
    padding: 'clamp(28px, 6vw, 48px) clamp(24px, 5vw, 56px)',
    border: '1px solid rgba(201,169,110,0.22)',
    textAlign: 'center',
    boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
  },
  eyebrow: {
    fontFamily: FONT_SANS,
    fontSize: 10.5,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: '#10B981',
    fontWeight: 500,
    marginBottom: 8,
  },
  title: {
    fontSize: 'clamp(28px, 7vw, 40px)',
    fontWeight: 300,
    margin: '0 0 6px',
    letterSpacing: 0.5,
    lineHeight: 1.1,
  },
  titleAccent: { color: '#C9A96E', fontWeight: 400, fontStyle: 'italic' },
  subtitle: {
    fontFamily: FONT_SANS,
    fontSize: 13,
    color: '#D4B978',
    fontWeight: 500,
    margin: '0 0 16px',
    letterSpacing: 1,
  },
  muted: {
    fontFamily: FONT_SANS,
    fontSize: 13,
    color: '#9C9788',
    lineHeight: 1.7,
    margin: 0,
  },
  footer: {
    marginTop: 36,
    paddingTop: 18,
    borderTop: '1px solid rgba(201,169,110,0.22)',
    fontFamily: FONT_SANS,
    fontSize: 9.5,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: '#9C9788',
  },
}
