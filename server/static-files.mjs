import {createReadStream} from 'node:fs';
import {extname} from 'node:path';

export const OFFICIAL_CSP="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; font-src 'self'; connect-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'";
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.glb':'model/gltf-binary','.wav':'audio/wav','.mp3':'audio/mpeg','.mp4':'video/mp4','.json':'application/json','.zip':'application/zip'};

// 仅接受单区间，拒绝多区间/越界，避免视频拖动变成整个文件的反复传输。
export function byteRange(header,size){
 const match=/^bytes=(\d*)-(\d*)$/.exec(header||'');if(!match||!size||!match[1]&&!match[2])return null;
 let start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2])),end=match[1]?(match[2]?Number(match[2]):size-1):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||!match[1]&&Number(match[2])<=0||start<0||start>=size||end<start)return null;
 return {start,end:Math.min(end,size-1)};
}
export function serveFile(req,res,file,info,{official=false}={}){
 const modified=info.mtime.toUTCString(),etag=`"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`;
 const headers={'Content-Type':TYPES[extname(file)]||'application/octet-stream','Accept-Ranges':'bytes','Last-Modified':modified,ETag:etag,'Cache-Control':extname(file)==='.html'?'no-cache':'public, max-age=3600'};
 if(official)headers['Content-Security-Policy']=OFFICIAL_CSP;
 const requested=req.method==='GET'&&req.headers.range&&(!req.headers['if-range']||[etag,modified].includes(req.headers['if-range']));
 const range=requested?byteRange(req.headers.range,info.size):undefined;
 if(requested&&!range){res.writeHead(416,{...headers,'Content-Range':`bytes */${info.size}`,'Content-Length':0});return res.end();}
 headers['Content-Length']=range?range.end-range.start+1:info.size;if(range)headers['Content-Range']=`bytes ${range.start}-${range.end}/${info.size}`;
 res.writeHead(range?206:200,headers);if(req.method==='HEAD')return res.end();
 const stream=createReadStream(file,range||{});stream.on('error',()=>res.destroy());stream.pipe(res);
}
