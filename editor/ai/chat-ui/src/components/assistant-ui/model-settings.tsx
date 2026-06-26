"use client";

import { useState, useMemo, useEffect, type FC, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  SelectRoot,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/assistant-ui/select";
import {
  SettingsIcon,
  PlusIcon,
  Trash2Icon,
  PencilIcon,
  ArrowLeftIcon,
  SearchIcon,
  CheckIcon,
  RefreshCwIcon,
  ChevronDownIcon,
  ImageIcon,
  BlocksIcon,
  SparklesIcon,
  AudioLinesIcon,
  MessageSquareIcon,
} from "lucide-react";
import {
  useCatalog,
  ensureCatalog,
  fetchCatalog,
  getProviders,
  getProviderModels,
  getProvider,
  type CatalogProvider,
  type CatalogModel,
} from "@/lib/models-catalog";
import { ProviderLogo } from "@/components/assistant-ui/provider-logo";
import { isProviderSupported } from "@/lib/provider-registry";
import { fetchProviderModels, type FetchedModel } from "@/lib/provider-models";
import {
  useConfig,
  setModels,
  setAppView,
  useProviderConfigs,
  upsertProviderConfig,
  removeProviderConfig,
  type ModelConfig,
  type ModelAuthMode,
  type ModelType,
  type ProviderConfig,
} from "@/bridge";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { useTranslation, type MessageKey } from "@/lib/i18n";
import { resolveCapabilities } from "@/lib/model-capabilities";
import type { ModelCapabilities } from "@/bridge";
import { cn } from "@/lib/utils";

function emptyModel(type: ModelType = "chat"): ModelConfig {
  return {
    id: `model-${Date.now()}`,
    type,
    name: "",
    apiKey: "",
    apiEndpoint: type === "audio" ? "https://api.minimaxi.com" : "",
    model: type === "audio" ? "speech-2.5-hd-preview" : "",
    authMode: "bearer",
    maxTokens: 4096,
    temperature: 0.7,
    ...(type === "audio" ? { provider: "minimax" } : {}),
  };
}

const MODEL_TYPE_KEY: Record<ModelType, MessageKey> = {
  chat: "type.chat",
  image: "type.image",
  audio: "type.audio",
};

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20 placeholder:text-muted-foreground/50";

const labelClass = "text-xs font-medium text-muted-foreground/80";

const CapabilityToggle: FC<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-left transition-colors hover:border-border hover:bg-muted/50"
  >
    <span className="text-sm">{label}</span>
    <span
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "inline-block size-4 transform rounded-full bg-background shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </span>
  </button>
);

interface SearchSelectItem {
  id: string;
  label: string;
  sublabel?: string;
  icon?: ReactNode;
  badges?: ReactNode;
}

const SearchSelect: FC<{
  placeholder: string;
  items: SearchSelectItem[];
  value?: string;
  onSelect: (id: string) => void;
  emptyHint?: string;
}> = ({ placeholder, items, value, onSelect, emptyHint }) => {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (it) =>
        it.label.toLowerCase().includes(s) ||
        it.id.toLowerCase().includes(s) ||
        (it.sublabel?.toLowerCase().includes(s) ?? false),
    );
  }, [q, items]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute inset-s-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
        <input
          className={cn(inputClass, "ps-7")}
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="max-h-56 divide-y divide-border/40 overflow-y-auto rounded-lg border border-border/60">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground/60">
            {emptyHint ?? "—"}
          </div>
        ) : (
          filtered.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => onSelect(it.id)}
              className={cn(
                "flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/50",
                value === it.id && "bg-accent/60",
              )}
            >
              {it.icon}
              <span className="min-w-0 flex-1 truncate">
                {it.label}
                {it.sublabel && (
                  <span className="ms-1.5 text-xs text-muted-foreground/60">
                    {it.sublabel}
                  </span>
                )}
              </span>
              {it.badges}
              {value === it.id && <CheckIcon className="size-3.5 shrink-0" />}
            </button>
          ))
        )}
      </div>
    </div>
  );
};

