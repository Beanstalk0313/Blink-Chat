import { Component } from 'react';
import AppErrorScreen from './AppErrorScreen';

export default class StartupErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;

    return <AppErrorScreen error={this.state.error} onRetry={() => window.location.reload()} startup />;
  }
}
