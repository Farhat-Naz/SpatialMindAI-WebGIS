import {
  ARCHIVE_MAX_EXPANSION_RATIO,
  ARCHIVE_MAX_UNCOMPRESSED_BYTES,
  IMPORT_MAX_FILE_BYTES,
} from "../types/importExport.constants"
import type { ImportSourceFormat } from "../types/importExport.types"

/**
 * Pre-parse safety checks (specs/005-import-export, T006; FR-004, FR-081–FR-083).
 *
 * Every check here runs in the browser, before any read or network call, so a
 * user with a 200 MB file or a malicious archive learns immediately. These are
 * **UX guards, not the security boundary** — because parsing is client-side
 * (research.md Decision 2), the chunk endpoint's Zod validation and
 * `assertProjectRole` are what actually enforce the platform's limits
 * (research.md Decision 18).
 */

export interface GuardResult {
  ok: boolean
  message?: string
}

const OK: GuardResult = { ok: true }

/** ZIP local-file-header magic (`PK\x03\x04`) and the empty-archive variant (`PK\x05\x06`). */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]
const ZIP_EMPTY_MAGIC = [0x50, 0x4b, 0x05, 0x06]

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  return magic.every((byte, index) => bytes[index] === byte)
}

/** Strips a UTF-8 BOM and leading whitespace so the first meaningful character can be inspected. */
function firstMeaningfulChar(text: string): string {
  return text.replace(/^﻿/, "").trimStart().charAt(0)
}

/**
 * Determines a file's format from its **content**, not its extension (FR-004).
 * A `.geojson` containing XML, or a `.txt` renamed to `.geojson`, is rejected
 * here rather than failing confusingly inside a parser.
 *
 * The extension still participates — it disambiguates the two cases content
 * alone cannot separate: `.kmz` from `.zip` (both ZIP archives) and `.kml`
 * from other XML (both start with `<`).
 */
export async function detectFormat(file: File): Promise<ImportSourceFormat | null> {
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  const extension = file.name.toLowerCase().split(".").pop() ?? ""

  if (startsWith(header, ZIP_MAGIC) || startsWith(header, ZIP_EMPTY_MAGIC)) {
    return extension === "kmz" ? "kmz" : "shapefile"
  }

  // Read a small prefix as text — enough to classify without loading a 50 MB file.
  const prefix = await file.slice(0, 4096).text()
  const first = firstMeaningfulChar(prefix)

  if (first === "{" || first === "[") {
    return prefix.includes('"FeatureCollection"') || prefix.includes('"Feature"') || first === "{"
      ? "geojson"
      : null
  }

  if (first === "<") {
    return /<kml[\s>]/i.test(prefix) || /<Placemark[\s>]/i.test(prefix) ? "kml" : null
  }

  // Anything else that parses as delimited text with at least two columns on
  // its first non-empty line is treated as CSV; a `.csv` extension is required
  // so an arbitrary text file is not silently accepted.
  if (extension === "csv" || extension === "tsv" || extension === "txt") {
    const firstLine = prefix.split(/\r?\n/).find((line) => line.trim().length > 0) ?? ""
    if (/[,;\t|]/.test(firstLine)) return "csv"
  }

  return null
}

/** Rejects a file above the platform's upload limit before any read begins (FR-081). */
export function assertFileSize(file: File, maxBytes: number = IMPORT_MAX_FILE_BYTES): GuardResult {
  if (file.size <= 0) {
    return { ok: false, message: "The file is empty — there is nothing to import." }
  }
  if (file.size > maxBytes) {
    const limitMb = Math.floor(maxBytes / (1024 * 1024))
    return {
      ok: false,
      message: `This file is ${formatBytes(file.size)}, which exceeds the ${limitMb} MB import limit.`,
    }
  }
  return OK
}

/**
 * Rejects an archive entry whose name escapes the extraction root — an
 * absolute path, a Windows drive path, or any `..` segment (FR-082, "zip
 * slip"). Called for **every** entry name before any entry is read.
 */
export function assertArchiveEntryPath(entryName: string): GuardResult {
  const normalized = entryName.replace(/\\/g, "/")

  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    return { ok: false, message: "The archive contains an entry with an absolute path and was rejected." }
  }
  if (normalized.split("/").includes("..")) {
    return { ok: false, message: "The archive contains an entry that points outside the archive and was rejected." }
  }
  return OK
}

/**
 * Rejects an archive whose uncompressed size is disproportionate to its
 * compressed size, or whose total expansion exceeds the absolute ceiling
 * (FR-083, "zip bomb"). Checked cumulatively as entries are enumerated, so a
 * pathological archive is rejected before it is fully expanded.
 */
export function assertExpansionRatio(compressedBytes: number, uncompressedBytes: number): GuardResult {
  if (uncompressedBytes > ARCHIVE_MAX_UNCOMPRESSED_BYTES) {
    return {
      ok: false,
      message: `The archive expands to more than ${Math.floor(
        ARCHIVE_MAX_UNCOMPRESSED_BYTES / (1024 * 1024),
      )} MB and was rejected.`,
    }
  }
  if (compressedBytes > 0 && uncompressedBytes / compressedBytes > ARCHIVE_MAX_EXPANSION_RATIO) {
    return {
      ok: false,
      message: `The archive expands more than ${ARCHIVE_MAX_EXPANSION_RATIO}× its compressed size and was rejected.`,
    }
  }
  return OK
}

/**
 * SHA-256 of a file, used as `ImportJob.fileHash` provenance (FR-075).
 * Never used to skip work, and the bytes it describes are never uploaded
 * (research.md Decision 2).
 *
 * Returns `undefined` where `crypto.subtle` is unavailable (a non-secure
 * origin, or a test environment without WebCrypto) — the hash is optional
 * metadata and its absence must never block an import.
 */
export async function hashFile(file: File): Promise<string | undefined> {
  if (typeof crypto === "undefined" || !crypto.subtle) return undefined
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
  } catch {
    return undefined
  }
}

/** Human-readable byte size for user-facing limit messages. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
