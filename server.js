// Digital signage server — zero dependencies. Run: ADMIN_PASSWORD=secret node server.js
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000, PASS=process.env.ADMIN_PASSWORD||'admin';
const DATA=path.join(__dirname,'data'), MEDIA=path.join(DATA,'media'), SF=path.join(DATA,'state.json');
fs.mkdirSync(MEDIA,{recursive:true});
let S={cfg:{slides:[]},screens:{},media:{},playlists:{}};
try{S={...S,...JSON.parse(fs.readFileSync(SF))}}catch{}
const save=()=>fs.writeFile(SF,JSON.stringify(S),()=>{});
const beats={}, clients=new Set();
// ---------- licensing (3-month plans paid by KHQR, approved manually by the vendor) ----------
const rd=f=>{try{return fs.readFileSync(path.join(__dirname,f),'utf8')}catch{return null}};
let LC={};try{LC=JSON.parse(rd('license-config.json')||'{}')}catch{}
const PUB=rd('license-public.pem'), PRIV=rd('license-private.pem');
const LIC_ON=!!PUB&&!PRIV, VENDOR=!!PRIV, GRACE=7*864e5;
if(!S.serverId){const h=crypto.randomBytes(5).toString('hex').toUpperCase();S.serverId=h.slice(0,5)+'-'+h.slice(5);S.firstRun=Date.now();save()}
if(!S.issued)S.issued=[];
function verifyKey(key){try{const [a,b]=String(key).trim().split('.');if(!crypto.verify(null,Buffer.from(a),PUB,Buffer.from(b,'base64url')))return null;return JSON.parse(Buffer.from(a,'base64url').toString())}catch{return null}}
function licInfo(){
  const base={vendor:VENDOR,sid:S.serverId,plan:LC.planName||'3-month plan',amount:LC.amount,currency:LC.currency||'USD',contact:LC.contact||''};
  if(!LIC_ON)return{...base,enabled:false,valid:true,locked:false};
  const L=S.license?verifyKey(S.license):null, now=Date.now();
  const trialEnd=(LC.trialDays>0)?S.firstRun+LC.trialDays*864e5:0;
  const ok=L&&L.sid===S.serverId;const exp=ok?L.exp:trialEnd;
  return{...base,enabled:true,name:ok?L.name:'',trial:!ok&&exp>0,exp:exp||0,valid:!!exp&&now<exp,locked:!exp||now>exp+GRACE,daysLeft:exp?Math.ceil((exp-now)/864e5):0};
}
const tlv=(t,v)=>t+String(v.length).padStart(2,'0')+v;
function crc16(x){let c=0xFFFF;for(let i=0;i<x.length;i++){c^=x.charCodeAt(i)<<8;for(let j=0;j<8;j++)c=(c&0x8000)?((c<<1)^0x1021)&0xFFFF:(c<<1)&0xFFFF}return c.toString(16).toUpperCase().padStart(4,'0')}
function khqr(){
  if(!LC.account||!LC.amount)return'';
  const usd=(LC.currency||'USD')==='USD',amt=usd?Number(LC.amount).toFixed(2):String(Math.round(LC.amount)),now=Date.now();
  const x=tlv('00','01')+tlv('01','12')+tlv('29',tlv('00',LC.account))+tlv('52','5999')+tlv('53',usd?'840':'116')+tlv('54',amt)+tlv('58','KH')+tlv('59',String(LC.merchantName||'MERCHANT').slice(0,25))+tlv('60',String(LC.city||'Phnom Penh').slice(0,15))+tlv('99',tlv('00',String(now))+tlv('01',String(now+864e5)))+'6304';
  return x+crc16(x);
}
const pub=()=>JSON.stringify({cfg:S.cfg,screens:S.screens,media:S.media,playlists:S.playlists,lic:{locked:licInfo().locked}});
const MIME={'.html':'text/html','.js':'text/javascript','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.mkv':'video/x-matroska','.mp3':'audio/mpeg','.pdf':'application/pdf'};
const broadcast=()=>{const m='event: state\ndata: '+pub()+'\n\n';clients.forEach(c=>c.write(m))};
setInterval(broadcast,600000);
const authed=r=>r.headers['x-admin']===PASS;
const json=(res,code,o)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(o))};
const body=r=>new Promise((ok,no)=>{let b='';r.on('data',d=>{b+=d;if(b.length>5e6)r.destroy()});r.on('end',()=>{try{ok(JSON.parse(b||'{}'))}catch(e){no(e)}})});

function sendFile(req,res,file,type){
  fs.stat(file,(e,st)=>{
    if(e||!st.isFile()){res.writeHead(404);return res.end('Not found')}
    const h={'Content-Type':type,'Accept-Ranges':'bytes','Cache-Control':type.indexOf('text/html')===0?'no-store':'public, max-age=86400'};
    const m=/bytes=(\d*)-(\d*)/.exec(req.headers.range||'');
    if(m){const s=m[1]?+m[1]:0,en=m[2]?+m[2]:st.size-1;
      res.writeHead(206,{...h,'Content-Range':`bytes ${s}-${en}/${st.size}`,'Content-Length':en-s+1});
      fs.createReadStream(file,{start:s,end:en}).pipe(res)}
    else{res.writeHead(200,{...h,'Content-Length':st.size});fs.createReadStream(file).pipe(res)}
  });
}

