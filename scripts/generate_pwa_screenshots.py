"""Génère 3 mockups PNG 390×844 (iPhone narrow) pour le manifest PWA.

Ces images servent uniquement d'aperçu dans la fenêtre d'installation Android.
Elles ne remplacent pas de vraies captures d'écran — un utilisateur peut les
substituer manuellement en gardant les mêmes noms de fichiers.
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT_DIR = Path("/app/frontend/public")
BEVID_PURPLE = (74, 21, 75)   # #4A154B
BEVID_LILAC = (176, 118, 180)  # #B076B4
BG = (247, 245, 242)            # #F7F5F2
STONE = (60, 55, 50)


def _font(size: int):
    for candidate in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def _font_r(size: int):
    for candidate in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def _base(title: str, overline: str):
    img = Image.new("RGB", (390, 844), BG)
    d = ImageDraw.Draw(img)
    # Bandeau haut
    d.rectangle([0, 0, 390, 60], fill=BEVID_PURPLE)
    d.text((20, 18), "BEVID · CRM", fill=(255, 255, 255), font=_font(20))
    # Overline + titre
    d.text((20, 90), overline.upper(), fill=BEVID_LILAC, font=_font_r(12))
    d.text((20, 108), title, fill=STONE, font=_font(30))
    # Barre bas nav
    d.rectangle([0, 780, 390, 844], fill=(255, 255, 255))
    d.line([(0, 780), (390, 780)], fill=(220, 215, 210), width=1)
    for i, label in enumerate(["Tournée", "Visite", "Scan", "Clients", "Tableau"]):
        x = 25 + i * 78
        d.text((x, 810), label, fill=STONE, font=_font_r(10))
    return img, d


def make_tournee():
    img, d = _base("Ma tournée", "Mon portefeuille")
    # 4 cartes établissements
    for i, (name, city, credit) in enumerate([
        ("Le Bar du Coin", "Toulouse · Bar", (45, 90, 76)),         # vert
        ("Brasserie Saint-Sernin", "Toulouse · Restaurant", (199, 139, 58)),  # orange
        ("Caviste Le Vin Nature", "Blagnac · Caviste", (45, 90, 76)),
        ("Hôtel des Beaux-Arts", "Toulouse · Hôtel", (140, 42, 42)),  # rouge
    ]):
        y = 170 + i * 100
        d.rectangle([16, y, 374, y + 84], fill=(255, 255, 255), outline=(220, 215, 210), width=1)
        d.ellipse([32, y + 12, 46, y + 26], fill=credit)
        d.text((60, y + 12), name, fill=STONE, font=_font(16))
        d.text((60, y + 38), city, fill=(140, 130, 120), font=_font_r(12))
        d.text((60, y + 58), "🕐  probablement à sec vers le 05/09", fill=(140, 130, 120), font=_font_r(11))
    img.save(OUT_DIR / "screenshot-tournee.png")
    return img


def make_clients():
    img, d = _base("Clients", "Portefeuille")
    # Search bar
    d.rectangle([16, 170, 374, 210], fill=(255, 255, 255), outline=(220, 215, 210), width=1)
    d.text((30, 182), "Rechercher un client, une ville…", fill=(160, 150, 140), font=_font_r(13))
    # 6 clients denses
    for i, name in enumerate([
        "Le Bar du Coin — Toulouse",
        "Brasserie Saint-Sernin",
        "Caviste Le Vin Nature",
        "Hôtel des Beaux-Arts",
        "Café des Sports",
        "Restaurant Chez Michel",
    ]):
        y = 230 + i * 78
        d.rectangle([16, y, 374, y + 66], fill=(255, 255, 255), outline=(220, 215, 210), width=1)
        d.text((30, y + 12), name, fill=STONE, font=_font(15))
        d.text((30, y + 38), f"Encours 12 300 € · +21 j moyen · 3 fûts/mois", fill=(140, 130, 120), font=_font_r(11))
    img.save(OUT_DIR / "screenshot-clients.png")


def make_etablissement():
    img, d = _base("Le Bar du Coin", "Établissement 360°")
    # Puce crédit + adresse
    d.ellipse([20, 168, 34, 182], fill=(45, 90, 76))
    d.text((44, 165), "Crédit vert · 12 rue Alsace, Toulouse", fill=STONE, font=_font_r(12))
    # KPIs
    for i, (label, value, color) in enumerate([
        ("Encours", "3 200 €", STONE),
        ("Retard", "0 j", (45, 90, 76)),
        ("Fréq.", "21 j", STONE),
    ]):
        x = 16 + i * 122
        d.rectangle([x, 200, x + 114, 268], fill=(255, 255, 255), outline=(220, 215, 210), width=1)
        d.text((x + 12, 214), label.upper(), fill=(160, 150, 140), font=_font_r(10))
        d.text((x + 12, 232), value, fill=color, font=_font(22))
    # Bloc mémoire
    d.rectangle([16, 290, 374, 470], fill=(255, 255, 255), outline=(220, 215, 210), width=1)
    d.text((30, 302), "CE QU'IL FAUT SAVOIR", fill=BEVID_LILAC, font=_font_r(10))
    lines = [
        "• Blonde 30L · rythme 21 j · dernière il y a 6 j",
        "• IPA 24×33cl · rupture probable jeudi",
        "• Objection prix ouverte depuis 3 sem.",
        "• Engagement : rappel jeudi 14h",
    ]
    for i, line in enumerate(lines):
        d.text((30, 328 + i * 30), line, fill=STONE, font=_font_r(12))
    # Bouton commande
    d.rectangle([16, 500, 374, 552], fill=BEVID_PURPLE)
    d.text((130, 517), "Prendre une commande", fill=(255, 255, 255), font=_font(15))
    img.save(OUT_DIR / "screenshot-etablissement.png")


if __name__ == "__main__":
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    make_tournee()
    make_clients()
    make_etablissement()
    print("3 screenshots générés dans", OUT_DIR)