const CapabilityBadges: FC<{ model: CatalogModel }> = ({ model }) => {
  const vision = model.attachment || model.modalities?.input?.includes("image");
  return (
    <span className="flex shrink-0 items-center gap-1 text-muted-foreground/70">
      {vision && <ImageIcon className="size-3.5" />}
      {model.tool_call && <BlocksIcon className="size-3.5" />}
      {model.reasoning && <SparklesIcon className="size-3.5" />}
    </span>
  );
};

/** Modality derived from a catalog model's output (image / audio / chat). */
function modelTypeOf(m: CatalogModel): ModelType {
  const out = m.modalities?.output ?? [];
  if (out.includes("image")) return "image";
  if (out.includes("audio")) return "audio";
  return "chat";
}

const MODALITY_ICON: Record<ModelType, FC<{ className?: string }>> = {
  chat: MessageSquareIcon,
  image: ImageIcon,
  audio: AudioLinesIcon,
};

/** Small modality pill (icon + label) for an enabled/listed model. */
const ModalityBadge: FC<{ type: ModelType }> = ({ type }) => {
  const { t } = useTranslation();
  const Icon = MODALITY_ICON[type];
  return (
    <span className="flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      <Icon className="size-3" />
      {t(`type.${type}` as MessageKey)}
    </span>
  );
};

/** Capability icons from plain boolean flags (for live-fetched models). */
const FlagBadges: FC<{ vision?: boolean; toolCall?: boolean; reasoning?: boolean }> = ({
  vision,
  toolCall,
  reasoning,
}) => (
  <span className="flex shrink-0 items-center gap-1 text-muted-foreground/70">
    {vision && <ImageIcon className="size-3.5" />}
    {toolCall && <BlocksIcon className="size-3.5" />}
    {reasoning && <SparklesIcon className="size-3.5" />}
  </span>
);

interface CheckItem {
  id: string;
  name: string;
  on: boolean;
  right?: ReactNode;
}

/** Searchable, multi-select checklist of models. Shared by catalog & live fetch. */
const ModelCheckList: FC<{
  items: CheckItem[];
  query: string;
  onQuery: (s: string) => void;
  onToggle: (id: string) => void;
}> = ({ items, query, onQuery, onToggle }) => {
  const { t } = useTranslation();
  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter(
        (it) => it.name.toLowerCase().includes(q) || it.id.toLowerCase().includes(q),
      )
    : items;
  return (
    <>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          className={cn(inputClass, "pl-8")}
          placeholder={t("settings.searchModels")}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>
      <div className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border border-border/60 p-1">
        {filtered.length > 0 ? (
          filtered.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => onToggle(it.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                it.on ? "bg-primary/10" : "hover:bg-muted/60",
              )}
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded border",
                  it.on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {it.on && <CheckIcon className="size-3" />}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{it.name}</span>
              {it.right}
            </button>
          ))
        ) : (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground/60">
            {t("settings.noModelsMatch")}
          </div>
        )}
      </div>
    </>
  );
};

const SectionHeader: FC<{
  title: string;
  action?: React.ReactNode;
}> = ({ title, action }) => (
  <div className="flex items-center justify-between">
    <span className="text-xs font-medium text-muted-foreground">
      {title}
    </span>
    {action}
  </div>
);

