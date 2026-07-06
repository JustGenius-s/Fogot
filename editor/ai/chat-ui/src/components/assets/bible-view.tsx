import { useCallback, useEffect, useMemo, useState, type FC, type ReactNode } from 'react'
import {
  GlobeIcon,
  PaletteIcon,
  ScaleIcon,
  MicIcon,
  CheckIcon,
  XIcon,
  PlusIcon,
  Trash2Icon,
  BookHeartIcon,
  Loader2Icon,
  SparklesIcon,
} from 'lucide-react'
import { Streamdown } from 'streamdown'
import {
  type DesignBible,
  type BiblePaletteEntry,
  type BibleClusterId,
  bibleHasContent,
  emptyBible,
  exampleBible,
  loadDesignBible,
  serializeBible,
  BIBLE_PATH,
} from '@/lib/design-bible'
import { bridgeRPC } from '@/bridge'
import { useTranslation, type MessageKey } from '@/lib/i18n'
import { useProjectKindsVersion } from '@/components/assets/use-kinds'

interface BibleViewProps {
  /** Notify parent when the bible changes (saved / deleted) so prompt reloads. */
  onChanged: () => void
}

/**
 * Design Bible view — a document-style editor for the project's brand & lore
 * contract at `res://.design/_template.md`.
 *
 * Unlike a form, the Bible is rendered as a structured document grouped into
 * four themed clusters (World / Look / Numbers / Voice & Rules). Each section
 * has an inline "edit" affordance on hover; clicking it turns just that
 * section into an editor, so users always see the document shape and only
 * disrupt the part they're changing. Saving writes the whole file.
 */
