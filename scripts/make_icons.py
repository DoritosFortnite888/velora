"""Regenerates Velora's original icons. Needs Pillow:  pip install pillow

Design: a deep night background, a V drawn with a violet-to-teal gradient,
and a small glowing spark at the point, like a speech bubble lighting up.
Run from the project folder:  python scripts/make_icons.py
"""
from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"
OUT.mkdir(exist_ok=True)
SUPER = 2          # draw at 2x, then shrink for smooth edges
BASE = 1024 * SUPER

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def background(size):
    img = Image.new("RGB", (size, size))
    px = img.load()
    top_left = (30, 24, 70)     # deep indigo
    bottom_right = (9, 11, 18)  # near black
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            px[x, y] = lerp(top_left, bottom_right, t)
    glow = Image.new("RGB", (size, size), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([size * 0.25, size * 0.30, size * 0.85, size * 0.95], fill=(70, 60, 140))
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.12))
    return Image.blend(img, Image.composite(glow, img, glow.convert("L")), 0.55)

def gradient_stripe(size):
    stripe = Image.new("RGB", (size, size))
    px = stripe.load()
    violet = (139, 123, 255)
    teal = (63, 224, 200)
    for y in range(size):
        for x in range(size):
            t = min(1.0, max(0.0, (x * 0.4 + y * 0.6) / size))
            px[x, y] = lerp(violet, teal, t)
    return stripe

def draw_logo(size, scale=1.0):
    """Returns an RGB image of the mark on the background at the given size."""
    bg = background(size)
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)

    def p(x, y):  # coordinates are fractions of the logo box, centred and scaled
        cx = size / 2
        return (cx + (x - 0.5) * size * scale, cx + (y - 0.5) * size * scale)

    left_top, bottom, right_top = p(0.25, 0.30), p(0.50, 0.74), p(0.75, 0.30)
    width = int(size * 0.135 * scale)
    md.line([left_top, bottom, right_top], fill=255, width=width, joint="curve")
    for point in (left_top, bottom, right_top):
        r = width / 2
        md.ellipse([point[0] - r, point[1] - r, point[0] + r, point[1] + r], fill=255)

    stripe = gradient_stripe(size)
    logo = Image.composite(stripe, bg, mask)

    # Glowing spark at the point of the V.
    spark_layer = Image.new("RGB", (size, size), (0, 0, 0))
    sd = ImageDraw.Draw(spark_layer)
    cx, cy = p(0.50, 0.84)
    r_glow = size * 0.09 * scale
    sd.ellipse([cx - r_glow, cy - r_glow, cx + r_glow, cy + r_glow], fill=(63, 224, 200))
    spark_layer = spark_layer.filter(ImageFilter.GaussianBlur(size * 0.035))
    logo = Image.blend(logo, Image.composite(spark_layer, logo, spark_layer.convert("L")), 0.9)

    core = Image.new("RGB", (size, size), (0, 0, 0))
    cd = ImageDraw.Draw(core)
    r_core = size * 0.035 * scale
    cd.ellipse([cx - r_core, cy - r_core, cx + r_core, cy + r_core], fill=(230, 255, 250))
    core_mask = core.convert("L")
    logo = Image.composite(core, logo, core_mask)
    return logo

def render(size_px, scale=1.0, name="icon.png"):
    big = draw_logo(BASE, scale)
    final = big.resize((size_px, size_px), Image.LANCZOS)
    final.save(OUT / name, format="PNG", optimize=True)
    print("wrote", OUT / name, final.size)

if __name__ == "__main__":
    render(512, 1.0, "icon-512.png")
    render(192, 1.0, "icon-192.png")
    render(180, 1.0, "apple-touch-icon.png")
    # Maskable icons keep the mark inside the central safe area (about 80%).
    render(512, 0.78, "icon-maskable-512.png")
