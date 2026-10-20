# Builds demo_v2.mp4 from slides (PIL) and natural neural narration (edge-tts) with ffmpeg.
import re, subprocess, os, textwrap, asyncio
from PIL import Image, ImageDraw, ImageFont
import edge_tts
VOICE = "en-US-AvaMultilingualNeural"
rows = [l for l in open("docs/demo_script.md") if re.match(r"\| \d", l)]
out = open("docs/demo-output.txt").read().splitlines()
live = {5: [out[1], out[2]], 6: out[3:7], 7: out[9:11], 4: [out[0]]}
os.makedirs("build", exist_ok=True)
F = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
big, small = ImageFont.truetype(F, 72), ImageFont.truetype(F, 40)
def speak(text, path):
    text = text.replace("Done + Documented", "Done and Documented")
    asyncio.run(edge_tts.Communicate(text, VOICE, rate="-4%").save(path))
parts = []
for r in rows:
    n, scr, nar = [c.strip() for c in r.strip().strip("|").split("|")]
    n = int(n); im = Image.new("RGB", (1280, 720), "#000000"); d = ImageDraw.Draw(im)
    for i, t in enumerate(textwrap.wrap(scr, 28)):
        d.text((60, 50 + i * 84), t, font=big, fill="#ffd34d")
    y = 220
    lines = [l.strip().strip('"') for l in live.get(n, [])] or [nar]
    for line in lines:
        for w in textwrap.wrap(line, 48):
            if y < 680: d.text((60, y), w, font=small, fill="white"); y += 54
        y += 10
    im.save(f"build/{n}.png"); speak(nar, f"build/{n}.mp3")
    subprocess.run(["ffmpeg","-y","-loglevel","error","-loop","1","-i",f"build/{n}.png","-i",f"build/{n}.mp3","-af","apad=pad_dur=0.6","-c:v","libx264","-tune","stillimage","-pix_fmt","yuv420p","-r","25","-c:a","aac","-ar","44100","-shortest",f"build/{n}.mp4"],check=True)
    parts.append(f"file '{n}.mp4'")
open("build/list.txt","w").write("\n".join(parts))
subprocess.run(["ffmpeg","-y","-loglevel","error","-f","concat","-safe","0","-i","build/list.txt","-c","copy","demo_v2.mp4"],check=True)
