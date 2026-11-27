param(
  [Parameter(Mandatory = $true)][string]$Workbook,
  [Parameter(Mandatory = $true)][string]$OutputJson,
  [Parameter(Mandatory = $true)][int]$Year
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Workbook).Path)

function Read-ArchiveXml([string]$name) {
  $entry = $archive.GetEntry($name)
  if (-not $entry) { throw "Missing workbook entry: $name" }
  $reader = [System.IO.StreamReader]::new($entry.Open())
  try { return [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
}

function Get-CellValue($cell, $strings) {
  if ($null -eq $cell -or $null -eq $cell.v) { return '' }
  $value = [string]$cell.v
  if ($cell.t -eq 's') { return [string]$strings[[int]$value] }
  return $value
}

function Get-TextValue($value) {
  if ($value -is [System.Xml.XmlNode]) { return $value.InnerText }
  return [string]$value
}

try {
  $strings = @((Read-ArchiveXml 'xl/sharedStrings.xml').sst.si | ForEach-Object {
    if ($null -ne $_.t) { Get-TextValue $_.t }
    else { (@($_.r | ForEach-Object { Get-TextValue $_.t }) -join '') }
  })
  $book = Read-ArchiveXml 'xl/workbook.xml'
  $relationships = Read-ArchiveXml 'xl/_rels/workbook.xml.rels'
  $items = @()
  foreach ($sheet in $book.workbook.sheets.sheet) {
    if ($sheet.name -notmatch '^THÁNG\s+(\d{1,2})$') { continue }
    $month = [int]$Matches[1]
    if ($month -lt 1 -or $month -gt 12) { throw "Invalid month in sheet $($sheet.name)" }
    $relationshipId = $sheet.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    $relation = $relationships.Relationships.Relationship | Where-Object { $_.Id -eq $relationshipId }
    if (-not $relation) { throw "Missing sheet relationship for $($sheet.name)" }
    $target = [string]$relation.Target
    if ($target.StartsWith('/')) { $target = $target.TrimStart('/') }
    else { $target = 'xl/' + $target }
    $document = Read-ArchiveXml $target
    $rows = @($document.worksheet.sheetData.row)
    $header = $rows | Where-Object { $_.r -eq '1' } | Select-Object -First 1
    if (-not $header) { throw "Missing header in $($sheet.name)" }
    $columns = @{}
    foreach ($cell in $header.c) {
      $name = Get-CellValue $cell $strings
      if ($name) { $columns[$name] = ([string]$cell.r -replace '\d', '') }
    }
    foreach ($name in @('Công việc', 'Người làm', 'Trạng thái', 'Ngày làm', 'Ghi chú')) {
      if (-not $columns.ContainsKey($name)) { throw "Missing '$name' in $($sheet.name)" }
    }
    foreach ($row in $rows) {
      if ([int]$row.r -le 1) { continue }
      $cells = @{}
      foreach ($cell in $row.c) { $cells[([string]$cell.r -replace '\d', '')] = Get-CellValue $cell $strings }
      $title = [string]$cells[$columns['Công việc']]
      if (-not $title.Trim()) { continue }
      $date = [string]$cells[$columns['Ngày làm']]
      if ($date) {
        $serial = 0.0
        if (-not [double]::TryParse($date, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$serial)) {
          throw "Invalid date in $($sheet.name) row $($row.r); review the source before importing."
        }
        $date = [DateTime]::FromOADate($serial).ToString('yyyy-MM-dd')
      }
      $priority = if ($columns.ContainsKey('Mức độ ưu tiên')) { [string]$cells[$columns['Mức độ ưu tiên']] } else { '' }
      if ($priority -match '^\d+\.0$') { $priority = $priority -replace '\.0$', '' }
      $items += [ordered]@{
        source_key = "google-sheets:1e_C0N2TRzXwD08Ox72FKcrV4_jtyOAa7Rxv6zRnx6Jo:$($sheet.name):$($row.r)"
        report_month = '{0:D4}-{1:D2}-01' -f $Year, $month
        title = $title
        priority = $priority
        source_assignee = [string]$cells[$columns['Người làm']]
        status = [string]$cells[$columns['Trạng thái']]
        work_date = $date
        note = [string]$cells[$columns['Ghi chú']]
      }
    }
  }
  $json = ConvertTo-Json -InputObject @($items) -Depth 4
  [System.IO.File]::WriteAllText($OutputJson, $json, [System.Text.UTF8Encoding]::new($false))
  Write-Output "Prepared $($items.Count) rows. Review the JSON and account mappings before import."
} finally {
  $archive.Dispose()
}
