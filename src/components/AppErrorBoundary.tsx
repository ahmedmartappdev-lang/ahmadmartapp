import React from 'react';

interface State {
  error: Error | null;
  info: React.ErrorInfo | null;
}

/**
 * Top-level error boundary. Surfaces any render-time crash as visible
 * text instead of an unmounted (blank) tree, so a client screenshot
 * shows the exact error + stack we need to fix it.
 *
 * Deliberately plain: black text on white, monospace, no app chrome.
 * If this is showing, something is broken — we want clarity, not polish.
 */
export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[AppErrorBoundary]', error, info);
    this.setState({ info });
  }

  render() {
    if (this.state.error) {
      const sha = (typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'dev') as string;
      const built = (typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '') as string;
      return (
        <div
          style={{
            minHeight: '100vh',
            padding: '24px',
            background: '#ffffff',
            color: '#000000',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12,
            lineHeight: 1.45,
            overflow: 'auto',
          }}
        >
          <h1 style={{ fontSize: 18, marginBottom: 12 }}>
            App crashed — copy this text and send to support.
          </h1>
          <p style={{ marginBottom: 16, color: '#666' }}>
            build {sha} · {built}
          </p>

          <h2 style={{ fontSize: 14, marginTop: 16, marginBottom: 4 }}>Error</h2>
          <pre
            style={{
              background: '#f4f4f4',
              padding: 12,
              border: '1px solid #ddd',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {this.state.error.name}: {this.state.error.message}
          </pre>

          {this.state.error.stack && (
            <>
              <h2 style={{ fontSize: 14, marginTop: 16, marginBottom: 4 }}>Stack</h2>
              <pre
                style={{
                  background: '#f4f4f4',
                  padding: 12,
                  border: '1px solid #ddd',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {this.state.error.stack}
              </pre>
            </>
          )}

          {this.state.info?.componentStack && (
            <>
              <h2 style={{ fontSize: 14, marginTop: 16, marginBottom: 4 }}>Component tree</h2>
              <pre
                style={{
                  background: '#f4f4f4',
                  padding: 12,
                  border: '1px solid #ddd',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {this.state.info.componentStack}
              </pre>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              try {
                window.location.reload();
              } catch {
                /* ignore */
              }
            }}
            style={{
              marginTop: 24,
              padding: '8px 16px',
              border: '1px solid #000',
              background: '#fff',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 13,
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
