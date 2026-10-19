export function formatPlaybackTime(value:number):string {
  const ticks=Math.max(0,Math.round((Number.isFinite(value)?value:0)*100));
  const minutes=Math.floor(ticks/6000).toString().padStart(2,"0");
  const seconds=Math.floor(ticks/100)%60;
  return `${minutes}:${seconds.toString().padStart(2,"0")}.${(ticks%100).toString().padStart(2,"0")}`;
}
export function playbackBounds(duration:number,start:number,end:number|null):[number,number] {
  const finish=Math.min(duration,Math.max(0,end??duration));
  return [Math.min(Math.max(0,start),finish),finish];
}
export function shouldTogglePlayback(input:{key:string;repeat:boolean;modified:boolean;interactive:boolean;dialogOpen:boolean}):boolean {
  return input.key===" " && !input.repeat && !input.modified && !input.interactive && !input.dialogOpen;
}
