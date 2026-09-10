# -*- coding: utf-8 -*-
import io
def editer(chemin, paires):
    brut = io.open(chemin, encoding='utf-8', newline='').read()
    crlf = '\r\n' in brut
    s = brut.replace('\r\n', '\n')
    for avant, apres in paires:
        if avant not in s:
            raise SystemExit('MOTIF ABSENT dans %s :\n---\n%s\n---' % (chemin, avant[:200]))
        s = s.replace(avant, apres, 1)
    if crlf: s = s.replace('\n', '\r\n')
    io.open(chemin, 'w', encoding='utf-8', newline='').write(s)
    print('OK', chemin)