http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://x'), p=u.pathname;
  try{
    if(p==='/qr.js')return sendFile(req,res,path.join(__dirname,'public/qr.js'),'text/javascript');
    if(p==='/api/license'&&req.method==='GET')return json(res,200,{...licInfo(),khqr:khqr()});
    if(p==='/'||p==='/index.html'||/^\/tv-\d\d\/?$/.test(p))return sendFile(req,res,path.join(__dirname,'public/index.html'),'text/html; charset=utf-8');
    if(p.startsWith('/media/')){const f=path.basename(p);return sendFile(req,res,path.join(MEDIA,f),MIME[path.extname(f).toLowerCase()]||'application/octet-stream')}
    if(p==='/api/events'){
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache',Connection:'keep-alive'});
      res.write('event: state\ndata: '+pub()+'\n\n');clients.add(res);
      const ka=setInterval(()=>res.write(': ka\n\n'),20000);
      return req.on('close',()=>{clients.delete(res);clearInterval(ka)});
    }
    if(p==='/api/state'&&req.method==='GET')return json(res,200,{...JSON.parse(pub()),beats});
    if(p.startsWith('/api/beat/')&&req.method==='POST'){beats[path.basename(p)]=Date.now();return json(res,200,{ok:1})}
    // ---- admin only below ----
    if(p==='/api/login')return json(res,authed(req)?200:401,{ok:authed(req)});
    if(!authed(req))return json(res,401,{error:'unauthorized'});
    if(p==='/api/license'&&req.method==='POST'){
      if(!LIC_ON)return json(res,400,{error:'Licensing is not enabled on this server'});
      const b=await body(req),L=verifyKey(b.key);
      if(!L)return json(res,400,{error:'Invalid license key'});
      if(L.sid!==S.serverId)return json(res,400,{error:'This key is for a different server'});
      if(L.exp<Date.now())return json(res,400,{error:'This key has already expired'});
      S.license=String(b.key).trim();save();broadcast();return json(res,200,licInfo());
    }
    if(p==='/api/vendor/issue'&&req.method==='POST'){
      if(!VENDOR)return json(res,403,{error:'Not a vendor server'});
      const b=await body(req),m=Math.max(1,Math.min(36,+b.months||3));
      if(!/^[0-9A-F]{5}-[0-9A-F]{5}$/.test(String(b.sid||'').toUpperCase()))return json(res,400,{error:'Server ID must look like XXXXX-XXXXX'});
      const d=new Date();d.setMonth(d.getMonth()+m);
      const pl={sid:String(b.sid).toUpperCase(),name:String(b.name||'').slice(0,60),iat:Date.now(),exp:d.getTime()};
      const a=Buffer.from(JSON.stringify(pl)).toString('base64url');
      const key=a+'.'+crypto.sign(null,Buffer.from(a),PRIV).toString('base64url');
      S.issued.unshift({name:pl.name,sid:pl.sid,iat:pl.iat,exp:pl.exp,months:m});save();
      return json(res,200,{key,exp:pl.exp});
    }
    if(p==='/api/vendor/list'&&VENDOR)return json(res,200,S.issued);
    if(!licInfo().valid)return json(res,402,{error:'Subscription expired'});
    if(p==='/api/state'&&req.method==='POST'){const b=await body(req);if(b.cfg)S.cfg=b.cfg;if(b.screens)S.screens=b.screens;if(b.playlists)S.playlists=b.playlists;save();broadcast();return json(res,200,{ok:1})}
    if(p==='/api/upload'&&req.method==='POST'){
      const name=u.searchParams.get('name')||'file', ext=path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g,'');
      const file=crypto.randomBytes(8).toString('hex')+ext, out=fs.createWriteStream(path.join(MEDIA,file));
      req.pipe(out);
      out.on('finish',()=>{S.media[file]={name,type:MIME[ext]||req.headers['content-type']||'',size:out.bytesWritten};save();broadcast();json(res,200,{file})});
      return out.on('error',()=>json(res,500,{error:'write failed'}));
    }
    if(p==='/api/media-delete'&&req.method==='POST'){const b=await body(req);(b.files||[]).forEach(f=>{f=path.basename(String(f));fs.unlink(path.join(MEDIA,f),()=>{});delete S.media[f]});save();broadcast();return json(res,200,{ok:1})}
    if(p.startsWith('/api/media/')&&req.method==='DELETE'){const f=path.basename(p);fs.unlink(path.join(MEDIA,f),()=>{});delete S.media[f];save();broadcast();return json(res,200,{ok:1})}
    json(res,404,{error:'not found'});
  }catch(e){json(res,500,{error:String(e.message||e)})}
}).listen(PORT,()=>console.log(`Signage server on http://0.0.0.0:${PORT}  (admin password: ${PASS})`));
