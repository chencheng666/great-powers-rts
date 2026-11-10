"""归一化 CC0 配乐并生成 AAC；源文件和输出文件通过参数指定。"""
import sys, subprocess, tempfile, json
from pathlib import Path
import numpy as np
import soundfile as sf
source, target = map(Path, sys.argv[1:3])
audio, rate = sf.read(source, dtype='float32', always_2d=True)
peak = float(np.max(np.abs(audio)))
rms = float(np.sqrt(np.mean(audio.astype('float64') ** 2)))
gain = min(.91 / max(peak, 1e-8), .14 / max(rms, 1e-8))
with tempfile.TemporaryDirectory(prefix='gp-music-') as folder:
    wav = Path(folder) / 'normalized.wav'
    sf.write(wav, audio * gain, rate, subtype='PCM_16')
    subprocess.run(['/usr/bin/afconvert','-f','m4af','-d','aac','-b','128000',str(wav),str(target)],check=True)
print(json.dumps({'source':str(source),'target':str(target),'seconds':len(audio)/rate,'sourcePeak':peak,'sourceRMS':rms,'gain':gain,'encoding':'AAC 128kbps 有损'},ensure_ascii=False))
