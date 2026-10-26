import { describe, expect, it, vi } from "vitest";
import { CompositionClock, synchronizeMedia } from "../lib/composition-clock";
describe("relógio da montagem",()=>{
  it("usa tempo de saída; seek durante reprodução substitui a âncora anterior",()=>{
    const clock=new CompositionClock({numerator:30,denominator:1});
    clock.play(0,1000);
    expect(clock.read(1500,300)).toBe(15);
    clock.seek(180,1500);
    expect(clock.read(1600,300)).toBe(183);
    clock.pause(1600,300);
    expect(clock.read(1900,300)).toBe(183);
  });
  it("não passa do fim e não inicia uma montagem vazia",()=>{
    const clock=new CompositionClock({numerator:30,denominator:1});
    clock.play(290,100);
    expect(clock.read(1000,300)).toBe(300);
    expect(clock.read(1000,0)).toBe(0);
  });
  it("sincroniza na fonte sem repetir seek a cada frame em reprodução",()=>{
    const media={currentTime:20,paused:true,seeking:false,play:vi.fn(async()=>undefined),pause:vi.fn()};
    synchronizeMedia(media,20.02,true);
    expect(media.currentTime).toBe(20);
    expect(media.play).toHaveBeenCalledOnce();
    synchronizeMedia(media,42,false);
    expect(media.currentTime).toBe(42);
    expect(media.pause).toHaveBeenCalledOnce();
  });
  it("não busca ou inicia antes de carregar metadados",()=>{
    const media={readyState:0,currentTime:0,paused:true,seeking:false,play:vi.fn(async()=>undefined),pause:vi.fn()};
    synchronizeMedia(media,12,true);
    expect(media.currentTime).toBe(0);
    expect(media.play).not.toHaveBeenCalled();
  });
  it("não inicia reprodução enquanto a busca nativa está pendente",()=>{
    const media={readyState:4,currentTime:12,paused:true,seeking:true,play:vi.fn(async()=>undefined),pause:vi.fn()};
    synchronizeMedia(media,12,true);
    expect(media.play).not.toHaveBeenCalled();
  });
});
