"use client";

import { useState } from "react";

interface ChipsFieldProps {
  id: string;
  label: string;
  help?: string;
  defaultValue: string;
  suggestions: string[];
}

export function ChipsField({
  id,
  label,
  help,
  defaultValue,
  suggestions,
}: ChipsFieldProps) {
  const [value, setValue] = useState(defaultValue);

  const selected = new Set(
    value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );

  function toggle(tag: string) {
    const next = new Set(selected);
    if (next.has(tag)) {
      next.delete(tag);
    } else {
      next.add(tag);
    }
    setValue([...next].join(", "));
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block text-[13px] font-medium text-claude-ink dark:text-white"
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="coding, agent, design"
        className="input-claude"
      />
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((tag) => {
          const active = selected.has(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              className={[
                "chip cursor-pointer transition-colors",
                active
                  ? "bg-claude-coral/15 text-claude-coral border-claude-coral/40 dark:bg-claude-coral/20"
                  : "hover:bg-claude-surface dark:hover:bg-white/10",
              ].join(" ")}
              aria-pressed={active}
            >
              {tag}
            </button>
          );
        })}
      </div>
      {help && <p className="text-[12px] text-claude-muted">{help}</p>}
    </div>
  );
}
