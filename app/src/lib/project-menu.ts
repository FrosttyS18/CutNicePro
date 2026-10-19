export type ProjectMenuAction="video"|"collection"|"srt"|"txt"|"remove"|"delete";
export interface ProjectMenuItem {id:ProjectMenuAction;label:string;detail?:string;danger?:boolean}
export function projectMenuItems(media:boolean,transcript:boolean,insideCollection=false):ProjectMenuItem[] {
  return [
    ...(media?[{id:"video" as const,label:"Salvar vídeo"}]:[]),
    {id:"collection",label:"Adicionar a uma coleção"},
    ...(transcript?[{id:"srt" as const,label:"Baixar legendas",detail:"SRT"},{id:"txt" as const,label:"Salvar transcrição",detail:"TXT"}]:[]),
    ...(insideCollection?[{id:"remove" as const,label:"Remover desta coleção"}]:[]),
    {id:"delete",label:"Excluir",danger:true},
  ];
}
export function menuPosition(x:number,y:number,width:number,height:number,viewportWidth:number,viewportHeight:number) {
  return {left:Math.max(8,Math.min(x,viewportWidth-width-8)),top:Math.max(8,Math.min(y,viewportHeight-height-8))};
}
export function menuIndex(key:string,current:number,count:number):number|null {
  if(key==="Home")return 0;
  if(key==="End")return count-1;
  if(key==="ArrowDown")return (current+1)%count;
  if(key==="ArrowUp")return (current+count-1)%count;
  return null;
}
