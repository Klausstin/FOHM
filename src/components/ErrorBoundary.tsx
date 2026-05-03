import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

type ErrorBoundaryProps = {
  children: React.ReactNode;
  screenName?: string;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Pantalla interrumpida:', error);
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    if (previousProps.screenName !== this.props.screenName && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="mx-auto max-w-xl rounded-[2rem] border border-red-100 bg-red-50 p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-red-500 shadow-sm">
          <AlertTriangle size={26} />
        </div>
        <h2 className="text-2xl font-black tracking-tight text-neutral-900">Esta pantalla necesita recargarse</h2>
        <p className="mt-3 text-sm font-medium leading-6 text-neutral-600">
          La app encontro un problema en esta vista. Tus datos no se borraron; recarga la pantalla o cambia de seccion.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-neutral-900 px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-neutral-200 transition hover:bg-neutral-800"
        >
          <RotateCcw size={16} />
          Recargar
        </button>
      </div>
    );
  }
}
