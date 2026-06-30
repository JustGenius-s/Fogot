"use client";

import { useState, type FC } from "react";
import { SettingsIcon, ArrowLeftIcon } from "lucide-react";
import { setAppView, upsertProviderConfig, type ProviderConfig } from "@/bridge";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { useTranslation } from "@/lib/i18n";
import { emptyProvider } from "./shared";
import { ModelForm } from "./model-form";
import { ProviderConnectionEditor, ProvidersSection } from "./provider-editor";
import { ModelGroup, ImageModelGroup } from "./model-groups";
import { useSettingsState } from "./use-settings-state";

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

              <ImageModelGroup
                title={t("settings.imageModels")}
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
