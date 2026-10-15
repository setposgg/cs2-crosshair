"""Regenerate the embedded subset from a local Liberation Sans Regular 2.1.5 TTF.

uv run --with fonttools python scripts/extract-reticle-outlines.py /path/to/LiberationSans-Regular.ttf
Upstream archive: https://github.com/liberationfonts/liberation-fonts/files/7261482/liberation-fonts-ttf-2.1.5.tar.gz
The source font is not shipped. See THIRD_PARTY_NOTICES.md for its licence.
"""
import hashlib
import json
from pathlib import Path
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen

font_file = Path(sys.argv[1])
expected = '76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8'
if hashlib.sha256(font_file.read_bytes()).hexdigest() != expected:
    raise SystemExit('Expected the unmodified Liberation Sans Regular 2.1.5 font (see notice).')
font = TTFont(font_file)
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()

class OutlinePen(BasePen):
    def __init__(self):
        super().__init__(glyphs)
        self.commands = []
    def _moveTo(self, point): self.commands.append(['M', *point])
    def _lineTo(self, point): self.commands.append(['L', *point])
    def _qCurveToOne(self, control, end): self.commands.append(['Q', *control, *end])
    def _closePath(self): self.commands.append(['Z'])

subset = {}
for character in '-0123456789xy':
    name = cmap[ord(character)]
    pen = OutlinePen()
    glyphs[name].draw(pen)
    subset[character] = {'advance': font['hmtx'][name][0], 'commands': pen.commands}
header = '''// Generated from Liberation Sans Regular 2.1.5, SIL OFL 1.1. See THIRD_PARTY_NOTICES.md.
// Only -0123456789xy; original font units (2048/em), no Valve data.
export type OutlineCommand = ['M', number, number] | ['L', number, number] | ['Q', number, number, number, number] | ['Z'];
export const RETICLE_OUTLINES: Readonly<Record<string, { advance: number; commands: readonly OutlineCommand[] }>> = '''
output = Path(__file__).resolve().parent.parent / 'src/reticle-outlines.ts'
output.write_text(header + json.dumps(subset, separators=(',', ':')) + ';\n')
