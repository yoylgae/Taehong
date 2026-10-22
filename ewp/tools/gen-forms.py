import subprocess, re, json, os, sys
PDF='/home/claude/guide/g.pdf'; OUT='/home/claude/taehong/ewp'
F={'bulldozer':([62],61),'excavator':([79],78),'loader':([87],86),'skid':([90],86),'forklift':([98],97),'dump':([109],106),
 'crawler':([138],131),'hydro':([141],133),'mobiletower':([147],135),'cargo':([144],137),'grader':([154],153),'roller':([162],161),
 'mixer':([171],169),'pump':([183],182),'compressor':([197],196),'drill':([204],203),'pile':([219],218),'tower':([246,247],245),
 'lift':([282],281),'gondola':([292],291),'sky':([303],302),'scissor':([315],314),'boom':([323],322),'ladder':([330],329),
 'gantry':([337],336),'water':([341],106),'grab':([343],137),'asphalt':([345],161)}
SUB={'water':'dump','grab':'cargo','asphalt':'roller'}
def words(p):
    h=subprocess.run(['pdftotext','-f',str(p),'-l',str(p),'-bbox',PDF,'-'],capture_output=True,text=True).stdout
    W,H=[float(x) for x in re.search(r'<page width="([\d.]+)" height="([\d.]+)"',h).groups()]
    ws=[dict(x0=float(a),y0=float(b),x1=float(c),y1=float(d),t=t) for a,b,c,d,t in re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>',h)]
    return ws,W,H
FIELD=[(r'^현장명$','site_name'),(r'^(공정명|공종명)$','work_name'),(r'^협력업체$','company_name'),(r'^(장비번호|등록번호|관리번호)$','reg_no'),
 (r'^제조사$','manufacturer'),(r'^형식(\(모델명\))?$','model_name'),(r'^규격$','spec'),(r'^연식$','make_year'),(r'^(현장반입일|반입일)(\(설치일\))?$','in_date'),(r'^(점검일자|점검일)$','check_date')]
def fld(t):
    for re_,k in FIELD:
        if re.match(re_,t): return k
    return None
def pre_pos(p):
    ws,W,H=words(p)
    title=min((w for w in ws if w['t'] in('사용전','반입전','작업전') or w['t'].startswith('사용전')), key=lambda w:w['y0'])
    hw=[w for w in ws if w['y0']>title['y1'] and w['y0']<title['y1']+130]
    hw.sort(key=lambda w:(w['y0']+w['y1'])/2)
    rows=[];
    for w in hw:
        c=(w['y0']+w['y1'])/2
        if rows and c-rows[-1]['c']<9: rows[-1]['w'].append(w); rows[-1]['c']=c
        else: rows.append({'c':c,'w':[w]})
    out={}; cents=[]
    for r in rows:
        ws_=sorted(r['w'],key=lambda w:w['x0'])
        # 가로로 붙은 글자를 이름표로 묶기 (세로로 쌓인 '(모델명)'도 같은 이름표)
        labs=[]
        for w in ws_:
            hit=next((l for l in labs if w['x0']<=l['x1']+14 and w['x1']>=l['x0']-14),None)
            if hit: hit['ps'].append(w); hit['x0']=min(hit['x0'],w['x0']); hit['x1']=max(hit['x1'],w['x1']); hit['y0']=min(hit['y0'],w['y0']); hit['y1']=max(hit['y1'],w['y1'])
            else: l=dict(w); l['ps']=[w]; labs.append(l)
        for l in labs: l['t']=''.join(q['t'] for q in sorted(l['ps'],key=lambda q:(round(q['y0']/7),q['x0'])))
        ks=[fld(re.sub(r'\s','',l['t'])) for l in labs]
        if not any(ks): break
        if not all(ks): break
        cents.append((sum(l['y0']+l['y1'] for l in labs)/(2*len(labs)),labs,ks))
    if not cents: return None,ws,W,H
    cs=[c for c,_,_ in cents]
    if len(cs)==1: cs=[cs[0],cs[0]+27]
    for i,(c,labs,ks) in enumerate(cents):
        top=(c-(cs[1]-cs[0])/2) if i==0 else (cs[i-1]+c)/2
        bot=(c+(c-cs[i-1])/2) if i==len(cs)-1 else (c+cs[i+1])/2
        for j,(l,k) in enumerate(zip(labs,ks)):
            x0=l['x1']+5; x1=(labs[j+1]['x0']-5) if j+1<len(labs) else W-14
            out[k]=[round(x0/W*100,3),round(top/H*100,3),round((x1-x0)/W*100,3),round((bot-top)/H*100,3)]
    return out,ws,W,H
def sign_pos(ws,W,H,keys=('(운전원)','운전원','운전자','운전원)')):
    for w in sorted(ws,key=lambda w:-w['y0']):
        if w['y0']<H*0.55: break
        if w['t'] in keys:
            ins=[v for v in ws if v['t'] in('(인)','(인')and abs((v['y0']+v['y1'])/2-(w['y0']+w['y1'])/2)<8 and v['x0']>w['x1']]
            if not ins: continue
            i=min(ins,key=lambda v:v['x0'])
            x0=w['x1']+4; x1=i['x0']-4; c=(w['y0']+w['y1'])/2; h=16
            up=[v for v in ws if v['t']=='협력업체' and 0<w['y0']-v['y0']<18 and abs(v['x0']-w['x0'])<20]
            if up: c=(up[0]['y0']+w['y1'])/2; x0=max(x0,up[0]['x1']+4)
            return [round(x0/W*100,3),round((c-h/2)/H*100,3),round((x1-x0)/W*100,3),round(h/H*100,3)]
    return None
from PIL import Image
def border_fix(p,pos):
    im=Image.open(f'{OUT}/forms/p{p}.jpg').convert('L'); IW,IH=im.size; px=im.load()
    def dark_col(x,yc):
        n=0
        for dy in range(-5,6):
            y=min(IH-1,max(0,yc+dy))
            if px[x,y]<110: n+=1
        return n>=9
    for k,(x,y,w,h) in list(pos.items()):
        yc=int((y+h/2)/100*IH); x0=int(x/100*IW); x1=int((x+w)/100*IW)
        # 왼쪽: 이름표 오른쪽에서 처음 만나는 세로선 뒤로
        for xx in range(max(0,x0-6),min(IW-1,x0+int(IW*0.12))):
            if dark_col(xx,yc):
                while xx<IW-1 and dark_col(xx+1,yc): xx+=1
                x0=xx+3; break
        # 오른쪽: 다음 이름표 앞에서 거꾸로 처음 만나는 세로선 앞까지
        for xx in range(min(IW-1,x1+6),max(x0+5,x1-int(IW*0.12)),-1):
            if dark_col(xx,yc):
                while xx>0 and dark_col(xx-1,yc): xx-=1
                x1=xx-3; break
        if x1-x0>10: pos[k]=[round(x0/IW*100,3),y,round((x1-x0)/IW*100,3),h]
    return pos
def render(p):
    f=f'{OUT}/forms/p{p}.jpg'
    if os.path.exists(f): return
    subprocess.run(['pdftoppm','-f',str(p),'-l',str(p),'-r','150','-jpeg','-jpegopt','quality=72','-singlefile',PDF,f[:-4]],check=True)
os.makedirs(OUT+'/forms',exist_ok=True)
data={}; probs=[]
for k,(pres,pl) in F.items():
    e={'pre':[],'pledge':None}
    for i,p in enumerate(pres):
        pos,ws,W,H=pre_pos(p)
        if not pos: probs.append((k,p,'no header'))
        sg=sign_pos(ws,W,H)
        if pos is None: pos={}
        if sg: pos['driver']=sg
        else: probs.append((k,p,'no sign'))
        render(p); pos=border_fix(p,pos)
        e['pre'].append({'page':p,'label':(['T형','L형'][i] if k=='tower' else ''),'pos':pos})
    ws,W,H=words(pl); sg=sign_pos(ws,W,H)
    if not sg: probs.append((k,pl,'no pledge sign'))
    e['pledge']={'page':pl,'pos':{'driver':sg} if sg else {}, 'sub':SUB.get(k)}; render(pl)
    data[k]=e
js='// 건설장비 안전관리 가이드(2026)의 반입전(사용전) 점검표 · 운전원 서약서 원본 페이지(forms/p쪽.jpg)와 값을 얹을 위치(%)\nexport const FORMS = '+json.dumps(data,ensure_ascii=False)+';\n'
open(OUT+'/forms-data.js','w').write(js)
print('problems',probs)
for k in ['excavator','tower','compressor','mixer','water']: print(k,json.dumps(data[k],ensure_ascii=False)[:600])