export const BibleView: FC<BibleViewProps> = ({ onChanged }) => {
  useProjectKindsVersion()
  const { t } = useTranslation()
  const [bible, setBible] = useState<DesignBible | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(() => {
    setLoading(true)
    loadDesignBible()
      .then(setBible)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  // The working draft — kept in sync with the loaded bible; section editors
  // mutate it and a single Save persists the whole file.
  const [draft, setDraft] = useState<DesignBible>(emptyBible())
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    setDraft(bibleHasContent(bible) ? { ...bible } : emptyBible())
    setDirty(false)
  }, [bible])

  const update = (patch: Partial<DesignBible>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setDirty(true)
  }

  const save = async () => {
    setBusy(true)
    try {
      await bridgeRPC('write_file', { path: BIBLE_PATH, content: serializeBible(draft) })
      setDirty(false)
      reload()
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await bridgeRPC('delete_file', { path: BIBLE_PATH })
      setBible(undefined)
      setDraft(emptyBible())
      setDirty(false)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const createFromExample = () => {
    const ex = exampleBible()
    setDraft(ex)
    setDirty(true)
    // Don't persist yet — let the user review and hit Save.
  }
  const createBlank = () => {
    setDraft(emptyBible())
    setDirty(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2Icon className="mr-2 size-4 animate-spin" />
        {t('common.loading')}
      </div>
    )
  }

  // No bible yet — offer example or blank start.
  if (!bibleHasContent(bible) && !dirty) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-2xl border border-dashed border-border/60 px-6 py-14 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <BookHeartIcon className="size-7" />
        </span>
        <div className="space-y-1.5">
          <h3 className="text-base font-semibold">{t('design.bibleEmpty')}</h3>
          <p className="text-xs text-muted-foreground">{t('design.bibleEmptyHint')}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={createFromExample}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <SparklesIcon className="size-4" />
            {t('design.bibleCreate')}
          </button>
          <button
            type="button"
            onClick={createBlank}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50"
          >
            <PlusIcon className="size-4" />
            {t('design.bibleCreateBlank')}
          </button>
        </div>
      </div>
    )
  }

  const hasContent = bibleHasContent(draft)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-8">
      {/* Document header */}
      <header
        className="relative overflow-hidden rounded-2xl border border-border/60 px-7 py-8"
        style={{ background: 'linear-gradient(135deg, oklch(0.23 0.04 250), oklch(0.19 0.02 250))' }}
      >
        <div className="absolute -right-16 -top-16 size-52 rounded-full opacity-25 blur-3xl" style={{ background: 'oklch(0.7 0.10 250)' }} />
        <div className="absolute -left-10 -bottom-10 size-40 rounded-full opacity-15 blur-2xl" style={{ background: 'oklch(0.65 0.12 230)' }} />
        <div className="relative space-y-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-primary">
            <BookHeartIcon className="size-3.5" />
            {t('design.bible')}
          </div>
          {hasContent ? (
            <>
              <input
                value={draft.title ?? ''}
                onChange={(e) => update({ title: e.target.value })}
                placeholder={t('design.bible.titlePh')}
                className="w-full bg-transparent text-3xl font-bold text-foreground outline-none placeholder:text-foreground/30"
              />
              <input
                value={draft.logline ?? ''}
                onChange={(e) => update({ logline: e.target.value })}
                placeholder={t('design.bible.loglinePh')}
                className="w-full bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/40"
              />
            </>
          ) : (
            <h2 className="text-2xl font-bold text-foreground">{t('design.bibleUntitled')}</h2>
          )}
        </div>
      </header>

      {/* Cluster sections */}
      <Cluster id="world" icon={<GlobeIcon className="size-4" />} draft={draft} update={update} />
      <Cluster id="look" icon={<PaletteIcon className="size-4" />} draft={draft} update={update} />
      <Cluster id="numbers" icon={<ScaleIcon className="size-4" />} draft={draft} update={update} />
      <Cluster id="voice" icon={<MicIcon className="size-4" />} draft={draft} update={update} />

      {/* Action bar */}
      <div className="sticky bottom-0 -mx-3 mt-2 flex items-center justify-between gap-2 rounded-t-xl border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={remove}
          disabled={busy || !bibleHasContent(bible)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
        >
          <Trash2Icon className="size-3.5" />
          {t('design.bibleDelete')}
        </button>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-muted-foreground">●</span>}
          <button
            type="button"
            onClick={save}
            disabled={busy || !dirty}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : <CheckIcon className="size-3.5" />}
            {t('design.bibleSave')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Cluster wrapper ──────────────────────────────────────────────

const CLUSTER_LABEL_KEY: Record<BibleClusterId, MessageKey> = {
  world: 'design.bibleC.world',
  look: 'design.bibleC.look',
  numbers: 'design.bibleC.numbers',
  voice: 'design.bibleC.voice',
}

const CLUSTER_ACCENT: Record<BibleClusterId, string> = {
  world: 'oklch(0.7 0.10 250)',
  look: 'oklch(0.7 0.13 295)',
  numbers: 'oklch(0.7 0.13 155)',
  voice: 'oklch(0.7 0.13 70)',
}

const Cluster: FC<{
  id: BibleClusterId
  icon: ReactNode
  draft: DesignBible
  update: (patch: Partial<DesignBible>) => void
}> = ({ id, icon, draft, update }) => {
  const { t } = useTranslation()
  const accent = CLUSTER_ACCENT[id]
  return (
    <section
      className="overflow-hidden rounded-2xl border border-border/60 bg-card"
      style={{ ['--cluster-accent' as string]: accent }}
    >
      <div
        className="flex items-center gap-2.5 px-5 py-3.5"
        style={{ background: `linear-gradient(to right, oklch(0.7 0.10 ${hueFor(id)} / 0.12), transparent)` }}
      >
        <span
          className="flex size-7 items-center justify-center rounded-lg"
          style={{ background: `oklch(0.7 0.10 ${hueFor(id)} / 0.2)`, color: accent }}
        >
          {icon}
        </span>
        <h2 className="text-sm font-semibold text-foreground">{t(CLUSTER_LABEL_KEY[id])}</h2>
      </div>
      <div className="space-y-5 px-5 py-5">
        {id === 'world' && <WorldSection draft={draft} update={update} />}
        {id === 'look' && <LookSection draft={draft} update={update} />}
        {id === 'numbers' && <NumbersSection draft={draft} update={update} />}
        {id === 'voice' && <VoiceSection draft={draft} update={update} />}
      </div>
    </section>
  )
}

function hueFor(id: BibleClusterId): number {
  return { world: 250, look: 295, numbers: 155, voice: 70 }[id]
}

// ─── Sections ─────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary/60'
const labelCls = 'mb-1.5 block text-xs font-semibold text-muted-foreground'

const WorldSection: FC<{ draft: DesignBible; update: (p: Partial<DesignBible>) => void }> = ({ draft, update }) => {
  const { t } = useTranslation()
  return (
    <>
      <div>
        <label className={labelCls}>{t('design.bible.world')}</label>
        <textarea
          value={draft.world ?? ''}
          onChange={(e) => update({ world: e.target.value })}
          placeholder={t('design.bible.worldPh')}
          rows={8}
          className={`${inputCls} min-h-40 resize-y font-mono text-xs leading-relaxed`}
        />
        {draft.world?.trim() && (
          <div className="mt-2 rounded-lg border border-border/40 bg-muted/20 p-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Preview</div>
            <div className="aui-md text-sm">
              <Streamdown mode="static">{draft.world}</Streamdown>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

const LookSection: FC<{ draft: DesignBible; update: (p: Partial<DesignBible>) => void }> = ({ draft, update }) => {
  const { t } = useTranslation()
  const palette = draft.palette ?? []
  return (
    <>
      <div>
        <label className={labelCls}>{t('design.bible.artStyle')}</label>
        <input
          className={inputCls}
          value={(draft.artStyle ?? []).join(', ')}
          onChange={(e) => update({ artStyle: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          placeholder={t('design.bible.artStylePh')}
        />
        {(draft.artStyle ?? []).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {draft.artStyle!.map((s) => (
              <span key={s} className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium">{s}</span>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className={labelCls}>{t('design.bible.palette')}</label>
        {palette.length > 0 && (
          // Large swatch strip — the palette is the most visually expressive
          // part of the Bible, so it deserves real visual weight, not chips.
          <div className="mb-3 flex h-20 overflow-hidden rounded-xl border border-border/50">
            {palette.map((p, i) => (
              <div
                key={i}
                className="flex flex-1 items-end justify-center p-2"
                style={{ background: p.raw }}
                title={p.label ? `${p.label} · ${p.raw}` : p.raw}
              >
                <span
                  className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm"
                >
                  {p.label ?? p.raw}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-1.5">
          {palette.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="color"
                value={isHexColor(p.raw) ? p.raw : '#888888'}
                onChange={(e) => updatePalette(draft, update, i, { raw: e.target.value, label: p.label })}
                className="size-9 shrink-0 cursor-pointer rounded-md border border-border bg-background p-1"
              />
              <input
                className={`${inputCls} flex-1`}
                value={p.label ?? ''}
                onChange={(e) => updatePalette(draft, update, i, { raw: p.raw, label: e.target.value })}
                placeholder={t('design.bible.titlePh')}
              />
              <input
                className={`${inputCls} w-28 font-mono`}
                value={p.raw}
                onChange={(e) => updatePalette(draft, update, i, { raw: e.target.value, label: p.label })}
                placeholder="#rrggbb"
              />
              <button
                type="button"
                onClick={() => removePalette(draft, update, i)}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => addPalette(draft, update)}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-muted/40"
        >
          <PlusIcon className="size-3.5" />
          {t('design.bible.addColor')}
        </button>
      </div>
    </>
  )
}

const NumbersSection: FC<{ draft: DesignBible; update: (p: Partial<DesignBible>) => void }> = ({ draft, update }) => {
  const { t } = useTranslation()
  const entries = useMemo(() => Object.entries(draft.statScale ?? {}), [draft.statScale])
  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')

  const add = () => {
    const k = newKey.trim()
    const v = Number(newVal)
    if (!k || !Number.isFinite(v)) return
    update({ statScale: { ...(draft.statScale ?? {}), [k]: v } })
    setNewKey('')
    setNewVal('')
  }

  return (
    <div>
      <label className={labelCls}>{t('design.bible.statScale')}</label>
      {entries.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {entries.map(([k, v]) => (
            <div
              key={k}
              className="group flex items-center justify-between rounded-lg border border-border/50 bg-background px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-xs text-muted-foreground">{k}</div>
                <input
                  type="number"
                  value={v}
                  onChange={(e) => {
                    const nv = Number(e.target.value)
                    if (Number.isFinite(nv)) update({ statScale: { ...(draft.statScale ?? {}), [k]: nv } })
                  }}
                  className="w-20 bg-transparent text-sm font-semibold tabular-nums outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                const next = { ...(draft.statScale ?? {}) }
                delete next[k]
                update({ statScale: next })
                }}
                className="ml-1 shrink-0 rounded p-0.5 text-muted-foreground/50 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          className={`${inputCls} flex-1`}
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="hp"
        />
        <input
          type="number"
          className={`${inputCls} w-24`}
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          placeholder="100"
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button
          type="button"
          onClick={add}
          disabled={!newKey.trim() || !Number.isFinite(Number(newVal))}
          className="shrink-0 rounded-lg bg-muted px-3 py-2 text-xs font-medium transition-colors hover:bg-muted/70 disabled:opacity-40"
        >
          <PlusIcon className="size-3.5" />
        </button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground/70">
        {t('design.bible.commaHint')}: hp=100 表示设计稿里 hp 应在 100 量级，超出 2× 警告，超出 5× 报错。
      </p>
    </div>
  )
}

const VoiceSection: FC<{ draft: DesignBible; update: (p: Partial<DesignBible>) => void }> = ({ draft, update }) => {
  const { t } = useTranslation()
  return (
    <>
      <div>
        <label className={labelCls}>{t('design.bible.naming')}</label>
        <input
          className={inputCls}
          value={draft.naming ?? ''}
          onChange={(e) => update({ naming: e.target.value })}
          placeholder={t('design.bible.namingPh')}
        />
      </div>
      <div>
        <label className={labelCls}>{t('design.bible.tagVocabulary')}</label>
        <input
          className={inputCls}
          value={(draft.tagVocabulary ?? []).join(', ')}
          onChange={(e) => update({ tagVocabulary: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          placeholder={t('design.bible.tagVocabPh')}
        />
        {(draft.tagVocabulary ?? []).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {draft.tagVocabulary!.map((s) => (
              <span key={s} className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">{s}</span>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className={labelCls}>{t('design.bible.requiredFields')}</label>
        <input
          className={`${inputCls} font-mono`}
          value={(draft.requiredFields ?? []).join(', ')}
          onChange={(e) => update({ requiredFields: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          placeholder={t('design.bible.requiredFieldsPh')}
        />
      </div>
      <div>
        <label className={labelCls}>{t('design.bible.antiPatterns')}</label>
        <div className="space-y-1.5">
          {(draft.antiPatterns ?? []).map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className={inputCls}
                value={s}
                onChange={(e) => updateList(draft, update, 'antiPatterns', i, e.target.value)}
                placeholder={t('design.bible.antiPatternsPh')}
              />
              <button
                type="button"
                onClick={() => removeList(draft, update, 'antiPatterns', i)}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => addList(draft, update, 'antiPatterns')}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-muted/40"
        >
          <PlusIcon className="size-3.5" />
          {t('design.bible.addRule')}
        </button>
      </div>
    </>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────

function isHexColor(s: string): boolean {
  return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(s.trim())
}

function updatePalette(draft: DesignBible, update: (p: Partial<DesignBible>) => void, i: number, entry: BiblePaletteEntry) {
  const next = [...(draft.palette ?? [])]
  next[i] = entry
  update({ palette: next })
}
function addPalette(draft: DesignBible, update: (p: Partial<DesignBible>) => void) {
  update({ palette: [...(draft.palette ?? []), { raw: '#ffffff' }] })
}
function removePalette(draft: DesignBible, update: (p: Partial<DesignBible>) => void, i: number) {
  const next = [...(draft.palette ?? [])]
  next.splice(i, 1)
  update({ palette: next })
}

type ListKey = 'antiPatterns' | 'tagVocabulary' | 'requiredFields' | 'artStyle'
function updateList(draft: DesignBible, update: (p: Partial<DesignBible>) => void, key: ListKey, i: number, value: string) {
  const next = [...(draft[key] ?? [])]
  next[i] = value
  update({ [key]: next } as Partial<DesignBible>)
}
function addList(draft: DesignBible, update: (p: Partial<DesignBible>) => void, key: ListKey) {
  update({ [key]: [...(draft[key] ?? []), ''] } as Partial<DesignBible>)
}
function removeList(draft: DesignBible, update: (p: Partial<DesignBible>) => void, key: ListKey, i: number) {
  const next = [...(draft[key] ?? [])]
  next.splice(i, 1)
  update({ [key]: next } as Partial<DesignBible>)
}
