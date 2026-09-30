import { Component, type ReactNode } from 'react'

/** Évite la page blanche : une erreur d'affichage laisse la navigation utilisable. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 py-16 text-center">
        <p className="text-lg font-semibold">Oups, cette page a planté.</p>
        <p className="text-sm break-words text-slate-400">{this.state.error.message}</p>
        <div className="flex justify-center gap-2">
          <button type="button" onClick={() => this.setState({ error: null })} className="rounded-lg bg-slate-800 px-3.5 py-2 text-sm ring-1 ring-slate-700">
            Réessayer
          </button>
          <a href="/" className="rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-semibold text-slate-950">
            Retour aux cartes
          </a>
        </div>
      </div>
    )
  }
}
