import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Shown in the fallback so the user knows which area failed. */
  area?: string;
  /** Render the compact inline fallback instead of the full-page one. */
  inline?: boolean;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time errors so one unexpected document shape cannot blank the
 * whole dashboard. Wrap the app once, and each swappable tab region again, so a
 * failure inside a tab leaves the navigation usable.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.area ? ` · ${this.props.area}` : ''}]`, error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const area = this.props.area || 'this section';

    if (this.props.inline) {
      return (
        <div className="card-base p-6 text-center">
          <AlertTriangle size={20} className="mx-auto mb-3 text-amber-400" />
          <p className="crm-section-title mb-1">Something went wrong loading {area}</p>
          <p className="crm-label mb-4">
            The rest of the app is still working. Try again, or switch to another tab.
          </p>
          <button type="button" onClick={this.reset} className="btn-secondary mx-auto">
            <RotateCcw size={14} /> Try again
          </button>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card-base p-8 max-w-md text-center">
          <AlertTriangle size={24} className="mx-auto mb-4 text-amber-400" />
          <h1 className="crm-page-title mb-2">The dashboard hit an unexpected error</h1>
          <p className="crm-label mb-6">
            Reloading usually clears it. If it keeps happening, send a note through
            Suggestions so it can be looked at.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-primary mx-auto"
          >
            <RotateCcw size={14} /> Reload
          </button>
        </div>
      </div>
    );
  }
}
