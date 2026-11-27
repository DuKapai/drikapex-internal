import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe.skipIf(process.platform !== "win32")("monthly XLSX import", () => {
  it("preserves formatted shared strings and rich-text runs", () => {
    const temp = mkdtempSync(join(tmpdir(), "monthly-import-test-"));
    try {
      const source = join(temp, "workbook");
      mkdirSync(join(source, "xl", "_rels"), { recursive: true });
      mkdirSync(join(source, "xl", "worksheets"), { recursive: true });
      writeFileSync(join(source, "xl", "workbook.xml"), `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="THÁNG 3" sheetId="1" r:id="rId1"/></sheets></workbook>`);
      writeFileSync(join(source, "xl", "_rels", "workbook.xml.rels"), `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`);
      writeFileSync(join(source, "xl", "sharedStrings.xml"), `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Công việc</t></si><si><t>Người làm</t></si><si><t>Trạng thái</t></si><si><t>Ngày làm</t></si><si><t>Ghi chú</t></si><si><t xml:space="preserve">  Công việc  </t></si><si><r><t xml:space="preserve">Ghi </t></r><r><t>chú</t></r></si></sst>`);
      writeFileSync(join(source, "xl", "worksheets", "sheet1.xml"), `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c></row><row r="2"><c r="A2" t="s"><v>5</v></c><c r="E2" t="s"><v>6</v></c></row></sheetData></worksheet>`);
      const workbook = join(temp, "input.xlsx");
      const output = join(temp, "output.json");
      const script = resolve("scripts", "prepare-monthly-import.ps1");
      const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
      const entries = ["xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/sharedStrings.xml", "xl/worksheets/sheet1.xml"];
      const addEntries = entries.map((entry) =>
        `[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, ${quote(join(source, ...entry.split("/")))}, ${quote(entry)}) | Out-Null;`).join(" ");
      const command = `$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem; $zip = [System.IO.Compression.ZipFile]::Open(${quote(workbook)}, [System.IO.Compression.ZipArchiveMode]::Create); try { ${addEntries} } finally { $zip.Dispose() }; & ${quote(script)} -Workbook ${quote(workbook)} -OutputJson ${quote(output)} -Year 2026`;
      execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(command, "utf16le").toString("base64")]);
      const rows = JSON.parse(readFileSync(output, "utf8")) as Array<{ title: string; note: string }>;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ title: "  Công việc  ", note: "Ghi chú" });
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
