# PDF(AutoCAD 출력) → pdftocairo SVG → 편집용 엔티티 JSON
import re, json, sys, collections
svg, words, out = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(svg).read()
defs, body = s[:s.find('</defs>')], s[s.find('</defs>'):]
K = 10  # 1pt = 10 도면단위
def tf(m):
  a,b,c,d,e,f = [float(x) for x in m.split(',')]
  return lambda x,y: (a*x+c*y+e, b*x+d*y+f)
def col(rgb):
  r,g,b = [round(float(v)*2.55) for v in re.findall(r'([\d.]+)%', rgb)]
  return '#%02x%02x%02x' % (r,g,b)
def subpaths(d):
  out=[]; cur=None; closed=False
  for cmd,nums in re.findall(r'([MLZ])([^MLZ]*)', d):
    v=[float(x) for x in nums.split()]
    if cmd=='M':
      if cur: out.append((cur,closed))
      cur=[(v[0],v[1])]; closed=False
    elif cmd=='L':
      for i in range(0,len(v),2): cur.append((v[i],v[i+1]))
    else: closed=True
  if cur: out.append((cur,closed))
  return out
ents=[]; nid=0
def add(e):
  global nid; nid+=1; e['id']='b%d'%nid; ents.append(e)
# 선 굵기·색으로 레이어 나누기
def layer_of(fill, stroke, w):
  if fill:
    return {'#e6e6e6':'도로','#ffff00':'구역경계(노랑)','#000000':'사업경계','#abe4f7':'수계'}.get(fill,'채움')
  if stroke=='#000000': return {1:'필지',2:'건물'}.get(w,'사업경계')
  if stroke=='#ffff00': return '구역경계(노랑)'
  if stroke=='#808080': return '도로선'
  if stroke=='#e6e6e6': return '도로'
  return '기타'
run=None
for m in re.finditer(r'<path ([^>]*)/>|<g fill="([^"]*)"[^>]*>(.*?)</g>', body, re.S):
  if m.group(1):
    a=dict(re.findall(r'([\w-]+)="([^"]*)"', m.group(1)))
    T=tf(a['transform'].replace('matrix(','').rstrip(')'))
    fill=col(a['fill']) if a.get('fill','none')!='none' else None
    stroke=col(a['stroke']) if a.get('stroke','none')!='none' else None
    w=float(a.get('stroke-width','1'))
    lay=layer_of(fill,stroke,w)
    sps=[([T(x,y) for x,y in pts],cl) for pts,cl in subpaths(a['d'])]
    if fill:
      rings=[[round(v*K) for p in pts for v in p] for pts,cl in sps if len(pts)>=3]
      # 같은 색 채움이 이어지면 한 덩어리로
      if run and run['c']==fill and run['l']==lay and len(run['p'])<400: run['p'].extend(rings)
      else:
        run={'t':'fill','l':lay,'c':fill,'p':rings}; add(run)
    else:
      run=None
      for pts,cl in sps:
        q=[]
        for x,y in pts:
          X,Y=round(x*K),round(y*K)
          if not q or (q[-2],q[-1])!=(X,Y): q+= [X,Y]
        if len(q)>=4 and (q[0],q[1])==(q[-2],q[-1]) and len(q)>4: q=q[:-2]; cl=True
        if len(q)<4: continue
        e={'t':'pl','l':lay,'c':stroke,'w':w,'p':q}
        if cl: e['z']=1
        add(e)
  else:
    run=None
    us=[(h,float(x),float(y)) for h,x,y in re.findall(r'<use xlink:href="#(glyph-[\d-]+)" x="([\d.-]+)" y="([\d.-]+)"/>', m.group(3))]
    if not us: continue
    # 단어 단위로 나누기(간격이 크면)
    groups=[[us[0]]]
    for u in us[1:]:
      if abs(u[2]-groups[-1][-1][2])>1.2 or not (-0.5 < u[1]-groups[-1][-1][1] < 6): groups.append([u])
      else: groups[-1].append(u)
    for g in groups:
      add({'t':'gl','l':'지번','c':col(m.group(2)),'x':round(g[0][1]*K,1),'y':round(g[0][2]*K,1),'g':[[h,round((x-g[0][1])*K,2)]+([round((y-g[0][2])*K,2)] if abs(y-g[0][2])>0.001 else []) for h,x,y in g]})
# 글리프 모양
glyph={}
for gid,inner in re.findall(r'<g id="(glyph-[\d-]+)">\s*(.*?)\s*</g>', defs, re.S):
  d=re.search(r' d="([^"]*)"', inner)
  if not d: glyph[gid]=''; continue
  glyph[gid]=re.sub(r'-?\d+\.?\d*', lambda n: ('%.3f'%(float(n.group(0))*K)).rstrip('0').rstrip('.'), d.group(1)).strip()
# 글자 내용 (pdftotext 단어 위치로 맞춤)
W=[(float(a),float(b),float(c),float(d),t) for a,b,c,d,t in re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>', open(words).read())]
import html
miss=0
for e in ents:
  if e['t']!='gl': continue
  x0=e['x']/K; y=e['y']/K; x1=x0+e['g'][-1][1]/K; y=y+(e['g'][-1][2]/K if len(e['g'][-1])>2 else 0)/2
  cand=[w for w in W if w[0]>=x0-0.3 and w[0]<=x1+0.3 and w[1]-0.5<=y<=w[3]+1.5]
  cand.sort(key=lambda w:w[0])
  if cand:
    e['s']=html.unescape(' '.join(w[4] for w in cand)); e['h']=round((cand[0][3]-cand[0][1])*K,1)
  else: miss+=1
# 글리프 아이디를 짧은 번호로
used=sorted({g[0] for e in ents if e['t']=='gl' for g in e['g']})
idx={h:i for i,h in enumerate(used)}
for e in ents:
  if e['t']=='gl': e['g']=[[idx[g[0]]]+g[1:] for g in e['g']]
xs=[v for e in ents if e['t'] in('pl','fill') for v in (e['p'][0::2] if e['t']=='pl' else [c for r in e['p'] for c in r[0::2]])]
ys=[v for e in ents if e['t'] in('pl','fill') for v in (e['p'][1::2] if e['t']=='pl' else [c for r in e['p'] for c in r[1::2]])]
LAY=[('도로','#e6e6e6'),('도로선','#808080'),('수계','#abe4f7'),('필지','#000000'),('건물','#000000'),('구역경계(노랑)','#ffff00'),('사업경계','#000000'),('지번','#000000'),('기타','#444444'),('채움','#cccccc')]
used_l={e['l'] for e in ents}
doc={'v':1,'unit':K,'size':[8420,5950],'ext':[min(xs),min(ys),max(xs),max(ys)],
 'layers':[{'id':n,'name':n,'color':c} for n,c in LAY if n in used_l],
 'glyphs':[glyph[h] for h in used],'ents':ents}
json.dump(doc,open(out,'w'),ensure_ascii=False,separators=(',',':'))
print('ents',len(ents),collections.Counter((e['t'],e['l']) for e in ents),'textmiss',miss)
