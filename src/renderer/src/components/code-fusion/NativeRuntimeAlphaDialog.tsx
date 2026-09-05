import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  Cpu,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  XCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { OPEN_NATIVE_RUNTIME_ALPHA_EVENT } from '@/constants/code-fusion'
import { useAppStore } from '@/store'
import { safeNativeIntelligenceRendererError } from '@/store/slices/native-intelligence-state'
import { selectNativeIntelligencePresentation } from '@/store/slices/native-intelligence-presentation'
import type { NativeIntelligenceCertificationReport } from '../../../../shared/code-fusion/native-intelligence-certification'

export function NativeRuntimeAlphaDialog(): React.JSX.Element {
  const snapshot = useAppStore((state) => state.nativeIntelligenceSnapshot)
  const refreshError = useAppStore((state) => state.nativeIntelligenceError)
  const refreshing = useAppStore((state) => state.nativeIntelligenceRefreshing)
  const refreshSnapshot = useAppStore((state) => state.refreshNativeIntelligenceSnapshot)
  const [open, setOpen] = useState(false)
  const [certifying, setCertifying] = useState(false)
  const [certification, setCertification] = useState<NativeIntelligenceCertificationReport | null>(
    null
  )
  const [certificationError, setCertificationError] = useState<string | null>(null)

  const presentation = selectNativeIntelligencePresentation({
    nativeIntelligenceSnapshot: snapshot,
    nativeIntelligenceError: refreshError,
    nativeIntelligenceRefreshing: refreshing
  })

  useEffect(() => {
    const handleOpen = (): void => {
      setOpen(true)
      void refreshSnapshot()
    }
    window.addEventListener(OPEN_NATIVE_RUNTIME_ALPHA_EVENT, handleOpen)
    return () => window.removeEventListener(OPEN_NATIVE_RUNTIME_ALPHA_EVENT, handleOpen)
  }, [refreshSnapshot])

  const handleRefresh = (): void => {
    void refreshSnapshot()
  }

  const handleCertification = async (): Promise<void> => {
    if (certifying) return
    setCertifying(true)
    setCertificationError(null)
    try {
      const report = await window.api.nativeIntelligence.runReadCertification()
      setCertification(report)
      await refreshSnapshot()
    } catch (error) {
      setCertificationError(safeNativeIntelligenceRendererError(error))
    } finally {
      setCertifying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[82vh] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            <Cpu size={18} aria-hidden="true" />
            <DialogTitle>Models &amp; Native Runtime</DialogTitle>
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Read-only alpha
            </span>
          </div>
          <DialogDescription>
            Inspect the local Code Fusion native runtime and model inventory. Model downloads,
            loading, unloading, and deletion are disabled in this testing build.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <section className="rounded-lg border border-border bg-muted/20 p-4" aria-label="Runtime status">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{presentation.title}</span>
                  {presentation.refreshing ? (
                    <LoaderCircle className="animate-spin text-muted-foreground" size={14} aria-label="Refreshing" />
                  ) : null}
                  {presentation.isStale ? (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                      Stale
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {presentation.detail ?? 'Ready for a read-only runtime check.'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
                  <RefreshCw className={refreshing ? 'animate-spin' : undefined} />
                  Refresh
                </Button>
                <Button size="sm" onClick={() => void handleCertification()} disabled={certifying}>
                  {certifying ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
                  Run Read Certification
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <Metric label="Models" value={presentation.modelCount} />
              <Metric label="Installed" value={presentation.installedModelCount} />
              <Metric label="Loaded" value={presentation.loadedModelCount} />
            </div>

            {snapshot ? (
              <dl className="mt-4 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                <Detail label="Runtime" value={snapshot.health.runtimeName} />
                <Detail label="State" value={snapshot.health.state} />
                <Detail label="Protocol" value={`v${snapshot.health.protocolVersion}`} />
                <Detail label="Version" value={snapshot.health.runtimeVersion ?? 'Not reported'} />
                <Detail label="Last refreshed" value={formatTimestamp(snapshot.refreshedAt)} />
                <Detail
                  label="Capabilities"
                  value={snapshot.health.capabilities.length ? snapshot.health.capabilities.join(', ') : 'None reported'}
                />
              </dl>
            ) : null}
          </section>

          <section className="rounded-lg border border-border p-4" aria-label="Local model inventory">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Local model inventory</h3>
                <p className="text-xs text-muted-foreground">
                  Read from the native runtime. No lifecycle controls are enabled in this alpha.
                </p>
              </div>
              <span className="text-xs tabular-nums text-muted-foreground">
                {snapshot?.models.length ?? 0} reported
              </span>
            </div>

            {snapshot?.modelInventoryError ? (
              <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                Inventory error: {snapshot.modelInventoryError}
              </div>
            ) : null}

            <div className="mt-3 space-y-2">
              {snapshot?.models.length ? (
                snapshot.models.map((model) => (
                  <div key={model.id} className="rounded-md border border-border bg-muted/10 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">{model.displayName}</div>
                        <div className="truncate font-mono text-[11px] text-muted-foreground">{model.id}</div>
                      </div>
                      <div className="flex gap-1.5 text-[11px] text-muted-foreground">
                        <span className="rounded-full border border-border px-2 py-0.5">{model.state}</span>
                        <span className="rounded-full border border-border px-2 py-0.5">{model.source}</span>
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {model.capabilities.length ? model.capabilities.join(' · ') : 'No capabilities reported'}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">
                  {refreshing ? 'Checking model inventory…' : 'No local models reported.'}
                </div>
              )}
            </div>
          </section>

          <CertificationPanel report={certification} error={certificationError} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Metric({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex min-w-0 justify-between gap-3 border-b border-border/50 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right text-foreground">{value}</dd>
    </div>
  )
}

function CertificationPanel({
  report,
  error
}: {
  report: NativeIntelligenceCertificationReport | null
  error: string | null
}): React.JSX.Element {
  return (
    <section className="rounded-lg border border-border p-4" aria-label="Read certification">
      <div className="flex items-center gap-2">
        <ShieldCheck size={16} aria-hidden="true" />
        <h3 className="text-sm font-semibold text-foreground">Read certification</h3>
      </div>
      {!report && !error ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Run the bounded readiness + inventory scenario to capture test evidence from this mounted app.
        </p>
      ) : null}
      {error ? (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          {error}
        </div>
      ) : null}
      {report ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            {report.result === 'pass' ? <CheckCircle2 size={16} /> : <XCircle size={16} className="text-destructive" />}
            Overall result: {report.result.toUpperCase()}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {formatTimestamp(report.startedAt)} → {formatTimestamp(report.completedAt)}
            {report.modelCount !== null ? ` · ${report.modelCount} model(s)` : ''}
          </div>
          {report.checks.map((check) => (
            <div key={check.id} className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-xs">
              {check.status === 'pass' ? (
                <CheckCircle2 className="mt-0.5 shrink-0" size={14} />
              ) : (
                <XCircle className="mt-0.5 shrink-0 text-destructive" size={14} />
              )}
              <div>
                <div className="font-medium text-foreground">{check.id}</div>
                <div className="text-muted-foreground">{check.detail}</div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}
