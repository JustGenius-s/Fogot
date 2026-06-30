"use client";

import { useState } from "react";
import { useConfig, setModels, type ModelConfig, type ModelType } from "@/bridge";
import { emptyModel } from "./shared";

/** Shared settings form/list state, used by the settings page and any future hosts. */
export function useSettingsState() {
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
