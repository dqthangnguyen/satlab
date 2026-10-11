import { Component } from 'react';
import type { ReactNode } from 'react';

export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="card py-12 text-center">
        <h2 className="text-xl font-semibold">Something went wrong</h2>
        <p className="mx-auto mt-2 max-w-md text-slate-600">Your saved progress is safe. Reload the page to continue.</p>
        <button className="btn-primary mt-6" onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}
