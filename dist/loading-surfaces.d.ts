export function skeletonShape(kind?:string):string;
export function skeletonMarkup(kind?:string,label?:string):string;
export function enhanceSkeleton(root?:Element|null):()=>void;
export function setLoadingSurface(host:Element|null,loading:boolean,options?:{kind?:string;label?:string}):void;
export function clearLoadingSurface(host:Element|null):void;
export function replaceWithSkeleton(host:Element,kind?:string,label?:string):void;
export function enhanceBootSkeleton():void;

export function setChartLoading(plot:Element|null,loading:boolean,label?:string):void;
