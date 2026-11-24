/* Minimal offline QR encoder (byte mode, ECC level M). QR.svg(text) -> SVG string. */
var QR=(function(){
var ECC=[-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28];
var BLK=[-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49];
function raw(v){var r=(16*v+128)*v+64;if(v>=2){var n=Math.floor(v/7)+2;r-=(25*n-10)*n-55;if(v>=7)r-=36}return r}
function ndata(v){return Math.floor(raw(v)/8)-ECC[v]*BLK[v]}
function rsDiv(n){var r=[],i,j;for(i=0;i<n-1;i++)r.push(0);r.push(1);var root=1;
 for(i=0;i<n;i++){for(j=0;j<r.length;j++){r[j]=mul(r[j],root);if(j+1<r.length)r[j]^=r[j+1]}root=mul(root,2)}return r}
function mul(x,y){var z=0;for(var i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11D);z^=((y>>>i)&1)*x}return z&255}
function rsRem(data,div){var r=div.map(function(){return 0});data.forEach(function(b){var f=b^r.shift();r.push(0);div.forEach(function(c,i){r[i]^=mul(c,f)})});return r}
function bytes(s){var u=unescape(encodeURIComponent(s)),a=[];for(var i=0;i<u.length;i++)a.push(u.charCodeAt(i));return a}
function make(text){
 var d=bytes(text),ver,i,j;
 for(ver=1;ver<=40;ver++){var cc=ver<=9?8:16;if(4+cc+d.length*8<=ndata(ver)*8)break}
 if(ver>40)throw new Error('QR too long');
 var bits=[];function put(v,n){for(var k=n-1;k>=0;k--)bits.push((v>>>k)&1)}
 put(4,4);put(d.length,ver<=9?8:16);d.forEach(function(b){put(b,8)});
 var cap=ndata(ver)*8;put(0,Math.min(4,cap-bits.length));while(bits.length%8)bits.push(0);
 for(var pad=0xEC;bits.length<cap;pad^=0xEC^0x11)put(pad,8);
 var cw=[];for(i=0;i<bits.length;i+=8){var b=0;for(j=0;j<8;j++)b=(b<<1)|bits[i+j];cw.push(b)}
 var nb=BLK[ver],el=ECC[ver],rc=Math.floor(raw(ver)/8),ns=nb-rc%nb,sl=Math.floor(rc/nb),blocks=[],k=0,div=rsDiv(el);
 for(i=0;i<nb;i++){var dat=cw.slice(k,k+sl-el+(i<ns?0:1));k+=dat.length;var e=rsRem(dat,div);if(i<ns)dat.push(0);blocks.push(dat.concat(e))}
 var all=[];for(i=0;i<blocks[0].length;i++)for(j=0;j<nb;j++)if(i!=sl-el||j>=ns)all.push(blocks[j][i]);
 var size=ver*4+17,m=[],f=[];for(i=0;i<size;i++){m.push(new Array(size).fill(false));f.push(new Array(size).fill(false))}
 function sf(x,y,v){m[y][x]=v;f[y][x]=true}
 function finder(x,y){for(var dy=-4;dy<=4;dy++)for(var dx=-4;dx<=4;dx++){var dist=Math.max(Math.abs(dx),Math.abs(dy)),xx=x+dx,yy=y+dy;if(xx>=0&&xx<size&&yy>=0&&yy<size)sf(xx,yy,dist!=2&&dist!=4)}}
 function align(x,y){for(var dy=-2;dy<=2;dy++)for(var dx=-2;dx<=2;dx++)sf(x+dx,y+dy,Math.max(Math.abs(dx),Math.abs(dy))!=1)}
 for(i=0;i<size;i++){sf(6,i,i%2==0);sf(i,6,i%2==0)}
 finder(3,3);finder(size-4,3);finder(3,size-4);
 var ap=[];if(ver>1){var na=Math.floor(ver/7)+2,step=ver==32?26:Math.ceil((ver*4+4)/(na*2-2))*2;ap=[6];for(var pos=ver*4+10;ap.length<na;pos-=step)ap.splice(1,0,pos)}
 for(i=0;i<ap.length;i++)for(j=0;j<ap.length;j++)if(!((i==0&&j==0)||(i==0&&j==ap.length-1)||(i==ap.length-1&&j==0)))align(ap[i],ap[j]);
 function fmt(mask){var data=(0<<3)|mask,rem=data;for(var q=0;q<10;q++)rem=(rem<<1)^((rem>>>9)*0x537);var bt=((data<<10)|rem)^0x5412;
  function g(n){return((bt>>>n)&1)!=0}
  for(var q=0;q<=5;q++)sf(8,q,g(q));sf(8,7,g(6));sf(8,8,g(7));sf(7,8,g(8));for(q=9;q<15;q++)sf(14-q,8,g(q));
  for(q=0;q<8;q++)sf(size-1-q,8,g(q));for(q=8;q<15;q++)sf(8,size-15+q,g(q));sf(8,size-8,true)}
 fmt(0);
 if(ver>=7){var rem=ver;for(i=0;i<12;i++)rem=(rem<<1)^((rem>>>11)*0x1F25);var vb=(ver<<12)|rem;
  for(i=0;i<18;i++){var c=((vb>>>i)&1)!=0,a=size-11+i%3,bb=Math.floor(i/3);sf(a,bb,c);sf(bb,a,c)}}
 var n=0;for(var right=size-1;right>=1;right-=2){if(right==6)right=5;
  for(var vert=0;vert<size;vert++)for(j=0;j<2;j++){var x=right-j,up=((right+1)&2)==0,y=up?size-1-vert:vert;
   if(!f[y][x]&&n<all.length*8){m[y][x]=((all[n>>>3]>>>(7-(n&7)))&1)!=0;n++}}}
 function mask(t){for(var y=0;y<size;y++)for(var x=0;x<size;x++){var inv;
  switch(t){case 0:inv=(x+y)%2==0;break;case 1:inv=y%2==0;break;case 2:inv=x%3==0;break;case 3:inv=(x+y)%3==0;break;
   case 4:inv=(Math.floor(x/3)+Math.floor(y/2))%2==0;break;case 5:inv=x*y%2+x*y%3==0;break;case 6:inv=(x*y%2+x*y%3)%2==0;break;default:inv=((x+y)%2+x*y%3)%2==0}
  if(!f[y][x]&&inv)m[y][x]=!m[y][x]}}
 function pen(){var p=0,y,x,run,dark=0;
  for(y=0;y<size;y++){run=1;for(x=1;x<size;x++){if(m[y][x]==m[y][x-1]){run++;if(run==5)p+=3;else if(run>5)p++}else run=1}}
  for(x=0;x<size;x++){run=1;for(y=1;y<size;y++){if(m[y][x]==m[y-1][x]){run++;if(run==5)p+=3;else if(run>5)p++}else run=1}}
  for(y=0;y<size-1;y++)for(x=0;x<size-1;x++){var c=m[y][x];if(c==m[y][x+1]&&c==m[y+1][x]&&c==m[y+1][x+1])p+=3}
  for(y=0;y<size;y++)for(x=0;x<size;x++)if(m[y][x])dark++;
  p+=Math.floor(Math.abs(dark*20-size*size*10)/(size*size))*10;return p}
 var best=0,bp=1e9;for(i=0;i<8;i++){mask(i);fmt(i);var pp=pen();if(pp<bp){bp=pp;best=i}mask(i)}
 mask(best);fmt(best);return m}
function svg(text,px){var m=make(text),n=m.length,b=4,d='';
 for(var y=0;y<n;y++)for(var x=0;x<n;x++)if(m[y][x])d+='M'+(x+b)+' '+(y+b)+'h1v1h-1z';
 var t=n+2*b;return'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+t+' '+t+'" width="'+(px||240)+'" height="'+(px||240)+'" shape-rendering="crispEdges"><rect width="'+t+'" height="'+t+'" fill="#fff"/><path d="'+d+'" fill="#000"/></svg>'}
return{make:make,svg:svg}})();
if(typeof module!=='undefined')module.exports=QR;
