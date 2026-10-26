import { frameToSeconds, secondsToFrame } from "./composition-time";
import type { FrameRate } from "./composition-types";

export class CompositionClock {
  private frame=0;
  private anchor=0;
  private running=false;
  constructor(private fps:FrameRate) {}
  play(frame:number,now:number){this.frame=frame;this.anchor=now;this.running=true;}
  seek(frame:number,now:number){this.frame=frame;this.anchor=now;}
  read(now:number,duration:number){
    const elapsed=this.running ? (now-this.anchor)/1000 : 0;
    return Math.max(0,Math.min(duration,secondsToFrame(frameToSeconds(this.frame,this.fps)+elapsed,this.fps)));
  }
  pause(now:number,duration:number){this.frame=this.read(now,duration);this.running=false;}
}
type MediaClock=Pick<HTMLMediaElement,"currentTime"|"paused"|"seeking"|"play"|"pause"> & Partial<Pick<HTMLMediaElement,"readyState">>;
export function synchronizeMedia(media:MediaClock,time:number,playing:boolean):Promise<void>|undefined {
  if(!playing)media.pause();
  if(media.readyState!==undefined && media.readyState<1)return;
  if(Math.abs(media.currentTime-time)>(playing?.12:.001))media.currentTime=time;
  if(playing&&media.seeking)return;
  if(playing && media.paused)return media.play();
}
