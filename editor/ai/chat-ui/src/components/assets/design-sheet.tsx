import { useEffect, useState, type FC, type ReactNode } from 'react'
import {
  Trash2Icon,
  CopyIcon,
  PencilIcon,
  CheckIcon,
  XIcon,
  LinkIcon,
  CornerUpLeftIcon,
  AlertTriangleIcon,
  ChevronRightIcon,
  HardDriveDownloadIcon,
  Loader2Icon,
  RefreshCwIcon,
  GaugeIcon,
  ListTreeIcon,
  TagsIcon,
  AudioLinesIcon,
  BookTextIcon,
} from 'lucide-react'
import { Streamdown } from 'streamdown'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AssetThumb } from '@/components/assets/asset-thumb'
import { AudioPlayer } from '@/components/assets/audio-player'
import {
  type DesignEntry,
  type DesignGraph,
  type DesignMeta,
  designImagePath,
  designTitle,
  serializeDesign,
  syncDesignToResource,
} from '@/lib/designs'
import {
  type DesignKind,
  type FieldDef,
  fieldsFor,
  fieldLabel,
  getKind,
  kindColor,
  kindHue,
  kindHueVar,
  kindLabel,
  kindTint,
} from '@/lib/design-schema'
import {
  type BibleIssue,
  bibleHasContent,
  loadDesignBible,
  summarizeIssues,
  validateAgainstBible,
} from '@/lib/design-bible'
import { useProjectKindsVersion } from '@/components/assets/use-kinds'
import { resolveKindIcon } from '@/components/assets/kind-icons'
import { bridgeRPC, setAgentId, setPendingPrompt } from '@/bridge'
import { useTranslation, useLocale } from '@/lib/i18n'
import { cn } from '@/lib/utils'

// ─── End of imports ───────────────────────────────────────────────

