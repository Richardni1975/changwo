import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100dvh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#0F0F23', color: '#F8FAFC', padding: 32,
          fontFamily: 'sans-serif', textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ marginBottom: 8 }}>加载失败</h2>
          <p style={{ color: '#94A3B8', fontSize: 14, maxWidth: 320, lineHeight: 1.6 }}>
            {this.state.error.message || '未知错误'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 24, padding: '12px 32px', borderRadius: 12,
              background: '#6366F1', color: '#fff', border: 'none',
              fontSize: 16, cursor: 'pointer',
            }}
          >重新加载</button>
        </div>
      );
    }
    return this.props.children;
  }
}
