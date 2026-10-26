import { useCallback, useRef, useState } from "react";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { EditorAction } from "./EditorAction";
import { EditorMenu, type EditorMenuItem } from "./EditorMenu";

interface Props { items: EditorMenuItem[]; label?: string; disabled?: boolean; onOpen?: () => void }

export function CompositionAddMenu({ items, label = "Adicionar", disabled = false, onOpen }: Props) {
  const anchor = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const close = useCallback(() => setMenu(null), []);
  if (disabled && menu) setMenu(null);
  return <div ref={anchor} className="composition-add-menu">
    <EditorAction compact label={label} icon={<PlusIcon size={17} aria-hidden="true"/>} disabled={disabled} onClick={() => {
      const bounds = anchor.current?.getBoundingClientRect();
      if (!bounds) return;
      onOpen?.(); setMenu({ x: bounds.left, y: bounds.bottom + 8 });
    }}/>
    {menu && !disabled && <EditorMenu label={label === "Adicionar" ? "Adicionar à montagem" : label} {...menu} items={items} onClose={close}/>}
  </div>;
}
