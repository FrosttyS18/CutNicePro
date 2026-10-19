export function pointerTime(clientX: number, left: number, width: number, duration: number): number {
  if (!Number.isFinite(clientX) || width <= 0 || duration <= 0) return 0;
  return Math.max(0,Math.min(1,(clientX-left)/width))*duration;
}
export function keyboardTime(key: string, time: number, duration: number, large: boolean): number | null {
  const step = large ? 5 : .1;
  const value = key === "Home" ? 0 : key === "End" ? duration : key === "ArrowRight" ? time+step : key === "ArrowLeft" ? time-step : null;
  return value === null ? null : Math.max(0,Math.min(duration,value));
}

type PointerTarget = Pick<HTMLElement,"focus"|"getBoundingClientRect"|"setPointerCapture"|"hasPointerCapture"|"releasePointerCapture">;
export function seekPointer(target: PointerTarget, clientX: number, duration: number, onSeek:(time:number)=>void) {
  const bounds=target.getBoundingClientRect();
  onSeek(pointerTime(clientX,bounds.left,bounds.width,duration));
}
export function beginPointer(target: PointerTarget, id: number, clientX: number, duration: number, onSeek:(time:number)=>void) {
  target.focus({preventScroll:true}); target.setPointerCapture(id); seekPointer(target,clientX,duration,onSeek);
}
export function movePointer(target: PointerTarget, id: number, clientX: number, duration: number, onSeek:(time:number)=>void) {
  if (target.hasPointerCapture(id)) seekPointer(target,clientX,duration,onSeek);
}
