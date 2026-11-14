"""用CC0管弦乐采样与确定性原创乐谱，离线合成探索/交战两套同步配器。"""
from pathlib import Path
import json
import hashlib
import math
import re
import subprocess
import sys
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly, butter, sosfilt, fftconvolve

ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT/'assets/third-party/vsco2-selected'
OUT=ROOT/'releases/music-mountain-sea-20261114';OUT.mkdir(parents=True,exist_ok=True)
RATE=44100;BPM=116;BEAT=60/BPM;BARS=56;SECONDS=BARS*4*BEAT
rng=np.random.default_rng(20261114)
manifest=json.loads((SOURCE/'source.json').read_text())
samples={}
notes={'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
for f in manifest['files']:
    path=SOURCE/f['file'];assert hashlib.sha256(path.read_bytes()).hexdigest()==f['sha256']
    a,rate=sf.read(path,dtype='float32',always_2d=True);a=a.mean(axis=1)
    if rate!=RATE:a=resample_poly(a,RATE//math.gcd(rate,RATE),rate//math.gcd(rate,RATE))
    a=sosfilt(butter(2,35,fs=RATE,btype='highpass',output='sos'),a).astype(np.float32)
    peak=float(np.max(np.abs(a)));assert peak>0
    active=np.flatnonzero(np.abs(a)>peak*.006)
    a=a[max(0,int(active[0])-int(RATE*.008)):]/peak
    if f['pitchName']:
        key,octave=re.fullmatch(r'([A-G])([0-9])',f['pitchName']).groups()
        # 原库采用C3=MIDI60的标记；不把强二次谐波误认为基音。
        f['midi']=(int(octave)+2)*12+notes[key]
    samples.setdefault(f['family'],[]).append((f.get('midi'),a))

# 每个音符记录相同的起音时刻和时值，两个成品可按相位切换。
events=[]
def note(family,pitch,beat,duration,velocity=.7,pan=0,combat=1):
    if beat<0 or beat>=BARS*4:return
    jitter=float(rng.uniform(-.009,.009))
    events.append(dict(family=family,pitch=pitch,at=max(0,beat*BEAT+jitter),duration=duration*BEAT,velocity=velocity*float(rng.uniform(.94,1.04)),pan=pan,combat=combat))
chords=[[38,50,53,57],[34,46,50,53],[41,53,57,60],[36,48,52,55],[43,55,58,62],[33,45,49,52],[38,50,53,57],[33,45,49,52]]
phrases=[[(62,0,1.5),(65,1.5,.5),(69,2,1),(67,3,1),(65,4,2),(64,6,1),(62,7,1)],[(69,0,2),(72,2,1),(74,3,1),(72,4,1.5),(69,5.5,.5),(67,6,2)],[(65,0,1),(67,1,1),(69,2,1.5),(74,3.5,.5),(77,4,2),(76,6,1),(74,7,1)],[(72,0,1.5),(69,1.5,.5),(67,2,1),(65,3,1),(64,4,2),(62,6,2)]]
for bar in range(BARS):
    start=bar*4;chord=chords[(bar//2)%8];bridge=24<=bar<32;intro=bar<4;final=bar>=48
    energy=.44 if intro else .48 if bridge else .78 if bar>=32 else .64
    # 弦乐八分音符有重弱与留白，低弦在强拍推动和声。
    for step in range(8):
        if bridge and step%2:continue
        pitch=chord[1+[0,2,1,2,0,1,2,1][step]%3]+12
        note('violin-short',pitch,start+step*.5,.34,energy*(1 if step%4==0 else .72),-.35,.8)
    for at in [0,2]:
        note('cello-short',chord[0],start+at,.85,energy*.95,.22,.8)
        note('cello-long',chord[0],start+at,1.8,energy*.52,.16,.72)
    if bar%2==0:
        for p in chord[1:]:note('horn',p,start,7.35,energy*.42,-.1,.85)
    # 大乐句留出呼吸，不让所有声部一直满响。
    if not intro and bar%2==0 and not bridge:
        for p,at,dur in phrases[((bar-4)//2)%4]:
            note('trumpet',p,start+at,dur*.88,energy*.82,-.13,1)
            note('horn',p-12,start+at,dur*.93,energy*.55,.12,1.1)
            if bar>=32:note('violin-long',p+12,start+at,dur*.95,energy*.37,-.28,.75)
    elif intro and bar%2==0:
        for p,at,dur in [(50,0,2),(57,2,1),(62,3,1),(65,4,3)]:note('horn',p,start+at,dur*.91,.54,-.1,.9)
    elif bridge:
        for p in chord[1:]:note('violin-long',p+12,start,3.8,.32,-.3,.65)
    for at in [0,2]:
        note('bass-drum',36,start+at,.7,energy*.72,0,1.2)
        note('timpani',None,start+at,2.2,energy*.38,.2,1)
    if not intro and not bridge:
        for step in range(8):note('snare',38,start+step*.5,.24,energy*(.63 if step%4==2 else .3),.1,1.3)
    if bar%8==7:
        for step in range(8):note('snare',38,start+3+step*.125,.12,.22+step*.035,.12,1.5)
    if bar in [4,16,32,40,48]:note('cymbal',None,start,4,.42,.1,1.2)
    if final and bar%2==0:
        for p in [62,65,69]:note('violin-long',p+12,start,6.9,.28,-.3,.8)

cache={}
def voice(e,index):
    group=samples[e['family']]
    if e['pitch'] is None or group[0][0] is None:root,a=group[index%len(group)];ratio=1
    else:root,a=min(group,key=lambda v:abs(v[0]-e['pitch']));ratio=2**((e['pitch']-root)/12)
    key=(e['family'],root,round(ratio,7),round(e['duration'],4),index%len(group)if root is None else 0)
    if key in cache:return cache[key]
    count=int((e['duration']+(.38 if 'short'not in e['family'] else .1))*RATE)
    positions=np.arange(count,dtype=np.float64)*ratio
    result=np.interp(positions,np.arange(len(a)),a,left=0,right=0).astype(np.float32)
    attack=min(int(RATE*.009),count);release=min(int(RATE*.22),count)
    if 'short'not in e['family'] and e['family']not in ['snare','bass-drum','cymbal','timpani']:
        end=min(count,int(e['duration']*RATE));release=min(int(RATE*.3),count-end);result[end:end+release]*=np.linspace(1,0,release);result[end+release:]=0
    result[:attack]*=np.linspace(0,1,attack);result[-min(256,count):]*=np.linspace(1,0,min(256,count))
    cache[key]=result;return result

# 固定的短早反射与低通扩散尾音，不把所有音符泡进长混响。
ir_len=int(RATE*1.45);t=np.arange(ir_len)/RATE;ir=rng.normal(0,1,(ir_len,2)).astype(np.float32)*np.exp(-t[:,None]*5.5)
ir=sosfilt(butter(2,4200,fs=RATE,output='sos'),ir,axis=0);ir*=.003
for delay,gain in [(.023,.18),(.041,.12),(.073,.08),(.113,.04)]:
    ir[int(delay*RATE),0]+=gain;ir[int((delay+.007)*RATE),1]+=gain*.9
reports=[]
for mode in ['calm','battle']:
    mix=np.zeros((int(round(SECONDS*RATE)),2),np.float32)
    for index,e in enumerate(events):
        a=voice(e,index);start=int(e['at']*RATE);count=min(len(a),len(mix)-start)
        strength=e['velocity']**1.4
        if mode=='calm':strength*=.52 if e['family']in ['trumpet','snare','bass-drum','cymbal','timpani']else .8
        else:strength*=e['combat']
        pan=(e['pan']+1)*math.pi/4;weights=np.array([math.cos(pan),math.sin(pan)],np.float32)
        mix[start:start+count]+=a[:count,None]*weights*strength*.18
    for channel in [0,1]:mix[:,channel]+=fftconvolve(mix[:,channel],ir[:,channel],mode='full')[:len(mix)]*.19
    # 固定尾段回收至首小节，避免循环缝隙和尾音硬切。
    fade=int(RATE*.12);mix[:fade]*=np.linspace(0,1,fade)[:,None];mix[-int(RATE*.55):]*=np.linspace(1,0,int(RATE*.55))[:,None]
    peak=float(np.max(np.abs(mix)));mix*=min(.88/max(peak,1e-8),.145/max(float(np.sqrt(np.mean(mix.astype(np.float64)**2))),1e-8))
    wav=OUT/(mode+'.wav');sf.write(wav,mix,RATE,subtype='PCM_24')
    target=ROOT/'assets/audio'/('mountain-sea-'+mode+'.m4a')
    if sys.platform=='darwin':
        subprocess.run(['/usr/bin/afconvert',str(wav),str(target),'-f','m4af','-d','aac','-b','160000','-q','127'],check=True)
        decoded=OUT/(mode+'-decoded.wav');subprocess.run(['/usr/bin/afconvert',str(target),str(decoded),'-f','WAVE','-d','LEF32'],check=True)
        pcm,decoded_rate=sf.read(decoded,dtype='float32');assert decoded_rate==RATE;pcm=pcm.reshape(-1)
    else:
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),'-ar',str(RATE),'-c:a','aac','-b:a','160k',str(target)],check=True)
        pcm=np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(target),'-f','f32le','-ac','2','-ar',str(RATE),'-']),dtype='<f4')
    reports.append(dict(mode=mode,seconds=SECONDS,decodedFrames=len(pcm)//2,peak=float(np.max(np.abs(pcm))),rms=float(np.sqrt(np.mean(pcm.astype(np.float64)**2))),bytes=target.stat().st_size,sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
    print(reports[-1],flush=True)
assert reports[0]['decodedFrames']==reports[1]['decodedFrames']
assert all(r['peak']<1 and r['rms']>.025 for r in reports)
(OUT/'score.json').write_text(json.dumps(dict(bpm=BPM,bars=BARS,seconds=SECONDS,events=events),ensure_ascii=False))
(OUT/'report.json').write_text(json.dumps(dict(title='山海进行曲',originalScore=True,sampledPerformance=True,liveOrchestraRecording=False,source=manifest['source'],license=manifest['license'],samples=len(manifest['files']),tracks=reports),ensure_ascii=False,indent=2)+'\n')
# 中段试听从完整成品截取，不另作听感更好的特殊混音。
a,rate=sf.read(OUT/'battle.wav',dtype='float32');sf.write(OUT/'preview.wav',a[16*rate:51*rate],rate,subtype='PCM_24')
preview=OUT/'山海进行曲-35秒试听.m4a'
if sys.platform=='darwin':subprocess.run(['/usr/bin/afconvert',str(OUT/'preview.wav'),str(preview),'-f','m4af','-d','aac','-b','160000'],check=True)
else:subprocess.run(['ffmpeg','-v','error','-y','-i',str(OUT/'preview.wav'),'-c:a','aac','-b:a','160k',str(preview)],check=True)
