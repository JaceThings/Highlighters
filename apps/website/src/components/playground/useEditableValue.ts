import { useEffect, useRef, useState } from "react";
import { clamp, snap } from "./slider-utils.ts";

interface UseEditableValueOptions {
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  /** Seed formatter for the input when `format` returns a non-parseable display string. Falls back to `format`. */
  formatSeed?: (value: number) => string;
  onChange: (next: number, fromDrag?: boolean) => void;
}

export function useEditableValue({
  value,
  min,
  max,
  step,
  format,
  formatSeed,
  onChange,
}: UseEditableValueOptions) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const seedFormat = formatSeed ?? format;
  const beginEdit = () => {
    const seed = seedFormat ? seedFormat(value) : String(value);
    setDraft(seed);
    setEditing(true);
  };

  // Focus + select so the user can overtype immediately.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitEdit = () => {
    // `parseFloat` grabs the leading numeric portion, so a decorated seed (unit suffix) still round-trips.
    const parsed = parseFloat(draft);
    if (!Number.isNaN(parsed)) {
      const stepped = clamp(snap(parsed, step), min, max);
      if (stepped !== value) onChange(stepped, false);
    }
    setEditing(false);
  };

  const cancelEdit = () => setEditing(false);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
      return;
    }
    const dir = e.key === "ArrowUp" || e.key === "ArrowRight" ? 1
              : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -1
              : 0;
    if (dir === 0) return;
    e.preventDefault();
    const base = parseFloat(draft);
    const current = Number.isNaN(base) ? value : base;
    const delta = step * (e.shiftKey ? 10 : 1);
    const next = clamp(snap(current + dir * delta, step), min, max);
    setDraft(seedFormat ? seedFormat(next) : String(next));
    if (next !== value) onChange(next, false);
  };

  return {
    editing,
    draft,
    setDraft,
    inputRef,
    beginEdit,
    commitEdit,
    handleInputKeyDown,
  };
}
