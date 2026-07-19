"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

export type SelectOption = { value: string; label: string };

const subscribeToNothing = () => () => {};

type SelectProps = {
  id: string;
  name: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

/**
 * Select-only combobox (ARIA 1.2 pattern). Replaces `<select>`, whose open list is
 * drawn by the OS and cannot be styled to match the paper palette.
 *
 * Read the value from the `value` prop, never from `form.elements`: the trigger
 * carries `id` and the hidden input carries `name`, so when the two match — as they
 * do for a field called "level" — `namedItem()` matches both and hands back a
 * RadioNodeList whose `.value` is always "".
 */
export function Select({ id, name, options, value, onChange, placeholder = "Select…" }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Unlike a native <select>, this control is inert until React attaches its
  // handlers. Staying disabled until then turns a silently dropped click into a
  // wait — for people on slow connections and for Playwright's actionability check.
  const isHydrated = useSyncExternalStore(subscribeToNothing, () => true, () => false);

  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const typeahead = useRef({ buffer: "", timer: 0 });

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = selectedIndex === -1 ? null : options[selectedIndex];

  const open = useCallback(
    (index: number) => {
      setActiveIndex(index === -1 ? (selectedIndex === -1 ? 0 : selectedIndex) : index);
      setIsOpen(true);
    },
    [selectedIndex]
  );

  const close = useCallback((refocus = true) => {
    setIsOpen(false);
    setActiveIndex(-1);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const commit = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option) return;
      onChange(option.value);
      close();
    },
    [options, onChange, close]
  );

  // Keep the active option in view during keyboard navigation.
  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [isOpen, activeIndex]);

  // Dismiss on outside press. Pointerdown so the menu closes before a click lands elsewhere.
  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen, close]);

  function jumpToTypedPrefix(key: string) {
    window.clearTimeout(typeahead.current.timer);
    typeahead.current.buffer += key.toLowerCase();
    typeahead.current.timer = window.setTimeout(() => {
      typeahead.current.buffer = "";
    }, 500);

    const prefix = typeahead.current.buffer;
    const match = options.findIndex((option) => option.label.toLowerCase().startsWith(prefix));
    if (match === -1) return;
    if (isOpen) setActiveIndex(match);
    else commit(match);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const lastIndex = options.length - 1;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!isOpen) open(-1);
        else setActiveIndex((index) => Math.min(index + 1, lastIndex));
        return;
      case "ArrowUp":
        event.preventDefault();
        if (!isOpen) open(-1);
        else setActiveIndex((index) => Math.max(index - 1, 0));
        return;
      case "Home":
        if (!isOpen) return;
        event.preventDefault();
        setActiveIndex(0);
        return;
      case "End":
        if (!isOpen) return;
        event.preventDefault();
        setActiveIndex(lastIndex);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        if (isOpen) commit(activeIndex);
        else open(-1);
        return;
      case "Escape":
        if (!isOpen) return;
        event.preventDefault();
        close();
        return;
      case "Tab":
        if (isOpen) close(false);
        return;
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          jumpToTypedPrefix(event.key);
        }
    }
  }

  return (
    <div className="select" ref={rootRef}>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className="select-trigger"
        role="combobox"
        disabled={!isHydrated}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={isOpen && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        onClick={() => (isOpen ? close(false) : open(-1))}
        onKeyDown={handleKeyDown}
      >
        <span className={selectedOption ? "select-value" : "select-value select-value--placeholder"}>
          {selectedOption?.label ?? placeholder}
        </span>
        <svg className="select-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <ul className="select-menu" id={listboxId} role="listbox" aria-labelledby={id}>
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                id={`${listboxId}-${index}`}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                role="option"
                aria-selected={isSelected}
                className={`select-option${index === activeIndex ? " select-option--active" : ""}${isSelected ? " select-option--selected" : ""}`}
                // Pointer, not click: mousedown would blur the trigger before selection resolves.
                onPointerUp={() => commit(index)}
                onPointerMove={() => setActiveIndex(index)}
              >
                <span>{option.label}</span>
                {isSelected && <span className="select-check" aria-hidden="true">✓</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
