import readExcelFile from "read-excel-file/node"

export namespace Spreadsheet {
  export const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

  const BYTES = 20 * 1024 * 1024
  const SHEETS = 20
  const ROWS = 2_000
  const COLUMNS = 100
  const CHARS = 200_000

  export function supports(mime: string) {
    return mime === MIME
  }

  function clean(value: string) {
    return value.replaceAll("\t", " ").replaceAll("\r\n", "\\n").replaceAll("\n", "\\n").replaceAll("`", "'")
  }

  function bytes(url: string) {
    const index = url.indexOf(",")
    if (index === -1 || !url.slice(0, index).endsWith(";base64")) throw new Error("Invalid XLSX data URL")

    const data = url.slice(index + 1)
    if (Math.ceil((data.length * 3) / 4) > BYTES) throw new Error("XLSX file exceeds the 20 MB limit")
    return Buffer.from(data, "base64")
  }

  function value(cell: unknown) {
    if (cell === null || cell === undefined) return ""
    if (cell instanceof Date) return cell.toISOString()
    return clean(String(cell))
  }

  export async function text(url: string, filename = "spreadsheet.xlsx") {
    const book = await readExcelFile(bytes(url))

    const output = [`Attached spreadsheet "${clean(filename)}" converted to TSV.`]
    let length = output[0].length
    let truncated = book.length > SHEETS

    const append = (line: string) => {
      if (length + line.length + 1 > CHARS - 256) return false
      output.push(line)
      length += line.length + 1
      return true
    }

    for (const sheet of book.slice(0, SHEETS)) {
      if (!append(`\n## Sheet: ${clean(sheet.sheet)}`)) {
        truncated = true
        break
      }

      const columns = Math.max(0, ...sheet.data.map((row) => row.length))
      if (!sheet.data.length || !columns) {
        append("[Empty sheet]")
        continue
      }

      append("```tsv")
      const rows = Math.min(sheet.data.length, ROWS)
      const width = Math.min(columns, COLUMNS)
      truncated ||= sheet.data.length > ROWS || columns > COLUMNS

      for (let row = 1; row <= rows; row++) {
        const data = sheet.data[row - 1] ?? []
        const cells = Array.from({ length: width }, (_, column) => value(data[column]))
        while (cells.at(-1) === "") cells.pop()
        if (append(cells.join("\t"))) continue
        truncated = true
        break
      }
      append("```")
      if (length >= CHARS - 256) break
    }

    if (truncated) output.push("\n[Spreadsheet output truncated to fit attachment limits.]")
    return output.join("\n")
  }
}
