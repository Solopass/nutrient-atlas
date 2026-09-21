import { Component, type ErrorInfo, type ReactNode } from 'react'
import { db, localDate } from '../db/db'

interface State {
  error: Error | null
}

/**
 * Last line of defence: if any screen crashes, show a recovery screen instead
 * of a blank page. It can still export a backup straight from the database,
 * so data is never stuck behind a broken screen.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Nutrient Atlas crashed:', error, info.componentStack)
  }

  private async exportBackup() {
    const data = {
      app: 'nutrient-atlas',
      version: 3,
      exportedAt: new Date().toISOString(),
      settings: await db.settings.toArray(),
      foods: await db.foods.toArray(),
      logs: await db.logs.toArray(),
      supplements: await db.supplements.toArray(),
      meals: await db.meals.toArray(),
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `nutrient-atlas-${localDate()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const btn = 'rounded-full px-4 py-2 text-sm font-semibold'
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="card w-full max-w-md p-6">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-(--dim)">
            This screen hit an error. Your logs are stored safely on this device. Reloading usually fixes it; if it keeps happening, download a backup first.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-(--panel-2) p-3 font-mono text-[11px] whitespace-pre-wrap text-(--muted)">{error.message}</pre>
          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={() => location.reload()} className={`${btn} bg-(--c-above) text-white`}>
              Reload
            </button>
            <button
              onClick={() => {
                location.hash = '#/'
                this.setState({ error: null })
              }}
              className={`${btn} border border-(--line) text-(--dim)`}
            >
              Back to Atlas
            </button>
            <button onClick={() => this.exportBackup()} className={`${btn} border border-(--line) text-(--dim)`}>
              Download backup
            </button>
          </div>
        </div>
      </div>
    )
  }
}
