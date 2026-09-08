import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { ButtonLink } from '@/design-system/primitives/Button';

interface State {
  error: Error | null;
}

/**
 * Top-level resilience boundary. In production this is where the error would be
 * forwarded to the observability pipeline before rendering the fallback.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[novex] unhandled render error', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div className="max-w-md">
          <p className="eyebrow mb-4 justify-center">Something broke</p>
          <h1 className="text-3xl font-semibold">We hit an unexpected error</h1>
          <p className="mt-4 text-fg-muted">
            The issue has been logged. Reloading usually clears it.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <ButtonLink to="/" onClick={() => this.setState({ error: null })}>
              Back to home
            </ButtonLink>
          </div>
        </div>
      </div>
    );
  }
}
