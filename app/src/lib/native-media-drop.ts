import { TauriEvent } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";

interface DropPosition { x: number; y: number }
interface PositionedDrop { paths: string[]; position: DropPosition }
export type NativeMediaDropPayload = ({ type: "enter" | "drop" } & PositionedDrop)
  | { type: "over"; position: DropPosition } | { type: "leave" };
export interface NativeMediaDropEvent { payload: NativeMediaDropPayload }

export async function subscribeNativeMediaDrop(handler: (event: NativeMediaDropEvent) => void, signal: AbortSignal): Promise<void> {
  await Promise.resolve();
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal.aborted) return;
    const listeners: (() => void | Promise<void>)[] = [];
    let accepting = false;
    const cleanup = async () => {
      accepting = false;
      await Promise.all(listeners.splice(0).map(async off => {
        try { await off(); }
        catch (error) { console.warn("[CutNicePro:native-media-drop:unlisten]", error); }
      }));
    };
    const abort = () => { void cleanup(); };
    signal.addEventListener("abort", abort, { once: true });
    try {
      const webview = getCurrentWebview();
      const register = async <T>(eventName: TauriEvent, payload: (value: T) => NativeMediaDropPayload): Promise<boolean> => {
        if (signal.aborted) return false;
        const off = await webview.listen<T>(eventName, event => {
          if (accepting && !signal.aborted) handler({ payload: payload(event.payload) });
        });
        listeners.push(off);
        if (signal.aborted) { await cleanup(); return false; }
        return true;
      };
      if (!await register<PositionedDrop>(TauriEvent.DRAG_ENTER, value => ({ type: "enter", paths: value.paths, position: value.position }))) return;
      if (!await register<{ position: DropPosition }>(TauriEvent.DRAG_OVER, value => ({ type: "over", position: value.position }))) return;
      if (!await register<PositionedDrop>(TauriEvent.DRAG_DROP, value => ({ type: "drop", paths: value.paths, position: value.position }))) return;
      if (!await register<unknown>(TauriEvent.DRAG_LEAVE, () => ({ type: "leave" }))) return;
      accepting = true;
      return;
    } catch (error) {
      signal.removeEventListener("abort", abort);
      await cleanup();
      if (signal.aborted) return;
      console.warn("[CutNicePro:native-media-drop:listen]", error);
      if (attempt === 1) throw error;
    }
  }
}
