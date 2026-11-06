import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';

type ToolbarOwner = {
  embedded: boolean;
  active: boolean;
  epoch: number;
  target: HTMLElement | null;
  hosted: boolean;
  registerInline: (node: HTMLDivElement | null) => void;
  canInteract: () => boolean;
};
const ToolbarContext = createContext<ToolbarOwner>({
  embedded: false, active: true, epoch: 0, target: null, hosted: false,
  registerInline: () => {}, canInteract: () => true,
});

function hostTarget(embedded: boolean): HTMLElement | null {
  if (!embedded || typeof window === 'undefined') return null;
  try {
    const frame = window.frameElement as HTMLIFrameElement | null;
    const id = frame?.dataset.toolbarId;
    return id ? frame.ownerDocument.getElementById(id) : null;
  } catch { return null; }
}

/** The host supplies a stable same-origin mount; state stays in the child. */
export function CompactToolbarProvider({ embedded, active, epoch, children }: {
  embedded: boolean; active: boolean; epoch: number; children: ReactNode;
}) {
  const [external, setExternal] = useState(() => hostTarget(embedded));
  const [inline, setInline] = useState<HTMLDivElement | null>(null);
  const registerInline = useCallback((node: HTMLDivElement | null) => setInline(node), []);
  useLayoutEffect(() => { setExternal(hostTarget(embedded)); }, [embedded, active, epoch]);
  const canInteract = useCallback(() => {
    if (!active) return false;
    if (!embedded || !external) return true;
    try {
      const frame = window.frameElement as HTMLIFrameElement | null;
      return Boolean(frame && !frame.hidden && external.isConnected && !external.hidden &&
        (frame.dataset.centerEpoch === undefined || Number(frame.dataset.centerEpoch) === epoch));
    } catch { return false; }
  }, [active, embedded, external, epoch]);
  const owner = useMemo(() => ({ embedded, active, epoch, target: external || inline,
    hosted: Boolean(external), registerInline, canInteract }), [embedded, active, epoch, external, inline, registerInline, canInteract]);
  return <ToolbarContext.Provider value={owner}>{children}</ToolbarContext.Provider>;
}

export const useCompactToolbar = () => useContext(ToolbarContext);

/** Standalone pages keep one compact row with the same controls and handlers. */
export function CompactToolbarHost() {
  const owner = useCompactToolbar();
  return owner.hosted ? null : <div ref={owner.registerInline} className="center-workspace-toolbar compact-toolbar-inline" aria-label="현재 화면 도구" />;
}

export function CompactToolbar({ children, label, order = 10 }: { children: ReactNode; label: string; order?: number }) {
  const owner = useCompactToolbar();
  const guard = (event: SyntheticEvent) => {
    if (!owner.canInteract()) { event.preventDefault(); event.stopPropagation(); }
  };
  const content = <div className="compact-toolbar-group" role="group" aria-label={label} data-toolbar-group={label}
    hidden={!owner.active} style={{ order }} onClickCapture={guard} onPointerDownCapture={guard} onKeyDownCapture={guard} onChangeCapture={guard} onInputCapture={guard}>
    {children}
  </div>;
  return owner.target ? createPortal(content, owner.target) : content;
}

/** Native top-layer dialogs escape the clipped header and restore its trigger. */
export function CompactToolbarMenu({ name, label, title, children, disabled = false }: {
  name: string; label: ReactNode; title: string; children: ReactNode; disabled?: boolean;
}) {
  const owner = useCompactToolbar(), id = useId();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const close = () => { setOpen(false); dialog.current?.close(); };
  useEffect(() => { setOpen(false); }, [owner.active, owner.epoch, owner.target]);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && owner.canInteract()) {
      if (!node.open) node.showModal();
    } else if (node.open) node.close();
  }, [open, owner.canInteract]);
  useEffect(() => {
    if (!open || !owner.hosted) return;
    const frame = window.frameElement;
    if (!frame) return;
    const Observer = frame.ownerDocument.defaultView?.MutationObserver;
    if (!Observer) return;
    const observer = new Observer(() => { if (!owner.canInteract()) close(); });
    observer.observe(frame, { attributes: true, attributeFilter: ['hidden', 'data-center-epoch'] });
    return () => observer.disconnect();
  }, [open, owner.hosted, owner.canInteract]);
  const content = <dialog ref={dialog} className="compact-toolbar-dialog" id={`${id}-dialog`} data-toolbar-dialog={name} aria-labelledby={`${id}-title`}
    onCancel={() => setOpen(false)} onClose={() => { setOpen(false); if (owner.canInteract()) trigger.current?.focus(); }}
    onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close(); } }}>
    <header className="compact-toolbar-dialog-header"><h2 id={`${id}-title`}>{title}</h2><button type="button" autoFocus data-toolbar-close={name} aria-label={`${title} 닫기`} onClick={close}>닫기</button></header>
    <div className="compact-toolbar-dialog-body">{children}</div>
  </dialog>;
  return <>
    <button ref={trigger} type="button" className="compact-toolbar-action compact-toolbar-menu" data-toolbar-open={name} aria-haspopup="dialog" aria-expanded={open}
      aria-controls={`${id}-dialog`} aria-label={title} disabled={disabled} onClick={() => { if (owner.canInteract()) setOpen(true); }}>{label}</button>
    {owner.target ? createPortal(content, owner.target.ownerDocument.body) : content}
  </>;
}
