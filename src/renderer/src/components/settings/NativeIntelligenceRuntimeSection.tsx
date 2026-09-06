import { useEffect } from 'react'
import { Cpu, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '../ui/button'
import { SettingsSubsectionHeader } from './SettingsFormControls'
import { selectNativeIntelligencePresentation } from '@/store/slices/native-intelligence-presentation'

export function NativeIntelligenceRuntimeSection(): React.JSX.Element {
  const snapshot = useAppStore((state) => state.nativeIntelligenceSnapshot)
  const error = useAppStore((state) => state.nativeIntelligenceError)
  const refreshing = useAppStore((state) => state.nativeIntelligenceRefreshing)
  const refresh = useAppStore((state) => state.refreshNativeIntelligenceSnapshot)

  const presentation = selectNativeIntelligencePresentation({
    nativeIntelligenceSnapshot: snapshot,
    nativeIntelligenceError: error,
    nativeIntelligenceRefreshing: refreshing
  })

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <section className="space-y-3" data-testid="code-fusion-native-runtime-section">
      <SettingsSubsectionHeader
        title="Local AI Runtime"
        description="Read-only Code Fusion alpha connection to the native model runtime."
      />

      <div className="rounded-lg border border-border/70 bg-card/40">
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/40">
              <Cpu className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{presentation.title}</p>
                <RuntimeStatePill kind={presentation.kind} />
                {presentation.isStale ? (
                  <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    stale
                  </span>
                ) : null}
              </div>
              {presentation.detail ? (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {presentation.detail}
                </p>
              ) : null}
              {snapshot ? (
                <p className="mt-1 text-[11px] text-muted-foreground/80">
                  {snapshot.health.runtimeName}
                  {snapshot.health.runtimeVersion ? ` · ${snapshot.health.runtimeVersion}` : ''}
                  {' · '}protocol v{snapshot.health.protocolVersion}
                </p>
              ) : null}
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            {refreshing ? 'Checking…' : 'Refresh'}
          </Button>
        </div>

        <div className="grid grid-cols-3 divide-x divide-border/60 border-b border-border/60">
          <Metric label="Models" value={presentation.modelCount} />
          <Metric label="Installed" value={presentation.installedModelCount} />
          <Metric label="Loaded" value={presentation.loadedModelCount} />
        </div>

        <div className="space-y-3 px-4 py-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Capabilities
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {snapshot?.health.capabilities.length ? (
                snapshot.health.capabilities.map((capability) => (
                  <span
                    key={capability}
                    className="rounded-md border border-border/70 bg-muted/30 px-2 py-1 text-xs"
                  >
                    {capability}
                  </span>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">No runtime capabilities reported.</span>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Model inventory
              </p>
              {snapshot ? (
                <span className="text-[11px] text-muted-foreground">
                  Updated {formatTimestamp(snapshot.refreshedAt)}
                </span>
              ) : null}
            </div>

            {!snapshot ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Refresh to check the local runtime and discover installed models.
              </p>
            ) : snapshot.modelInventoryError ? (
              <p className="mt-2 rounded-md border border-border/70 bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
                {snapshot.modelInventoryError}
              </p>
            ) : snapshot.models.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No local models were reported.</p>
            ) : (
              <div className="mt-2 divide-y divide-border/60 overflow-hidden rounded-md border border-border/70">
                {snapshot.models.map((model) => (
                  <div key={model.id} className="flex items-start justify-between gap-4 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{model.displayName}</p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{model.id}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {model.capabilities.map((capability) => (
                          <span
                            key={capability}
                            className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {capability}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-medium capitalize">{model.state}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {model.sizeBytes ? formatBytes(model.sizeBytes) : model.source}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Alpha safety boundary: this surface is read-only. Model download, load, unload, removal,
            credential editing, and process control remain disabled until mounted runtime certification
            passes on macOS.
          </div>
        </div>
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <div className="px-4 py-3 text-center">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

function RuntimeStatePill({ kind }: { kind: string }): React.JSX.Element {
  return (
    <span className="rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {kind}
    </span>
  )
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'size unknown'
  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const scaled = value / 1024 ** exponent
  return `${scaled >= 10 || exponent === 0 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[exponent]}`
}