const ModelForm: FC<{
  model: ModelConfig;
  isNew: boolean;
  onChange: (m: ModelConfig) => void;
  onSave: () => void;
  onCancel: () => void;
}> = ({ model, isNew, onChange, onSave, onCancel }) => {
  const { t } = useTranslation();
  const set = (patch: Partial<ModelConfig>) =>
    onChange({ ...model, ...patch });
  const authMode = model.authMode ?? "bearer";
  const requiresApiKey = model.type !== "image" || authMode !== "none";
  const canSave = Boolean(
    model.name &&
      model.apiEndpoint &&
      model.model &&
      (!requiresApiKey || model.apiKey),
  );
  const typeLabel = t(MODEL_TYPE_KEY[model.type]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {isNew
            ? t("settings.newModel", { type: typeLabel })
            : t("settings.editModel", { type: typeLabel })}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>{t("settings.name")}</label>
          <input
            className={inputClass}
            placeholder="My Model"
            value={model.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>{t("settings.modelId")}</label>
          <input
            className={inputClass}
            placeholder="gpt-4o"
            value={model.model}
            onChange={(e) => set({ model: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>{t("settings.apiEndpoint")}</label>
          <input
            className={inputClass}
            placeholder="https://api.openai.com/v1"
            value={model.apiEndpoint}
            onChange={(e) => set({ apiEndpoint: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>{t("settings.apiKey")}</label>
          <input
            className={inputClass}
            type="password"
            placeholder="sk-..."
            value={model.apiKey}
            onChange={(e) => set({ apiKey: e.target.value })}
          />
        </div>

        {model.type === "image" && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>{t("settings.provider")}</label>
              <SelectRoot
                value={model.provider || "auto"}
                onValueChange={(value) => set({ provider: value === "auto" ? undefined : value })}
              >
                <SelectTrigger className="w-full rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t("settings.providerAuto")}</SelectItem>
                  <SelectItem value="openai">OpenAI / OpenAI-compatible</SelectItem>
                  <SelectItem value="apimart">APIMart</SelectItem>
                  <SelectItem value="minimax">MiniMax</SelectItem>
                </SelectContent>
              </SelectRoot>
              <p className="text-[10px] text-muted-foreground/60">
                {t("settings.imageProviderHint")}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>{t("settings.authMode")}</label>
              <SelectRoot
                value={authMode}
                onValueChange={(value) =>
                  set({ authMode: value as ModelAuthMode })
                }
              >
                <SelectTrigger className="w-full rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bearer">{t("settings.authBearer")}</SelectItem>
                  <SelectItem value="none">
                    {t("settings.authNone")}
                  </SelectItem>
                </SelectContent>
              </SelectRoot>
              <p className="text-[10px] text-muted-foreground/60">
                {t("settings.authHint")}
              </p>
            </div>
          </>
        )}

        {model.type === "chat" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>{t("settings.maxTokens")}</label>
                <input
                  className={inputClass}
                  type="number"
                  value={model.maxTokens ?? 4096}
                  onChange={(e) =>
                    set({ maxTokens: Number(e.target.value) || 4096 })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>{t("settings.temperature")}</label>
                <input
                  className={inputClass}
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={model.temperature ?? 0.7}
                  onChange={(e) =>
                    set({ temperature: Number(e.target.value) || 0.7 })
                  }
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>{t("settings.contextWindow")}</label>
              <input
                className={inputClass}
                type="number"
                placeholder="1000000"
                value={model.contextWindow ?? ""}
                onChange={(e) =>
                  set({
                    contextWindow: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
              />
              <p className="text-[10px] text-muted-foreground/60">
                {t("settings.contextHint")}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>{t("settings.extraBody")}</label>
              <input
                className={inputClass}
                placeholder='{"reasoning_split": true}'
                value={model.extraBody ?? ""}
                onChange={(e) =>
                  set({ extraBody: e.target.value || undefined })
                }
                spellCheck={false}
              />
              <p className="text-[10px] text-muted-foreground/60">
                {t("settings.extraBodyHint")} MiniMax: {'{"reasoning_split": true}'}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>{t("settings.capabilities")}</label>
              {(() => {
                const caps = resolveCapabilities(model);
                const setCap = (key: keyof ModelCapabilities, value: boolean) =>
                  set({ capabilities: { ...model.capabilities, [key]: value } });
                return (
                  <div className="flex flex-col gap-1.5">
                    <CapabilityToggle
                      label={t("settings.capVision")}
                      checked={caps.vision}
                      onChange={(v) => setCap("vision", v)}
                    />
                    <CapabilityToggle
                      label={t("settings.capToolCall")}
                      checked={caps.toolCall}
                      onChange={(v) => setCap("toolCall", v)}
                    />
                    <CapabilityToggle
                      label={t("settings.capReasoning")}
                      checked={caps.reasoning}
                      onChange={(v) => setCap("reasoning", v)}
                    />
                  </div>
                );
              })()}
              <p className="text-[10px] text-muted-foreground/60">
                {t("settings.capHint")}
              </p>
            </div>
          </>
        )}

        {model.type === "audio" && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>{t("settings.provider")}</label>
              <SelectRoot
                value={model.provider ?? "minimax"}
                onValueChange={(value) => set({ provider: value })}
              >
                <SelectTrigger className="w-full rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minimax">MiniMax</SelectItem>
                </SelectContent>
              </SelectRoot>
              <p className="text-[10px] text-muted-foreground/60">
                {t("settings.providerHint")}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>{t("settings.groupId")}</label>
              <input
                className={inputClass}
                placeholder="MiniMax GroupId"
                value={model.groupId ?? ""}
                onChange={(e) => set({ groupId: e.target.value || undefined })}
              />
              <p className="text-[10px] text-muted-foreground/60">
                {t("settings.groupIdHint")}
              </p>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button size="sm" onClick={onSave} disabled={!canSave}>
          {isNew ? t("common.add") : t("common.save")}
        </Button>
      </div>
    </div>
  );
};

const ModeToggle: FC<{ mode: "catalog" | "custom"; onChange: (m: "catalog" | "custom") => void }> = ({
  mode,
  onChange,
}) => {
  const { t } = useTranslation();
  const opt = (id: "catalog" | "custom", label: string) => (
    <button
      type="button"
      onClick={() => onChange(id)}
      className={cn(
        "flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
        mode === id
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
      {opt("catalog", t("settings.sourceCatalog"))}
      {opt("custom", t("settings.sourceCustom"))}
    </div>
  );
};

/** A new, empty provider connection draft. */
function emptyProvider(): ProviderConfig {
  return { id: `custom-${Date.now()}`, name: "", apiKey: "", baseURL: "", models: {} };
}

/**
 * Connect/edit a provider once (shared API key) and toggle which of its models
 * are enabled — mirroring opencode's `provider.{options,models}` config shape.
 */
const ProviderConnectionEditor: FC<{
  conn: ProviderConfig;
  isNew: boolean;
  onSave: (conn: ProviderConfig) => void;
  onCancel: () => void;
}> = ({ conn, isNew, onSave, onCancel }) => {
  const { t } = useTranslation();
  const catalogState = useCatalog();
  useEffect(() => {
    ensureCatalog();
  }, []);

  const [draft, setDraft] = useState<ProviderConfig>(conn);
  const [mode, setMode] = useState<"catalog" | "custom">(
    conn.providerId || isNew ? "catalog" : "custom",
  );
  const [pickingProvider, setPickingProvider] = useState(!conn.providerId);
  const [modelQuery, setModelQuery] = useState("");
  const [customModelId, setCustomModelId] = useState("");
  const [customType, setCustomType] = useState<ModelType>("chat");
  const [fetched, setFetched] = useState<FetchedModel[] | null>(null);
  const [fetchStatus, setFetchStatus] = useState<"idle" | "loading" | "error">("idle");
  const [fetchError, setFetchError] = useState("");

  const set = (patch: Partial<ProviderConfig>) => setDraft((d) => ({ ...d, ...patch }));

  const providers = catalogState.catalog ? getProviders() : [];
  const selectedProvider = draft.providerId ? getProvider(draft.providerId) : undefined;
  const providerModels = draft.providerId ? getProviderModels(draft.providerId) : [];

  const selectProvider = (pid: string) => {
    const p = getProvider(pid);
    setDraft((d) => ({
      ...d,
      id: isNew ? pid : d.id,
      providerId: pid,
      name: p?.name ?? pid,
      npm: p?.npm,
      baseURL: p?.api ?? "",
      models: {},
    }));
    setPickingProvider(false);
  };

  const switchMode = (m: "catalog" | "custom") => {
    setMode(m);
    if (m === "custom") {
      setDraft((d) => ({
        ...d,
        id: d.providerId ? `custom-${Date.now()}` : d.id,
        providerId: undefined,
        npm: undefined,
      }));
      setPickingProvider(false);
    } else {
      setPickingProvider(!draft.providerId);
    }
  };

  const enabledCount = Object.keys(draft.models).length;

  const toggleModel = (modelId: string, name?: string, type?: ModelType) =>
    setDraft((d) => {
      const models = { ...d.models };
      if (models[modelId]) delete models[modelId];
      else models[modelId] = { ...(name ? { name } : {}), ...(type ? { type } : {}) };
      return { ...d, models };
    });

  const addCustomModel = () => {
    const id = customModelId.trim();
    if (!id) return;
    setDraft((d) => ({
      ...d,
      models: { ...d.models, [id]: d.models[id] ?? { type: customType } },
    }));
    setCustomModelId("");
  };

  const toggleFetched = (fm: FetchedModel) =>
    setDraft((d) => {
      const models = { ...d.models };
      if (models[fm.id]) {
        delete models[fm.id];
        return { ...d, models };
      }
      const caps: Partial<ModelCapabilities> = {};
      if (fm.vision !== undefined) caps.vision = fm.vision;
      if (fm.toolCall !== undefined) caps.toolCall = fm.toolCall;
      if (fm.reasoning !== undefined) caps.reasoning = fm.reasoning;
      models[fm.id] = {
        name: fm.name,
        type: fm.type,
        ...(Object.keys(caps).length ? { capabilities: caps } : {}),
      };
      return { ...d, models };
    });

  const loadModels = async () => {
    if (!draft.baseURL?.trim()) return;
    setFetchStatus("loading");
    setFetchError("");
    try {
      setFetched(await fetchProviderModels(draft.baseURL, draft.apiKey));
      setFetchStatus("idle");
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e));
      setFetchStatus("error");
    }
  };

  const canSave = Boolean(
    enabledCount > 0 &&
      (mode === "custom"
        ? draft.name && draft.baseURL
        : draft.providerId && draft.apiKey),
  );

  return (
    <div className="flex flex-col gap-4">
      <span className="text-xs font-medium text-muted-foreground">
        {isNew ? t("settings.newProvider") : t("settings.editProvider")}
      </span>

      <ModeToggle mode={mode} onChange={switchMode} />

      {mode === "catalog" ? (
        <div className="flex flex-col gap-3">
          {!catalogState.catalog && catalogState.loading && (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-6 text-xs text-muted-foreground">
              <RefreshCwIcon className="size-3.5 animate-spin" />
              {t("settings.catalogLoading")}
            </div>
          )}
          {!catalogState.catalog && !catalogState.loading && catalogState.error && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-destructive/40 px-3 py-6 text-center text-xs text-destructive/80">
              {t("settings.catalogError")}
              <Button variant="outline" size="sm" onClick={() => fetchCatalog().catch(() => {})}>
                <RefreshCwIcon className="size-3.5" />
                {t("settings.catalogRetry")}
              </Button>
            </div>
          )}

          {catalogState.catalog && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>{t("settings.selectProvider")}</label>
                {selectedProvider && !pickingProvider ? (
                  <button
                    type="button"
                    onClick={() => setPickingProvider(true)}
                    className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-left hover:border-border"
                  >
                    <ProviderLogo providerId={selectedProvider.id} className="size-5" />
                    <span className="flex-1 truncate text-sm">{selectedProvider.name}</span>
                    <PencilIcon className="size-3.5 text-muted-foreground" />
                  </button>
                ) : (
                  <SearchSelect
                    placeholder={t("settings.searchProviders")}
                    value={draft.providerId}
                    onSelect={selectProvider}
                    items={providers.map((p: CatalogProvider) => ({
                      id: p.id,
                      label: p.name,
                      sublabel: isProviderSupported(p.npm) ? undefined : "⚠",
                      icon: <ProviderLogo providerId={p.id} className="size-5 shrink-0" />,
                    }))}
                  />
                )}
                {selectedProvider && !isProviderSupported(selectedProvider.npm) && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-500">
                    {t("settings.unsupportedProtocol")}
                  </p>
                )}
              </div>

              {draft.providerId && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className={labelClass}>{t("settings.apiKey")}</label>
                    <input
                      className={inputClass}
                      type="password"
                      placeholder="sk-..."
                      value={draft.apiKey}
                      onChange={(e) => set({ apiKey: e.target.value })}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className={labelClass}>{t("settings.enableModels")}</label>
                      <span className="text-[10px] text-muted-foreground/60">
                        {t("settings.enabledModels", { count: enabledCount })}
                      </span>
                    </div>
                    <ModelCheckList
                      query={modelQuery}
                      onQuery={setModelQuery}
                      onToggle={(id) => {
                        const m = providerModels.find((x) => x.id === id);
                        if (m) toggleModel(m.id, m.name, modelTypeOf(m));
                      }}
                      items={providerModels.map((m: CatalogModel) => {
                        const mt = modelTypeOf(m);
                        return {
                          id: m.id,
                          name: m.name,
                          on: Boolean(draft.models[m.id]),
                          right:
                            mt === "chat" ? (
                              <CapabilityBadges model={m} />
                            ) : (
                              <ModalityBadge type={mt} />
                            ),
                        };
                      })}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>{t("settings.name")}</label>
            <input
              className={inputClass}
              placeholder="My Provider"
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>{t("settings.apiEndpoint")}</label>
            <input
              className={inputClass}
              placeholder="https://api.openai.com/v1"
              value={draft.baseURL ?? ""}
              onChange={(e) => set({ baseURL: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className={labelClass}>{t("settings.enableModels")}</label>
              <Button
                variant="outline"
                size="sm"
                className="h-6 gap-1 px-2 text-xs"
                onClick={loadModels}
                disabled={!draft.baseURL?.trim() || fetchStatus === "loading"}
              >
                <RefreshCwIcon
                  className={cn("size-3.5", fetchStatus === "loading" && "animate-spin")}
                />
                {t("settings.fetchModels")}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/60">{t("settings.fetchHint")}</p>
            {fetchStatus === "error" && (
              <p className="text-[10px] text-destructive/80">
                {t("settings.fetchError")}: {fetchError}
              </p>
            )}

            {fetched && fetched.length > 0 && (
              <ModelCheckList
                query={modelQuery}
                onQuery={setModelQuery}
                onToggle={(id) => {
                  const fm = fetched.find((x) => x.id === id);
                  if (fm) toggleFetched(fm);
                }}
                items={fetched.map((fm) => ({
                  id: fm.id,
                  name: fm.name,
                  on: Boolean(draft.models[fm.id]),
                  right:
                    fm.type === "chat" ? (
                      <FlagBadges
                        vision={fm.vision}
                        toolCall={fm.toolCall}
                        reasoning={fm.reasoning}
                      />
                    ) : (
                      <ModalityBadge type={fm.type} />
                    ),
                }))}
              />
            )}

            <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-border/60 p-2">
              <span className="text-[10px] font-medium text-muted-foreground/70">
                {t("settings.orAddManually")}
              </span>
              <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
                {(["chat", "image", "audio"] as ModelType[]).map((mt) => {
                  const Icon = MODALITY_ICON[mt];
                  return (
                    <button
                      key={mt}
                      type="button"
                      onClick={() => setCustomType(mt)}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                        customType === mt
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="size-3.5" />
                      {t(`type.${mt}` as MessageKey)}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  placeholder="gpt-4o"
                  value={customModelId}
                  onChange={(e) => setCustomModelId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomModel();
                    }
                  }}
                />
                <Button variant="outline" size="sm" onClick={addCustomModel}>
                  <PlusIcon className="size-3.5" />
                </Button>
              </div>
            </div>

            {enabledCount > 0 && (
              <div className="flex flex-col gap-1 rounded-lg border border-border/60 p-1">
                {Object.entries(draft.models).map(([mid, entry]) => (
                  <div
                    key={mid}
                    className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {entry.name && entry.name !== mid ? entry.name : mid}
                    </span>
                    <ModalityBadge type={entry.type ?? "chat"} />
                    <button
                      type="button"
                      onClick={() => toggleModel(mid)}
                      className="opacity-60 transition-opacity hover:opacity-100"
                    >
                      <Trash2Icon className="size-3.5 text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>{t("settings.apiKeyOptional")}</label>
            <input
              className={inputClass}
              type="password"
              placeholder="sk-..."
              value={draft.apiKey}
              onChange={(e) => set({ apiKey: e.target.value })}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button size="sm" onClick={() => onSave(draft)} disabled={!canSave}>
          {isNew ? t("common.add") : t("common.save")}
        </Button>
      </div>
    </div>
  );
};

/** One row in the provider-connections list. */
const ProviderListItem: FC<{
  conn: ProviderConfig;
  onEdit: () => void;
  onRemove: () => void;
}> = ({ conn, onEdit, onRemove }) => {
  const { t } = useTranslation();
  const entries = Object.values(conn.models);
  const count = entries.length;
  const present = (["chat", "image", "audio"] as ModelType[]).filter((mt) =>
    entries.some((e) => (e.type ?? "chat") === mt),
  );
  return (
    <div className="group flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 transition-colors hover:border-border hover:bg-muted/50">
      {conn.providerId ? (
        <ProviderLogo providerId={conn.providerId} className="size-6 shrink-0" />
      ) : (
        <BlocksIcon className="size-5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium leading-snug">{conn.name}</div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{t("settings.enabledModels", { count })}</span>
          {present.map((mt) => {
            const Icon = MODALITY_ICON[mt];
            return <Icon key={mt} className="size-3" />;
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
      >
        <PencilIcon className="size-3.5 text-muted-foreground" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
      >
        <Trash2Icon className="size-3.5 text-muted-foreground" />
      </button>
    </div>
  );
};

/** Chat section: list of connected providers with add/edit/remove. */
const ProvidersSection: FC<{
  onAdd: () => void;
  onEdit: (conn: ProviderConfig) => void;
}> = ({ onAdd, onEdit }) => {
  const { t } = useTranslation();
  const providers = useProviderConfigs();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("settings.providers")}
        </h3>
        <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-xs" onClick={onAdd}>
          <PlusIcon className="size-3.5" />
          {t("settings.addProvider")}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground/60">{t("settings.providersHint")}</p>
      {providers.length > 0 ? (
        <div className="flex flex-col gap-2">
          {providers.map((p) => (
            <ProviderListItem
              key={p.id}
              conn={p}
              onEdit={() => onEdit(p)}
              onRemove={() => removeProviderConfig(p.id)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground/60">
          {t("settings.noProvidersYet")}
        </div>
      )}
    </div>
  );
};

const ModelListItem: FC<{
  model: ModelConfig;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ model, onEdit, onDelete }) => (
  <div className="group flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 transition-colors hover:border-border hover:bg-muted/50">
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm font-medium leading-snug">
        {model.name}
      </div>
      <div className="truncate text-xs text-muted-foreground">
        {model.model}
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      <Button variant="ghost" size="icon-xs" onClick={onEdit}>
        <PencilIcon />
      </Button>
      <Button variant="ghost" size="icon-xs" onClick={onDelete}>
        <Trash2Icon />
      </Button>
    </div>
  </div>
);

const ModelGroup: FC<{
  title: string;
  type: ModelType;
  items: ModelConfig[];
  allModels: ModelConfig[];
  onEdit: (idx: number) => void;
  onDelete: (idx: number) => void;
  onAdd: (type: ModelType) => void;
}> = ({ title, type, items, allModels, onEdit, onDelete, onAdd }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <SectionHeader
        title={title}
        action={
          <Button
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={() => onAdd(type)}
          >
            <PlusIcon className="size-3" />
            {t("common.add")}
          </Button>
        }
      />
      {items.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {items.map((m) => {
            const idx = allModels.indexOf(m);
            return (
              <ModelListItem
                key={m.id}
                model={m}
                onEdit={() => onEdit(idx)}
                onDelete={() => onDelete(idx)}
              />
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground/60">
          {t("settings.noModelsYet", { type: t(MODEL_TYPE_KEY[type]) })}
        </div>
      )}
    </div>
  );
};

/** Shared settings form/list state, used by the settings page and any future hosts. */
function useSettingsState() {
  const { models } = useConfig();
  const [editing, setEditing] = useState<ModelConfig | null>(null);
  const [editIndex, setEditIndex] = useState(-1);

  const handleEdit = (idx: number) => {
    setEditing({ ...models[idx] });
    setEditIndex(idx);
  };

  const handleAdd = (type: ModelType = "chat") => {
    setEditing(emptyModel(type));
    setEditIndex(-1);
  };

  const handleDelete = (idx: number) => {
    setModels(models.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    if (!editing) return;
    const updated = [...models];
    if (editIndex >= 0) {
      updated[editIndex] = editing;
    } else {
      updated.push(editing);
    }
    setModels(updated);
    setEditing(null);
  };

  return {
    models,
    editing,
    editIndex,
    handleEdit,
    handleAdd,
    handleDelete,
    handleSave,
    setEditing,
  };
}

/** Header gear button — opens the settings page (an AppView, not a modal). */
export const ModelSettings: FC = () => {
  const { t } = useTranslation();
  return (
    <TooltipIconButton
      tooltip={t("settings.title")}
      side="bottom"
      className="size-7"
      onClick={() => setAppView("settings")}
    >
      <SettingsIcon className="size-4" />
    </TooltipIconButton>
  );
};

/** Standalone settings page: model groups + inline edit form, mirroring the design/audio view chrome. */
export const SettingsView: FC = () => {
  const { t } = useTranslation();
  const {
    models,
    editing,
    editIndex,
    handleEdit,
    handleAdd,
    handleDelete,
    handleSave,
    setEditing,
  } = useSettingsState();

  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);
  const [providerIsNew, setProviderIsNew] = useState(false);

  const imageModels = models.filter((m) => m.type === "image" && !m.id.includes("::"));
  const audioModels = models.filter((m) => m.type === "audio" && !m.id.includes("::"));

  return (
    <div className="flex h-full flex-col bg-background @container">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5 shrink-0">
        <TooltipIconButton
          tooltip={t("common.back")}
          side="bottom"
          className="size-7"
          onClick={() => setAppView("chat")}
        >
          <ArrowLeftIcon className="size-4" />
        </TooltipIconButton>
        <span className="text-sm font-medium text-foreground">{t("settings.title")}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mx-auto flex w-full max-w-md flex-col gap-4">
          <p className="text-xs text-muted-foreground">{t("settings.description")}</p>

          {editingProvider ? (
            <ProviderConnectionEditor
              conn={editingProvider}
              isNew={providerIsNew}
              onSave={(conn) => {
                upsertProviderConfig(conn);
                setEditingProvider(null);
              }}
              onCancel={() => setEditingProvider(null)}
            />
          ) : editing ? (
            <ModelForm
              model={editing}
              isNew={editIndex < 0}
              onChange={setEditing}
              onSave={handleSave}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div className="flex flex-col gap-5">
              <ProvidersSection
                onAdd={() => {
                  setEditingProvider(emptyProvider());
                  setProviderIsNew(true);
                }}
                onEdit={(conn) => {
                  setEditingProvider(conn);
                  setProviderIsNew(false);
                }}
              />

              <ModelGroup
                title={t("settings.imageModels")}
                type="image"
                items={imageModels}
                allModels={models}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onAdd={handleAdd}
              />

              <ModelGroup
                title={t("settings.audioModels")}
                type="audio"
                items={audioModels}
                allModels={models}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onAdd={handleAdd}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
