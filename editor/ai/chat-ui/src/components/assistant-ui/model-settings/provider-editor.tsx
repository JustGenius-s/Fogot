"use client";

import { useState, useEffect, type FC } from "react";
import { Button } from "@/components/ui/button";
import {
  PlusIcon,
  Trash2Icon,
  SquarePenIcon,
  RefreshCwIcon,
  BlocksIcon,
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
  useProviderConfigs,
  removeProviderConfig,
  type ModelType,
  type ProviderConfig,
  type ModelCapabilities,
} from "@/bridge";
import { useTranslation, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  CapabilityBadges,
  FlagBadges,
  MODALITY_ICON,
  ModalityBadge,
  ModeToggle,
  ModelCheckList,
  SearchSelect,
  inputClass,
  labelClass,
  modelTypeOf,
} from "./shared";

/**
 * Connect/edit a provider once (shared API key) and toggle which of its models
 * are enabled — mirroring opencode's `provider.{options,models}` config shape.
 */
export const ProviderConnectionEditor: FC<{
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
                    <SquarePenIcon className="size-3.5 text-muted-foreground" />
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
        <SquarePenIcon className="size-3.5 text-muted-foreground" />
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
export const ProvidersSection: FC<{
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
