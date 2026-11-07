import { Component, type ReactNode } from 'react'

/** Se um ecrã rebentar, mostra o erro e um botão para recarregar (em vez de ficar tudo branco). */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    // Ao mudar de ecrã, tenta outra vez.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto mt-10 max-w-md rounded-xl bg-white p-5 text-center shadow-sm">
        <div className="text-4xl">😵</div>
        <h1 className="mt-2 text-lg font-bold text-ink">Algo correu mal</h1>
        <p className="mt-1 text-sm text-ink/60">Tenta recarregar. Se continuar, envia esta mensagem a quem gere a app:</p>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-paper p-2 text-left text-xs text-red-700">{this.state.error.message}</pre>
        <button onClick={() => window.location.reload()}
          className="mt-4 rounded-xl bg-volt px-5 py-2.5 font-display font-bold uppercase text-ink shadow-[0_3px_0_var(--color-volt-dark)]">
          Recarregar
        </button>
      </div>
    )
  }
}
