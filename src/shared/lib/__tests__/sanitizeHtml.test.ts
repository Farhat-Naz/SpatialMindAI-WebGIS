import { describe, expect, it } from "vitest"
import { sanitizeWidgetHtml } from "../sanitizeHtml"

describe("sanitizeWidgetHtml", () => {
  it("strips a script tag", () => {
    const result = sanitizeWidgetHtml('<p>hello</p><script>alert("xss")</script>')
    expect(result).not.toContain("<script")
    expect(result).toContain("hello")
  })

  it("strips an inline event handler", () => {
    const result = sanitizeWidgetHtml('<img src="x" onerror="alert(1)">')
    expect(result).not.toContain("onerror")
  })

  it("strips a javascript: href", () => {
    const result = sanitizeWidgetHtml('<a href="javascript:alert(1)">click</a>')
    expect(result).not.toContain("javascript:")
  })

  it("preserves ordinary formatting markup", () => {
    const result = sanitizeWidgetHtml("<p><strong>bold</strong> and <em>italic</em></p>")
    expect(result).toContain("<strong>bold</strong>")
    expect(result).toContain("<em>italic</em>")
  })
})
