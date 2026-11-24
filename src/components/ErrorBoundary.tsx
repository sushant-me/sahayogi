/**
 * Error boundary.
 *
 * A demo that white-screens has no score, regardless of how good the routing is.
 * This catches render-time failures and shows the user something actionable —
 * including the routing-integrity note, because a crash mid-answer is exactly when
 * someone would wonder whether the app lied about the source.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept console-only: there is no telemetry pipeline, and inventing one would
    // be a privacy claim this project cannot back.
    console.error("Sahayogi render error:", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-bg px-4 py-16 text-ink">
        <div className="mx-auto max-w-xl">
          <div className="rounded-xl border border-danger/35 bg-danger/[0.06] p-6">
            <h1 className="text-[16px] font-semibold">Something broke while rendering</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              The app stopped instead of continuing with a half-drawn screen. Reload to try again; your
              saved chats and routing log are on disk and will still be there.
            </p>
            <pre className="mt-3 max-h-40 overflow-auto rounded-lg border border-line bg-panel-2/70 p-3 text-[11.5px] leading-relaxed text-muted">
{error.message}
            </pre>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-bg"
              >
                Reload
              </button>
              <button
                type="button"
                onClick={() => this.setState({ error: null })}
                className="rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-[12.5px] font-medium text-ink"
              >
                Try rendering again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
