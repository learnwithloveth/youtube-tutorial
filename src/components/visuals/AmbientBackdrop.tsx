/**
 * Page-wide ambient wash. Sits behind every section (which are transparent by
 * default) so long pages never collapse into a flat black rectangle between
 * their hero and the next glow. Fixed, so it costs one paint and never
 * reflows during scroll.
 */
export function AmbientBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
      style={{
        background:
          'radial-gradient(60rem 34rem at 8% 6%, color-mix(in oklab, var(--brand) 13%, transparent), transparent 62%),' +
          'radial-gradient(52rem 30rem at 96% 34%, color-mix(in oklab, var(--accent) 10%, transparent), transparent 62%),' +
          'radial-gradient(56rem 32rem at 40% 96%, color-mix(in oklab, var(--pop) 9%, transparent), transparent 64%)',
      }}
    />
  );
}
