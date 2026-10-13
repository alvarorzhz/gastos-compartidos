import { describe, expect, it } from 'vitest';
import { readXlsx } from './xlsx';

/** Monta un .xlsx mínimo (zip con deflate) como los que exporta el banco. */
async function makeXlsx(files: Record<string, string>): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = enc.encode(content);
    const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const data = new Uint8Array(await new Response(stream).arrayBuffer());
    const n = enc.encode(name);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, 8, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, n.length, true);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(10, 8, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, raw.length, true);
    cd.setUint16(28, n.length, true);
    cd.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), n, data);
    central.push(new Uint8Array(cd.buffer), n);
    offset += 30 + n.length + data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[]).arrayBuffer();
}

describe('readXlsx', () => {
  it('lee la primera hoja con textos compartidos, números y celdas vacías', async () => {
    const file = await makeXlsx({
      'xl/workbook.xml': '<workbook><sheets><sheet name="Informe BBVA" sheetId="1" r:id="rId4"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId4" Type="x" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/sharedStrings.xml': '<sst><si><t>Fecha</t></si><si><r><t>Lidl &amp; </t></r><r><t>co</t></r></si></sst>',
      'xl/worksheets/sheet1.xml':
        '<worksheet><sheetData><row r="1"/><row r="2"><c r="B2" t="s"><v>0</v></c></row>' +
        '<row r="3"><c r="B3" t="s"><v>1</v></c><c r="D3"><v>-8.98</v></c><c r="E3" t="inlineStr"><is><t>EUR</t></is></c></row></sheetData></worksheet>',
    });
    expect(await readXlsx(file)).toEqual([[], ['', 'Fecha'], ['', 'Lidl & co', '', '-8.98', 'EUR']]);
  });

  it('avisa si no es un Excel', async () => {
    await expect(readXlsx(new TextEncoder().encode('hola').buffer as ArrayBuffer)).rejects.toThrow('No es un archivo Excel');
  });
});
