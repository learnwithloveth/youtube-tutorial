'use client';

/**
 * Last-resort boundary, for a failure in the root layout itself.
 *
 * It has to render its own <html> and <body>: if the root layout threw, there
 * is no document around this. That also means none of the app's styling is
 * guaranteed to be present, so the few rules that matter are inline rather than
 * class names — a stylesheet that failed to load is one of the ways to get here.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          background: '#05060b',
          color: '#edeff7',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          display: 'grid',
          placeItems: 'center',
          minHeight: '100dvh',
          margin: 0,
          padding: '1.5rem',
        }}
      >
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 600, margin: 0 }}>
            The page could not be loaded
          </h1>
          <p style={{ marginTop: '1rem', color: '#9ba3be', lineHeight: 1.6 }}>
            Something failed before the site could render. The issue has been logged.
          </p>
          {error.digest ? (
            <p style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#7d85a3' }}>
              Reference {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '2rem',
              borderRadius: '999px',
              border: 'none',
              background: '#8b5cf6',
              color: '#ffffff',
              padding: '0.75rem 1.75rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