interface DesignSheetProps {
  design: DesignEntry | null
  designs: DesignEntry[]
  graph: DesignGraph | null
  onClose: () => void
  onChanged: () => void
  /** Navigate to another design by slug (e.g. when clicking a reference). */
  onNavigate: (slug: string) => void
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

interface StatItem {
  key: string
  /** [groupKey, subKey] for nested stats, or [fieldKey] for flat ones. */
  keyPath: [string] | [string, string]
  label: string
  value: number
  max?: number
}
interface DetailItem {
  key: string
  label: string
  value: string
  isEnum: boolean
}
interface TagGroup {
  key: string
  label: string
  values: string[]
}

/**
 * Schema-driven design sheet.
 *
 * View mode partitions a design into consistent sections (hero, stats grid,
 * details grid, tags, audio, relationships, lore) separated by hairlines rather
 * than nested cards, so the presentation reads cleanly regardless of kind. Edit
 * mode exposes the same structured fields as a stacked form that round-trips
 * back to the .md via {@link serializeDesign}.
 */
export const DesignSheetDialog: FC<DesignSheetProps> = ({
  design,
  designs,
  graph,
  onClose,
  onChanged,
  onNavigate,
}) => {
  const { t } = useTranslation()
  const locale = useLocale()
  // Subscribe to project kind changes so labels/colors update if a kind is
  // overridden or added while the sheet is open.
  useProjectKindsVersion()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [syncState, setSyncState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [meta, setMeta] = useState<DesignMeta>({})
  const [body, setBody] = useState('')
  // Balance (Tweaks) mode state — declared before the early return below so the
  // reset effect can always call setBalanceMode without hitting a TDZ.
  const [balanceMode, setBalanceMode] = useState(false)
  const [tweakBusy, setTweakBusy] = useState(false)
  // Bible compliance — issues for the currently open design against the
  // project Bible. Recomputed whenever the design or its meta changes.
  const [bibleIssues, setBibleIssues] = useState<BibleIssue[]>([])
  const [bibleCheckOpen, setBibleCheckOpen] = useState(false)

  useEffect(() => {
    setEditing(false)
    setBalanceMode(false)
    setSyncState('idle')
    setMeta(design ? { ...design.meta } : {})
    setBody(design?.body ?? '')
    setBibleCheckOpen(false)
  }, [design])

  // Recompute compliance whenever the meta or design changes.
  useEffect(() => {
    if (!design) {
      setBibleIssues([])
      return
    }
    let cancelled = false
    loadDesignBible()
      .then((bible) => {
        if (cancelled) return
        if (bibleHasContent(bible)) {
          setBibleIssues(validateAgainstBible(design.meta, bible))
        } else {
          setBibleIssues([])
        }
      })
      .catch(() => {
        if (!cancelled) setBibleIssues([])
      })
    return () => {
      cancelled = true
    }
  }, [design])

  if (!design) return null

  const type = typeof meta.type === 'string' ? meta.type : undefined
  const kind = getKind(type)
  const KindIcon = resolveKindIcon(kind.icon)
  const heroImage = designImagePath(meta)
  const tags = asStringArray(meta.tags)
  const summary = typeof meta.summary === 'string' ? meta.summary.trim() : ''

  const byId = new Map(designs.map((d) => [d.slug, d]))
  const fields = fieldsFor(type)
  const refFields = fields.filter((f) => f.type === 'ref')
  const audioFields = fields.filter((f) => f.type === 'asset' && f.asset === 'audio')
  const attrFields = fields.filter(
    (f) =>
      f.type !== 'ref' &&
      f.type !== 'asset' &&
      f.key !== 'name' &&
      f.key !== 'summary' &&
      f.key !== 'tags',
  )

  // View-mode partition: numbers -> stat grid, scalars -> detail grid, tags -> chip groups.
  const stats: StatItem[] = []
  const details: DetailItem[] = []
  const tagGroups: TagGroup[] = []
  for (const f of attrFields) {
    if (f.fields) {
      const obj = asRecord(meta[f.key])
      for (const sub of f.fields) {
        const v = obj[sub.key]
        if (typeof v === 'number') {
          stats.push({ key: `${f.key}.${sub.key}`, keyPath: [f.key, sub.key], label: fieldLabel(sub, locale), value: v, max: sub.max })
        }
      }
    } else if (f.type === 'number') {
      const v = meta[f.key]
      if (typeof v === 'number') stats.push({ key: f.key, keyPath: [f.key], label: fieldLabel(f, locale), value: v, max: f.max })
    } else if (f.type === 'tags') {
      const arr = asStringArray(meta[f.key])
      if (arr.length) tagGroups.push({ key: f.key, label: fieldLabel(f, locale), values: arr })
    } else {
      const v = meta[f.key]
      if (typeof v === 'string' && v.trim()) {
        details.push({ key: f.key, label: fieldLabel(f, locale), value: v.trim(), isEnum: f.type === 'enum' })
      }
    }
  }

  const audioItems = audioFields
    .map((f) => ({ key: f.key, label: fieldLabel(f, locale), path: meta[f.key] }))
    .filter((a): a is { key: string; label: string; path: string } => typeof a.path === 'string' && !!a.path)

  const refItems = refFields
    .map((f) => ({ key: f.key, label: fieldLabel(f, locale), refs: asStringArray(meta[f.key]) }))
    .filter((r) => r.refs.length > 0)
  const backlinks = graph?.backlinks.get(design.slug) ?? []
  const hasRelationships = refItems.length > 0 || backlinks.length > 0

  const setField = (key: string, value: unknown) => setMeta((m) => ({ ...m, [key]: value }))
  const setNested = (group: string, sub: string, value: unknown) =>
    setMeta((m) => ({ ...m, [group]: { ...asRecord(m[group]), [sub]: value } }))

  const handleSave = async () => {
    setBusy(true)
    try {
      await bridgeRPC('write_file', { path: design.path, content: serializeDesign(meta, body) })
      setEditing(false)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const handleCancel = () => {
    setMeta({ ...design.meta })
    setBody(design.body)
    setEditing(false)
  }

  const handleDelete = async () => {
    setBusy(true)
    try {
      await bridgeRPC('delete_file', { path: design.path })
      onChanged()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const handleSync = async () => {
    setSyncState('busy')
    try {
      await syncDesignToResource(design.slug)
      setSyncState('done')
    } catch {
      setSyncState('error')
    }
  }

  /** Hand off to the design agent: read the current scene + this design + the
   *  Bible and align scene nodes to match. Uses the same pending-prompt
   *  mechanism as the Home composer; the user stays in control because the
   *  agent still routes every scene mutation through the undoable scene tools. */
  const handleRefreshScene = () => {
    const prompt = [
      `请把当前打开的场景按设计稿 "${designTitle(design)}" (${design.slug}) 与项目设计圣经（res://.design/_template.md）对齐。`,
      ``,
      `步骤：`,
      `1. 用 scene_list_nodes 查看当前场景的节点树（若没有打开场景，先用 scene_open 打开一个 .tscn）。`,
      `2. 用 read_file 读取这份设计稿：${design.path}。`,
      `3. 若存在设计圣经（res://.design/_template.md），也读一遍，遵循其中的画风、调色板、命名约定与反模式。`,
      `4. 找出场景里与该设计稿对应的节点（同名 / 同类 / 立绘引用）。`,
      `5. 用 scene_set_property / scene_create_node / scene_reparent_node / scene_instance_scene 等工具，把节点的属性、子节点结构、引用的资源对齐到设计稿描述。改动要可撤销（这些工具本身是 undoable）。`,
      `6. 不要重写 .tscn 文件本身——只通过场景工具操作。完成后简要汇报改了哪些节点。`,
    ].join('\n')
    setAgentId('design')
    setPendingPrompt(prompt)
    onClose()
  }

  // ── Balance (Tweaks) mode ──────────────────────────────────────
  // Numbers can be tweaked live via sliders without entering full edit mode.
  // Each tweak writes the updated frontmatter back to the .md immediately so
  // the change persists and the gallery / graph reflect it. We hold the
  // tweaked meta in `meta` (same state as edit mode) and persist on slider
  // release (onPointerUp / onChange end).
  // (balanceMode / tweakBusy state declared above, before the early return.)

  const persistTweak = async (nextMeta: DesignMeta) => {
    setTweakBusy(true)
    try {
      await bridgeRPC('write_file', {
        path: design.path,
        content: serializeDesign(nextMeta, body),
      })
      onChanged()
    } catch (e) {
      console.warn('Tweak persist failed:', e)
    } finally {
      setTweakBusy(false)
    }
  }

  const tweakStat = (key: string, sub: string | undefined, value: number) => {
    const nextMeta = sub
      ? { ...meta, [key]: { ...asRecord(meta[key]), [sub]: value } }
      : { ...meta, [key]: value }
    setMeta(nextMeta)
  }
  const commitStat = (key: string, sub: string | undefined, value: number) => {
    const nextMeta = sub
      ? { ...meta, [key]: { ...asRecord(meta[key]), [sub]: value } }
      : { ...meta, [key]: value }
    persistTweak(nextMeta)
  }

  return (
    <Dialog open={!!design} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {/* ── Header / Hero ── */}
        {editing ? (
          <div
            className="flex shrink-0 items-start gap-3 border-b border-border/50 px-5 py-5"
            style={kindHueVar(kind)}
          >
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-xl"
              style={{ background: kindTint(kind, 0.18), color: kindColor(kind, 0.78, 0.1) }}
            >
              <KindIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1 space-y-2.5">
              <DialogHeader className="text-left">
                <DialogTitle className="sr-only">{designTitle(design)}</DialogTitle>
              </DialogHeader>
              <input
                value={typeof meta.name === 'string' ? meta.name : ''}
                onChange={(e) => setField('name', e.target.value)}
                placeholder={fieldLabel({ key: 'name', type: 'string', label: 'Name', labelZh: '名称' }, locale)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base font-medium outline-none focus:border-primary/60"
              />
              <textarea
                value={typeof meta.summary === 'string' ? meta.summary : ''}
                onChange={(e) => setField('summary', e.target.value)}
                placeholder={fieldLabel({ key: 'summary', type: 'text', label: 'Summary', labelZh: '一句话简介' }, locale)}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
                rows={2}
              />
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs text-muted-foreground">{t('design.tags')}</span>
                <input
                  value={tags.join(', ')}
                  onChange={(e) => setField('tags', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                  placeholder={t('design.tagsHint')}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary/60"
                />
              </div>
            </div>
          </div>
        ) : heroImage ? (
          <div className="relative h-52 w-full shrink-0 overflow-hidden bg-muted" style={kindHueVar(kind)}>
            <AssetThumb path={heroImage} className="size-full [&_img]:object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
            <div
              className="absolute inset-x-0 bottom-0 h-24"
              style={{ background: `linear-gradient(to top, oklch(0.20 0.04 ${kindHue(kind)} / 0.55), transparent)` }}
            />
            <span
              className="absolute left-4 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur-sm"
              style={{
                background: kindTint(kind, 0.35),
                color: kindColor(kind, 0.92, 0.08),
                boxShadow: `inset 0 0 0 1px oklch(0.7 0.13 ${kindHue(kind)} / 0.4)`,
              }}
            >
              <KindIcon className="size-3" />
              {kindLabel(kind, locale)}
            </span>
            <DialogHeader className="absolute inset-x-0 bottom-0 p-4 text-left">
              <DialogTitle className="text-2xl font-semibold text-white drop-shadow-md">
                {designTitle(design)}
              </DialogTitle>
              {summary && <p className="mt-1 line-clamp-2 text-sm text-white/85">{summary}</p>}
            </DialogHeader>
          </div>
        ) : (
          <div
            className="flex shrink-0 items-start gap-3 border-b border-border/50 px-5 py-5"
            style={kindHueVar(kind)}
          >
            <span
              className="flex size-12 shrink-0 items-center justify-center rounded-xl"
              style={{ background: kindTint(kind, 0.18), color: kindColor(kind, 0.78, 0.1) }}
            >
              <KindIcon className="size-6" />
            </span>
            <DialogHeader className="min-w-0 flex-1 space-y-1 text-left">
              <span
                className="text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: kindColor(kind, 0.72, 0.1) }}
              >
                {kindLabel(kind, locale)}
              </span>
              <DialogTitle className="truncate text-xl">{designTitle(design)}</DialogTitle>
              {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
            </DialogHeader>
          </div>
        )}

        {/* Tags row (view mode, only when hero image hid them) */}
        {!editing && tags.length > 0 && (
          <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-border/40 px-5 py-3">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                style={{ background: kindTint(kind, 0.12), color: 'var(--color-muted-foreground)' }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Bible compliance bar (view mode only) */}
        {!editing && <BibleComplianceBar issues={bibleIssues} open={bibleCheckOpen} onToggle={() => setBibleCheckOpen((o) => !o)} />}

        {/* ── Body ── */}
        <div className="min-h-0 flex-1 divide-y divide-border/40 overflow-y-auto px-5">
          {editing ? (
            <div className="flex flex-col gap-3 py-5">
              {attrFields.map((f) =>
                f.fields ? (
                  <NestedNumberGroup
                    key={f.key}
                    group={f}
                    meta={meta}
                    locale={locale}
                    onChange={(sub, val) => setNested(f.key, sub, val)}
                  />
                ) : (
                  <FieldRow
                    key={f.key}
                    field={f}
                    value={meta[f.key]}
                    locale={locale}
                    onChange={(val) => setField(f.key, val)}
                  />
                ),
              )}
              {refFields.map((f) => (
                <div key={f.key} className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">{fieldLabel(f, locale)}</span>
                  <input
                    value={asStringArray(meta[f.key]).join(', ')}
                    onChange={(e) =>
                      setField(f.key, e.target.value.split(',').map((s) => s.trim()).filter(Boolean))
                    }
                    placeholder={t('design.tagsHint')}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
                  />
                </div>
              ))}
              <div className="flex flex-col gap-1.5 pt-1">
                <span className="text-xs font-medium text-muted-foreground">{t('design.lore')}</span>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="min-h-40 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-primary/60"
                />
              </div>
            </div>
          ) : (
            <>
              {bibleCheckOpen && bibleIssues.length > 0 && (
                <BibleIssuesList issues={bibleIssues} />
              )}
              {stats.length > 0 && (
                <SectionBlock
                  title={t('design.stats')}
                  icon={<GaugeIcon className="size-3" />}
                  kind={kind}
                  action={
                    <button
                      type="button"
                      onClick={() => setBalanceMode((b) => !b)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                        balanceMode
                          ? 'text-primary'
                          : 'text-muted-foreground/70 hover:text-foreground',
                      )}
                      style={balanceMode ? { background: kindTint(kind, 0.16) } : undefined}
                      title={t('design.balanceHint')}
                    >
                      <GaugeIcon className="size-3" />
                      {t('design.balance')}
                      {tweakBusy && <Loader2Icon className="ml-0.5 size-2.5 animate-spin" />}
                    </button>
                  }
                >
                  {balanceMode ? (
                    <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                      {stats.map((s) => (
                        <TweakSlider
                          key={s.key}
                          label={s.label}
                          value={s.value}
                          max={s.max}
                          kind={kind}
                          onChange={(v) => tweakStat(s.keyPath[0], s.keyPath[1], v)}
                          onCommit={(v) => commitStat(s.keyPath[0], s.keyPath[1], v)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-x-8 gap-y-3.5 sm:grid-cols-2">
                      {stats.map((s) => (
                        <StatCell key={s.key} label={s.label} value={s.value} max={s.max} kind={kind} />
                      ))}
                    </div>
                  )}
                </SectionBlock>
              )}

              {(details.length > 0 || tagGroups.length > 0) && (
                <SectionBlock title={t('design.details')} icon={<ListTreeIcon className="size-3" />} kind={kind}>
                  {details.length > 0 && (
                    <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                      {details.map((d) => (
                        <div key={d.key} className="flex items-baseline justify-between gap-3">
                          <dt className="shrink-0 text-xs text-muted-foreground">{d.label}</dt>
                          <dd className="min-w-0 text-right">
                            {d.isEnum ? (
                              <span
                                className="rounded-md px-2 py-0.5 text-xs font-medium"
                                style={{ background: kindTint(kind, 0.18), color: kindColor(kind, 0.85, 0.1) }}
                              >
                                {d.value}
                              </span>
                            ) : (
                              <span className="text-sm">{d.value}</span>
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {tagGroups.map((g) => (
                    <div key={g.key} className="mt-3 flex flex-col gap-1.5 first:mt-0">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <TagsIcon className="size-3" />
                        {g.label}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {g.values.map((v) => (
                          <span key={v} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </SectionBlock>
              )}

              {audioItems.length > 0 && (
                <SectionBlock title={t('design.audio')} icon={<AudioLinesIcon className="size-3" />} kind={kind}>
                  <div className="flex flex-col gap-1.5">
                    {audioItems.map((a) => (
                      <AudioPlayer key={a.key} path={a.path} label={a.label} />
                    ))}
                  </div>
                </SectionBlock>
              )}

              {hasRelationships && (
                <SectionBlock title={t('design.relationships')} icon={<LinkIcon className="size-3" />} kind={kind}>
                  <div className="flex flex-col gap-3">
                    {refItems.map((r) => (
                      <div key={r.key} className="flex flex-col gap-1.5">
                        <span className="text-xs text-muted-foreground">{r.label}</span>
                        <div className="flex flex-wrap gap-1.5">
                          {r.refs.map((slug) => (
                            <RefCard
                              key={slug}
                              slug={slug}
                              target={byId.get(slug)}
                              kind={kind}
                              onNavigate={onNavigate}
                              missingLabel={t('design.danglingRef', { id: slug })}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                    {backlinks.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CornerUpLeftIcon className="size-3" />
                          {t('design.referencedBy')}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {backlinks.map((bl) => (
                            <RefCard
                              key={`${bl.from}-${bl.field}`}
                              slug={bl.from}
                              target={byId.get(bl.from)}
                              kind={kind}
                              onNavigate={onNavigate}
                              missingLabel={t('design.danglingRef', { id: bl.from })}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </SectionBlock>
              )}

              {body.trim() && (
                <SectionBlock title={t('design.lore')} icon={<BookTextIcon className="size-3" />} kind={kind}>
                  <div className="aui-md text-sm">
                    <Streamdown mode="static">{body}</Streamdown>
                  </div>
                </SectionBlock>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        {editing ? (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/50 bg-muted/20 px-5 py-3.5">
            <Button variant="ghost" size="sm" onClick={handleCancel} disabled={busy}>
              <XIcon className="size-3.5" />
              {t('common.cancel')}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={busy}
              style={{ background: kindColor(kind, 0.68, 0.14), color: 'white' }}
            >
              <CheckIcon className="size-3.5" />
              {t('common.save')}
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1 border-t border-border/50 bg-muted/20 px-5 py-3">
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                className="size-8 rounded-lg"
                onClick={() => setEditing(true)}
                title={t('common.edit')}
              >
                <PencilIcon className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="size-8 rounded-lg"
                onClick={() => navigator.clipboard?.writeText(design.path).catch(() => {})}
                title={t('common.copyPath')}
              >
                <CopyIcon className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="size-8 rounded-lg text-destructive hover:bg-destructive/10"
                disabled={busy}
                onClick={handleDelete}
                title={t('common.delete')}
              >
                <Trash2Icon className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="size-8 rounded-lg"
                onClick={handleRefreshScene}
                title={t('design.refreshSceneHint')}
              >
                <RefreshCwIcon className="size-3.5" />
              </Button>
            </div>
            <div className="flex-1" />
            <Button
              size="sm"
              className="rounded-lg"
              disabled={syncState === 'busy'}
              onClick={handleSync}
              style={
                syncState === 'done'
                  ? undefined
                  : syncState === 'error'
                    ? undefined
                    : { background: kindColor(kind, 0.68, 0.14), color: 'white' }
              }
              variant={syncState === 'done' || syncState === 'error' ? 'secondary' : 'default'}
            >
              {syncState === 'busy' ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : syncState === 'done' ? (
                <CheckIcon className="size-3.5" />
              ) : syncState === 'error' ? (
                <AlertTriangleIcon className="size-3.5" />
              ) : (
                <HardDriveDownloadIcon className="size-3.5" />
              )}
              {syncState === 'done'
                ? t('design.synced')
                : syncState === 'error'
                  ? t('design.syncFailed')
                  : t('design.sync')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── View-mode pieces ─────────────────────────────────────────────

const SectionBlock: FC<{
  title: string
  icon?: ReactNode
  kind?: DesignKind
  action?: ReactNode
  children: ReactNode
}> = ({ title, icon, kind, action, children }) => (
  <section className="py-5">
    <div className="mb-3.5 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon && (
          <span
            className="flex size-5 items-center justify-center rounded-md"
            style={
              kind
                ? { background: kindTint(kind, 0.18), color: kindColor(kind, 0.8, 0.1) }
                : { background: 'var(--color-muted)', color: 'var(--color-muted-foreground)' }
            }
          >
            {icon}
          </span>
        )}
        {title}
      </h3>
      {action}
    </div>
    {children}
  </section>
)

const StatCell: FC<{ label: string; value: number; max?: number; kind?: DesignKind }> = ({
  label,
  value,
  max,
  kind,
}) => {
  const pct = max && max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : null
  const fill = kind ? kindColor(kind, 0.72, 0.14) : 'var(--color-primary)'
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">{label}</span>
        <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">{value}</span>
      </div>
      {pct !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${pct}%`, background: fill }}
          />
        </div>
      )}
    </div>
  )
}

/** Balance-mode slider for a single numeric stat. Persists on release. */
const TweakSlider: FC<{
  label: string
  value: number
  max?: number
  kind?: DesignKind
  onChange: (v: number) => void
  onCommit: (v: number) => void
}> = ({ label, value, max, kind, onChange, onCommit }) => {
  // Without a max, fall back to a sensible auto-range around the current value.
  const safeMax = max && max > 0 ? max : Math.max(10, Math.ceil(value * 2))
  const pct = Math.min(100, Math.max(0, (value / safeMax) * 100))
  const fill = kind ? kindColor(kind, 0.72, 0.14) : 'var(--color-primary)'
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">{label}</span>
        <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={safeMax}
        step={safeMax > 50 ? 1 : 0.5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        onMouseUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        className="fogot-range h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted"
        style={{ ['--fogot-range-fill' as string]: `${pct}%`, ['--fogot-range-color' as string]: fill }}
        aria-label={label}
      />
    </div>
  )
}

const RefCard: FC<{
  slug: string
  target?: DesignEntry
  kind?: DesignKind
  onNavigate: (slug: string) => void
  missingLabel: string
}> = ({ slug, target, kind, onNavigate, missingLabel }) => {
  if (!target) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-600 dark:text-amber-400">
        <AlertTriangleIcon className="size-3" />
        {missingLabel}
      </span>
    )
  }
  const image = designImagePath(target.meta)
  const hoverBorder = kind ? kindColor(kind, 0.6, 0.1) : 'var(--color-border)'
  const hoverBg = kind ? kindTint(kind, 0.1) : 'var(--color-muted)'
  return (
    <button
      type="button"
      onClick={() => onNavigate(slug)}
      className="group inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card py-1 pl-1 pr-2 text-xs transition-all hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        // Hover colors are applied via CSS variables so the kind hue can drive
        // them without a per-render stylesheet.
        ['--hover-border' as string]: hoverBorder,
        ['--hover-bg' as string]: hoverBg,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = hoverBorder
        e.currentTarget.style.background = hoverBg
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = ''
        e.currentTarget.style.background = ''
      }}
    >
      <span className="size-6 shrink-0 overflow-hidden rounded bg-muted">
        {image ? (
          <AssetThumb path={image} className="size-full [&_img]:object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center">
            <LinkIcon className="size-3 text-muted-foreground/40" />
          </span>
        )}
      </span>
      <span className="max-w-32 truncate font-medium">{designTitle(target)}</span>
      <ChevronRightIcon className="size-3 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

// ─── Edit-mode field inputs ───────────────────────────────────────

const inputCls =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary/60'

const FieldRow: FC<{
  field: FieldDef
  value: unknown
  locale: 'en' | 'zh'
  onChange: (value: unknown) => void
}> = ({ field, value, locale, onChange }) => {
  const label = fieldLabel(field, locale)
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {field.type === 'enum' ? (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        >
          <option value="">-</option>
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : field.type === 'tags' ? (
        <input
          value={asStringArray(value).join(', ')}
          onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
          className={inputCls}
        />
      ) : field.type === 'number' ? (
        <input
          type="number"
          value={typeof value === 'number' ? value : typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          className={inputCls}
        />
      ) : (
        <input
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
      )}
    </div>
  )
}

const NestedNumberGroup: FC<{
  group: FieldDef
  meta: DesignMeta
  locale: 'en' | 'zh'
  onChange: (sub: string, value: unknown) => void
}> = ({ group, meta, locale, onChange }) => {
  const obj = asRecord(meta[group.key])
  const subs = group.fields ?? []
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border/50 bg-muted/20 p-3.5">
      <span className="text-xs font-semibold text-muted-foreground">{fieldLabel(group, locale)}</span>
      <div className="grid grid-cols-2 gap-3">
        {subs.map((sub) => {
          const val = obj[sub.key]
          return (
            <div key={sub.key} className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">{fieldLabel(sub, locale)}</span>
              <input
                type="number"
                value={typeof val === 'number' ? val : typeof val === 'string' ? val : ''}
                onChange={(e) => onChange(sub.key, e.target.value === '' ? undefined : Number(e.target.value))}
                className="w-full min-w-0 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary/60"
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Bible compliance ─────────────────────────────────────────────

const COMPLIANCE_COLOR: Record<'ok' | 'warn' | 'error', string> = {
  ok: 'oklch(0.7 0.14 155)',
  warn: 'oklch(0.75 0.15 70)',
  error: 'oklch(0.65 0.2 25)',
}

const BibleComplianceBar: FC<{
  issues: BibleIssue[]
  open: boolean
  onToggle: () => void
}> = ({ issues, open, onToggle }) => {
  const { t } = useTranslation()
  const summary = summarizeIssues(issues)
  // Distinguish "no bible loaded" from "bible loaded, all good": when issues
  // is empty but we did load, show green; when there's no bible at all we
  // wouldn't render this bar (handled by parent — issues stays []).
  const color = COMPLIANCE_COLOR[summary.level]
  const label =
    summary.level === 'ok'
      ? t('design.bibleCheckOk')
      : t('design.bibleCheckIssues', { count: summary.total })
  const hasIssues = summary.total > 0
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-2 border-b border-border/40 px-5 py-2 transition-colors',
        hasIssues && 'cursor-pointer hover:bg-muted/30',
      )}
      onClick={hasIssues ? onToggle : undefined}
      title={hasIssues ? t('design.bibleCheck') : undefined}
    >
      <span
        className="flex size-5 items-center justify-center rounded-full"
        style={{ background: `${color} / 0.18`, color }}
      >
        <span
          className="size-2 rounded-full"
          style={{ background: color }}
        />
      </span>
      <span className="text-xs font-medium" style={{ color: hasIssues ? color : 'var(--color-muted-foreground)' }}>
        {label}
      </span>
      {hasIssues && (
        <>
          <ChevronRightIcon
            className={cn('ml-auto size-3.5 text-muted-foreground/60 transition-transform', open && 'rotate-90')}
          />
        </>
      )}
    </div>
  )
}

const CLUSTER_LABEL: Record<string, string> = {
  world: 'World',
  look: 'Look',
  numbers: 'Numbers',
  voice: 'Voice',
}

const BibleIssuesList: FC<{ issues: BibleIssue[] }> = ({ issues }) => {
  const { t } = useTranslation()
  return (
    <SectionBlock title={t('design.bibleCheck')} icon={<AlertTriangleIcon className="size-3" />}>
      <ul className="space-y-1.5">
        {issues.map((issue, i) => (
          <li
            key={i}
            className="flex items-start gap-2 rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs"
          >
            <span
              className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
              style={{
                background: `${COMPLIANCE_COLOR[issue.severity === 'error' ? 'error' : 'warn']} / 0.18`,
                color: COMPLIANCE_COLOR[issue.severity === 'error' ? 'error' : 'warn'],
              }}
            >
              {issue.severity}
            </span>
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {CLUSTER_LABEL[issue.cluster] ?? issue.cluster}
            </span>
            <span className="min-w-0 flex-1 text-foreground/90">{issue.message}</span>
          </li>
        ))}
      </ul>
    </SectionBlock>
  )
}
