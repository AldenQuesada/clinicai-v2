/**
 * MagazineCaption · atomo · legenda de foto editorial.
 * Italic + dash + tabular · estilo "Vogue, Vanity Fair" · brandbook §13.
 *
 * Ex:
 *   Miriam Poppi · 52 anos
 *   ━━ Resultado real Dra. Mirian de Paula
 */

export function MagazineCaption({
  primary,
  secondary,
}: {
  primary: string
  secondary?: string
}) {
  return (
    <figcaption className="space-y-1">
      <p className="font-[family-name:var(--font-cursive)] italic text-[15px] font-light leading-snug text-[hsl(var(--foreground))]">
        {primary}
      </p>
      {secondary && (
        <p className="flex items-baseline gap-2 font-display-uppercase text-[9px] tracking-[0.3em] text-[hsl(var(--muted-foreground))]">
          <span
            className="inline-block w-6 h-px translate-y-[-3px]"
            style={{ background: 'rgba(201, 169, 110, 0.55)' }}
            aria-hidden
          />
          {secondary}
        </p>
      )}
    </figcaption>
  )
}
