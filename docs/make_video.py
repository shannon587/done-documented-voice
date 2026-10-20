# Builds demo.mp4 from slides (PIL) and narration (gTTS) with ffmpeg.
import re, subprocess, os, textwrap
from PIL import Image, ImageDraw, ImageFont
from gtts import gTTS
rows = [l for l in open("docs/demo_script.md") if re.match(r"\| \d", l)]
out = open("docs/demo-output.txt").read().splitlines()
live = {5: out[1:3], 6: out[3:7], 7: out[9:11], 4: [out[0]]}
os.makedirs("build", exist_ok=True)
F = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
big, small = ImageFont.truetype(F, 64), ImageFont.truetype(F.replace("-Bold", ""), 30)
parts = []
for r in rows:
    n, scr, nar = [c.strip() for c in r.strip().strip("|").split("|")]
    n = int(n); im = Image.new("RGB", (1280, 720), "#0b1020"); d = ImageDraw.Draw(im)
    d.text((60, 60), scr, font=big, fill="#ffd34d")
    y = 180
    for line in live.get(n, []) or textwrap.wrap(nar, 60):
        for w in textwrap.wrap(line, 70):
            d.text((60, y), w, font=small, fill="white"); y += 42
    im.save(f"build/{n}.png"); gTTS(nar, lang="en").save(f"build/{n}.mp3")
    subprocess.run(["ffmpeg","-y","-loglevel","error","-loop","1","-i",f"build/{n}.png","-i",f"build/{n}.mp3","-c:v","libx264","-tune","stillimage","-pix_fmt","yuv420p","-c:a","aac","-ar","44100","-shortest",f"build/{n}.mp4"],check=True)
    parts.append(f"file '{n}.mp4'")
open("build/list.txt","w").write("\n".join(parts))
subprocess.run(["ffmpeg","-y","-loglevel","error","-f","concat","-safe","0","-i","build/list.txt","-c","copy","demo.mp4"],check=True)
