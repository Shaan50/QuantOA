import { useRef, useState, type ReactNode } from 'react'
import type { Difficulty } from '../../core/types'
import type { ProgressData } from '../../storage/repository'
import { Icon } from '../components/Icon'
import { Button, Card, Field, NumberInput, PageHeader, Segmented, Toggle } from '../components/ui'
import { useRepo } from '../store'

export function SettingsScreen() {
  const repo = useRepo()
  const s = repo.settings
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const exportData = () => {
    const blob = new Blob([JSON.stringify(repo.exportAll(), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `quantoa-progress-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importData = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Partial<ProgressData>
      if (!data || typeof data !== 'object' || !Array.isArray(data.attempts ?? [])) throw new Error('bad file')
      await repo.importAll(data)
      setMsg(`Imported ${data.attempts?.length ?? 0} attempts and ${data.sessions?.length ?? 0} sessions.`)
    } catch {
      setMsg('That file is not a QuantOA export.')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Preferences" title="Settings" subtitle="Saved automatically in this browser." />

      <Group title="OA Simulation" icon="timer" desc="Defaults for the classic sprint (80 in 8) and custom OAs.">
        <div className="flex flex-wrap gap-6">
          <Field label="Time limit">
            <NumberInput value={Math.round(s.oaTimeLimitSec / 60)} min={1} max={60} suffix="min" onChange={(v) => repo.updateSettings({ oaTimeLimitSec: v * 60 })} />
          </Field>
          <Field label="Questions">
            <NumberInput value={s.oaQuestionCount} min={5} max={200} onChange={(v) => repo.updateSettings({ oaQuestionCount: v })} />
          </Field>
        </div>
        <Field label="Marking scheme" hint="+1 correct">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-[13px] text-muted">Wrong</span>
            <Segmented value={s.oaMarking.wrong} onChange={(v) => repo.updateSettings({ oaMarking: { ...s.oaMarking, wrong: v } })} options={[0, -0.25, -0.5, -1, -2].map((v) => ({ value: v, label: v === 0 ? '0' : String(v) }))} />
            <span className="text-[13px] text-muted">Skip</span>
            <Segmented value={s.oaMarking.skip} onChange={(v) => repo.updateSettings({ oaMarking: { ...s.oaMarking, skip: v } })} options={[0, -0.25, -0.5].map((v) => ({ value: v, label: String(v) }))} />
          </div>
        </Field>
        <Toggle checked={s.oaFeedback} onChange={(v) => repo.updateSettings({ oaFeedback: v })} label="Instant feedback in OA Simulation" description="Off by default to match the real test." />
      </Group>

      <Group title="Timing & difficulty" icon="target">
        <Field label="Default sprint length">
          <Segmented value={s.sprintSeconds} onChange={(v) => repo.updateSettings({ sprintSeconds: v })} options={[60, 120, 300].map((v) => ({ value: v as 60 | 120 | 300, label: `${v}s` }))} />
        </Field>
        <Toggle checked={s.adaptive} onChange={(v) => repo.updateSettings({ adaptive: v })} label="Adaptive difficulty" description="An Elo-style rating per category picks each next question's difficulty, aiming for ~70% success." />
        {!s.adaptive && (
          <Field label="Fixed difficulty">
            <Segmented value={s.defaultDifficulty} onChange={(v) => repo.updateSettings({ defaultDifficulty: v })} options={[1, 2, 3, 4, 5].map((d) => ({ value: d as Difficulty, label: String(d) }))} />
          </Field>
        )}
        <Field label="Show the correct answer for" hint="after a wrong answer">
          <Segmented value={s.feedbackMs} onChange={(v) => repo.updateSettings({ feedbackMs: v })} options={[800, 1400, 2200, 3500].map((v) => ({ value: v, label: `${v / 1000}s` }))} />
        </Field>
      </Group>

      <Group title="Look & sound" icon="sun">
        <Field label="Theme">
          <Segmented value={s.theme} onChange={(v) => repo.updateSettings({ theme: v })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
        </Field>
        <Toggle checked={s.sound} onChange={(v) => repo.updateSettings({ sound: v })} label="Sound effects" description="Short synthesized blips for correct, wrong and time warnings." />
        <Toggle checked={s.reduceMotion} onChange={(v) => repo.updateSettings({ reduceMotion: v })} label="Reduce motion" description="Disable flashes, shakes and transitions." />
      </Group>

      <Group title="Your data" icon="download" desc={`${repo.attempts.length.toLocaleString()} attempts · ${repo.sessions.length} sessions · stored in localStorage behind a swappable storage interface.`}>
        <div className="flex flex-wrap gap-2">
          <Button icon="download" onClick={exportData}>
            Export JSON
          </Button>
          <Button icon="upload" onClick={() => fileRef.current?.click()}>
            Import JSON
          </Button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
          {confirmReset ? (
            <>
              <Button
                variant="danger"
                icon="trash"
                onClick={async () => {
                  await repo.reset()
                  setConfirmReset(false)
                  setMsg('All progress was erased.')
                }}
              >
                Yes, erase everything
              </Button>
              <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="danger" icon="trash" onClick={() => setConfirmReset(true)}>
              Reset progress
            </Button>
          )}
        </div>
        {msg && <div className="text-[13px] text-ink-2">{msg}</div>}
      </Group>
    </div>
  )
}

function Group({ title, icon, desc, children }: { title: string; icon: 'timer' | 'target' | 'sun' | 'download'; desc?: string; children: ReactNode }) {
  return (
    <Card className="animate-rise grid gap-6 p-6 md:grid-cols-[240px_1fr]">
      <div>
        <div className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <Icon name={icon} size={16} className="text-brand" />
          {title}
        </div>
        {desc && <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{desc}</p>}
      </div>
      <div className="space-y-5">{children}</div>
    </Card>
  )
}
