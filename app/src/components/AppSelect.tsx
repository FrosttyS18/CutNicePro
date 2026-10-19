import { Children, isValidElement, useEffect, useId, useRef, useState, type SelectHTMLAttributes, type ReactElement } from "react";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import "./form-controls.css";

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> & { onChange?: (event: { target: { value: string } }) => void };
type OptionProps = { value?: string | number; children?: string; disabled?: boolean };

export function AppSelect({ value, onChange, children, disabled, name, id, className, ...attributes }: Props) {
  const generated = useId();
  const listId = `${generated}-options`;
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const options = Children.toArray(children).filter(isValidElement).map(child => {
    const props = (child as ReactElement<OptionProps>).props;
    return { value: String(props.value ?? props.children ?? ""), label: props.children ?? "", disabled: props.disabled };
  });
  const selected = options.findIndex(option => option.value === String(value));
  function close() { setOpen(false); trigger.current?.focus({ preventScroll: true }); }
  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange?.({ target: { value: option.value } }); close();
  }
  useEffect(() => {
    if (!open || !list.current || !trigger.current) return;
    const popup = list.current;
    const position = () => {
      const bounds = trigger.current!.getBoundingClientRect();
      const height = Math.min(280, options.length * 42 + 12);
      Object.assign(popup.style, { left: `${Math.max(8, Math.min(bounds.left, window.innerWidth - bounds.width - 8))}px`,
        top: `${bounds.bottom + height + 8 > window.innerHeight ? Math.max(8, bounds.top - height - 6) : bounds.bottom + 6}px`,
        width: `${bounds.width}px`, maxHeight: `${Math.min(280, window.innerHeight - 16)}px` });
    };
    position(); popup.showPopover(); popup.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!popup.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    };
    const resize = () => setOpen(false);
    const scroll = (event: Event) => { if (!popup.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside, true); window.addEventListener("resize", resize);
    document.addEventListener("scroll",scroll,true);
    return () => { if (popup.matches(":popover-open")) popup.hidePopover(); document.removeEventListener("pointerdown", outside, true); window.removeEventListener("resize", resize); document.removeEventListener("scroll",scroll,true); };
  }, [open, options.length]);
  return <span className={`app-select ${className ?? ""}`}>
    <button type="button" ref={trigger} id={id} className="app-select__trigger" disabled={disabled}
      aria-label={attributes["aria-label"]} aria-labelledby={attributes["aria-labelledby"]} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
      onClick={() => { setActive(Math.max(0, selected)); setOpen(current => !current); }}
      onKeyDown={event => { if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); setActive(event.key === "End" ? options.length - 1 : Math.max(0, selected)); setOpen(true); } }}>
      <span>{options[selected]?.label ?? "Escolher"}</span><CaretDownIcon size={16} aria-hidden="true"/>
    </button>
    {name && <input type="hidden" name={name} value={String(value ?? "")}/>}
    <span ref={list} popover="manual" id={listId} className="app-select__list" role="listbox" tabIndex={-1}
      aria-label={attributes["aria-label"] ?? "Opções"} aria-activedescendant={`${listId}-${active}`}
      onClick={event => { event.preventDefault(); event.stopPropagation(); }}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
        if (event.key === "Tab") { close(); return; }
        if (["Enter", " "].includes(event.key)) { event.preventDefault(); choose(active); return; }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const enabled = options.map((option,index) => option.disabled ? -1 : index).filter(index => index >= 0);
          const position = enabled.indexOf(active);
          const next = event.key === "Home" ? enabled[0] : event.key === "End" ? enabled[enabled.length - 1]
            : enabled[(position + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length];
          if (next !== undefined) { setActive(next); document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" }); }
        } else if (event.key.length === 1) {
          const next = options.findIndex((option,index) => index > active && !option.disabled && option.label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
          if (next >= 0) setActive(next);
        }
      }}>
      {options.map((option,index) => <span role="option" id={`${listId}-${index}`} key={option.value} aria-selected={index === selected}
        aria-disabled={option.disabled} data-active={index === active} onPointerMove={() => setActive(index)} onClick={() => choose(index)}>{option.label}</span>)}
    </span>
  </span>;
}
