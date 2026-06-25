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
  UserIcon,
  PackageIcon,
  SparklesIcon,
  SkullIcon,
  MapIcon,
  PencilRulerIcon,
  AudioLinesIcon,
  BookTextIcon,
  GaugeIcon,
  ListTreeIcon,
  TagsIcon,
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
  type FieldDef,
  fieldsFor,
  fieldLabel,
  getKind,
  kindLabel,
} from '@/lib/design-schema'
import { bridgeRPC } from '@/bridge'
import { useTranslation, useLocale } from '@/lib/i18n'

const KIND_ICONS: Record<string, FC<{ className?: string }>> = {
  User: UserIcon,
  Package: PackageIcon,
  Sparkles: SparklesIcon,
  Skull: SkullIcon,
  Map: MapIcon,
  PencilRuler: PencilRulerIcon,
}

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
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [syncState, setSyncState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [meta, setMeta] = useState<DesignMeta>({})
  const [body, setBody] = useState('')

  useEffect(() => {
    setEditing(false)
    setSyncState('idle')
    setMeta(design ? { ...design.meta } : {})
    setBody(design?.body ?? '')
  }, [design])

  if (!design) return null

  const type = typeof meta.type === 'string' ? meta.type : undefined
  const kind = getKind(type)
  const KindIcon = KIND_ICONS[kind.icon ?? 'PencilRuler'] ?? PencilRulerIcon
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
          stats.push({ key: `${f.key}.${sub.key}`, label: fieldLabel(sub, locale), value: v, max: sub.max })
        }
      }
    } else if (f.type === 'number') {
      const v = meta[f.key]
      if (typeof v === 'number') stats.push({ key: f.key, label: fieldLabel(f, locale), value: v, max: f.max })
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

  return (
    <Dialog open={!!design} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        {/* ── Header / Hero ── */}
        {editing ? (
          <div className="flex shrink-0 items-start gap-3 border-b border-border/50 px-5 py-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <KindIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <DialogHeader className="text-left">
                <DialogTitle className="sr-only">{designTitle(design)}</DialogTitle>
              </DialogHeader>
              <input
                value={typeof meta.name === 'string' ? meta.name : ''}
                onChange={(e) => setField('name', e.target.value)}
                placeholder={fieldLabel({ key: 'name', type: 'string', label: 'Name', labelZh: '名称' }, locale)}
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-base font-medium"
              />
              <textarea
                value={typeof meta.summary === 'string' ? meta.summary : ''}
                onChange={(e) => setField('summary', e.target.value)}
                placeholder={fieldLabel({ key: 'summary', type: 'text', label: 'Summary', labelZh: '一句话简介' }, locale)}
                className="w-full resize-none rounded-md border border-border bg-background px-2 py-1 text-sm"
                rows={2}
              />
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs text-muted-foreground">{t('design.tags')}</span>
                <input
                  value={tags.join(', ')}
                  onChange={(e) => setField('tags', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                  placeholder={t('design.tagsHint')}
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
                />
              </div>
            </div>
          </div>
        ) : heroImage ? (
          <div className="relative h-40 w-full shrink-0 overflow-hidden bg-muted">
            <AssetThumb path={heroImage} className="size-full [&_img]:object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/10" />
            <span className="absolute left-4 top-3 inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
              <KindIcon className="size-3" />
              {kindLabel(kind, locale)}
            </span>
            <DialogHeader className="absolute inset-x-0 bottom-0 p-4 text-left">
              <DialogTitle className="text-xl font-semibold text-white drop-shadow-sm">
                {designTitle(design)}
              </DialogTitle>
              {summary && <p className="mt-0.5 line-clamp-2 text-sm text-white/85">{summary}</p>}
            </DialogHeader>
          </div>
        ) : (
          <div className="flex shrink-0 items-start gap-3 border-b border-border/50 px-5 py-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <KindIcon className="size-5" />
            </span>
            <DialogHeader className="min-w-0 flex-1 space-y-0.5 text-left">
              <span className="text-[11px] font-medium text-primary">{kindLabel(kind, locale)}</span>
              <DialogTitle className="truncate text-xl">{designTitle(design)}</DialogTitle>
              {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
            </DialogHeader>
          </div>
        )}

        {/* Tags row (view mode, only when hero image hid them) */}
        {!editing && tags.length > 0 && (
          <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-border/40 px-5 py-2.5">
            {tags.map((tag) => (
              <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* ── Body ── */}
        <div className="min-h-0 flex-1 divide-y divide-border/40 overflow-y-auto px-5">
          {editing ? (
            <div className="flex flex-col gap-2.5 py-4">
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
                <div key={f.key} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{fieldLabel(f, locale)}</span>
                  <input
                    value={asStringArray(meta[f.key]).join(', ')}
                    onChange={(e) =>
                      setField(f.key, e.target.value.split(',').map((s) => s.trim()).filter(Boolean))
                    }
                    placeholder={t('design.tagsHint')}
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
                  />
                </div>
              ))}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">{t('design.lore')}</span>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="min-h-40 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs leading-relaxed"
                />
              </div>
            </div>
          ) : (
            <>
              {stats.length > 0 && (
                <SectionBlock title={t('design.stats')} icon={<GaugeIcon className="size-3.5" />}>
                  <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                    {stats.map((s) => (
                      <StatCell key={s.key} label={s.label} value={s.value} max={s.max} />
                    ))}
                  </div>
                </SectionBlock>
              )}

              {(details.length > 0 || tagGroups.length > 0) && (
                <SectionBlock title={t('design.details')} icon={<ListTreeIcon className="size-3.5" />}>
                  {details.length > 0 && (
                    <dl className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
                      {details.map((d) => (
                        <div key={d.key} className="flex items-baseline justify-between gap-3">
                          <dt className="shrink-0 text-xs text-muted-foreground">{d.label}</dt>
                          <dd className="min-w-0 text-right">
                            {d.isEnum ? (
                              <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
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
                <SectionBlock title={t('design.audio')} icon={<AudioLinesIcon className="size-3.5" />}>
                  <div className="flex flex-col gap-1.5">
                    {audioItems.map((a) => (
                      <AudioPlayer key={a.key} path={a.path} label={a.label} />
                    ))}
                  </div>
                </SectionBlock>
              )}

              {hasRelationships && (
                <SectionBlock title={t('design.relationships')} icon={<LinkIcon className="size-3.5" />}>
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
                <SectionBlock title={t('design.lore')} icon={<BookTextIcon className="size-3.5" />}>
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
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/50 bg-muted/20 px-5 py-3">
            <Button variant="ghost" size="sm" onClick={handleCancel} disabled={busy}>
              <XIcon className="size-3.5" />
              {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={busy}>
              <CheckIcon className="size-3.5" />
              {t('common.save')}
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2 border-t border-border/50 bg-muted/20 px-5 py-3">
            <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => setEditing(true)} title={t('common.edit')}>
              <PencilIcon className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="size-7 p-0"
              onClick={() => navigator.clipboard?.writeText(design.path).catch(() => {})}
              title={t('common.copyPath')}
            >
              <CopyIcon className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="size-7 p-0 text-destructive hover:bg-destructive/10"
              disabled={busy}
              onClick={handleDelete}
              title={t('common.delete')}
            >
              <Trash2Icon className="size-3.5" />
            </Button>
            <div className="flex-1" />
            <Button
              variant={syncState === 'done' ? 'secondary' : 'default'}
              size="sm"
              disabled={syncState === 'busy'}
              onClick={handleSync}
            >
              {syncState === 'busy' ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : syncState === 'done' ? (
                <CheckIcon className="size-3.5" />
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

const SectionBlock: FC<{ title: string; icon?: ReactNode; children: ReactNode }> = ({ title, icon, children }) => (
  <section className="py-4">
    <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
      {icon}
      {title}
    </h3>
    {children}
  </section>
)

const StatCell: FC<{ label: string; value: number; max?: number }> = ({ label, value, max }) => {
  const pct = max && max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : null
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">{label}</span>
        <span className="shrink-0 font-mono text-xs tabular-nums">{value}</span>
      </div>
      {pct !== null && (
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}

const RefCard: FC<{
  slug: string
  target?: DesignEntry
  onNavigate: (slug: string) => void
  missingLabel: string
}> = ({ slug, target, onNavigate, missingLabel }) => {
  if (!target) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-600 dark:text-amber-400">
        <AlertTriangleIcon className="size-3" />
        {missingLabel}
      </span>
    )
  }
  const image = designImagePath(target.meta)
  return (
    <button
      type="button"
      onClick={() => onNavigate(slug)}
      className="group inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card py-1 pl-1 pr-2 text-xs transition-colors hover:border-border hover:bg-muted/50"
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

const FieldRow: FC<{
  field: FieldDef
  value: unknown
  locale: 'en' | 'zh'
  onChange: (value: unknown) => void
}> = ({ field, value, locale, onChange }) => {
  const label = fieldLabel(field, locale)
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      {field.type === 'enum' ? (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
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
          className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
      ) : field.type === 'number' ? (
        <input
          type="number"
          value={typeof value === 'number' ? value : typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
      ) : (
        <input
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
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
    <div className="flex flex-col gap-2 rounded-lg border border-border/40 bg-muted/20 p-2.5">
      <span className="text-[11px] font-medium text-muted-foreground">{fieldLabel(group, locale)}</span>
      <div className="grid grid-cols-2 gap-2">
        {subs.map((sub) => {
          const val = obj[sub.key]
          return (
            <div key={sub.key} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-muted-foreground">{fieldLabel(sub, locale)}</span>
              <input
                type="number"
                value={typeof val === 'number' ? val : typeof val === 'string' ? val : ''}
                onChange={(e) => onChange(sub.key, e.target.value === '' ? undefined : Number(e.target.value))}
                className="w-full min-w-0 rounded-md border border-border bg-background px-2 py-1 text-sm"
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
