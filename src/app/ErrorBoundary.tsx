import { Component, type ReactNode } from 'react';

interface State {
  message: string | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: Error): State {
    return { message: error.message || 'Something on this page failed.' };
  }

  render() {
    if (this.state.message) {
      return (
        <main id="main">
          <h1>This page hit a problem</h1>
          <p className="notice error">{this.state.message}</p>
          <button type="button" className="primary" onClick={() => this.setState({ message: null })}>
            Try again
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
