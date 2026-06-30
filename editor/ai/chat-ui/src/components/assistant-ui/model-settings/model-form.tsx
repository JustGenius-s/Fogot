"use client";

import { type FC } from "react";
import { Button } from "@/components/ui/button";
import {
  SelectRoot,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/assistant-ui/select";
import { useTranslation } from "@/lib/i18n";
import { resolveCapabilities } from "@/lib/model-capabilities";
import type {
  ModelConfig,
  ModelAuthMode,
  ModelCapabilities,
} from "@/bridge";
import { CapabilityToggle, MODEL_TYPE_KEY, inputClass, labelClass } from "./shared";

export const ModelForm: FC<{
  model: ModelConfig;
  isNew: boolean;
  onChange: (m: ModelConfig) => void;
  onSave: () => void;
  onCancel: () => void;
}> = ({ model, isNew, onChange, onSave, onCancel }) => {
  const { t } = useTranslation();
  const set = (patch: Partial<ModelConfig>) => onChange({ ...model, ...patch });
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
                onValueChange={(value) => set({ authMode: value as ModelAuthMode })}
              >
                <SelectTrigger className="w-full rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bearer">{t("settings.authBearer")}</SelectItem>
                  <SelectItem value="none">{t("settings.authNone")}</SelectItem>
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
                  onChange={(e) => set({ maxTokens: Number(e.target.value) || 4096 })}
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
                  onChange={(e) => set({ temperature: Number(e.target.value) || 0.7 })}
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
                    contextWindow: e.target.value ? Number(e.target.value) : undefined,
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
                onChange={(e) => set({ extraBody: e.target.value || undefined })}
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
