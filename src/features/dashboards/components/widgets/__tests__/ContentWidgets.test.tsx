import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { HtmlWidget } from "../HtmlWidget"
import { ImageWidget } from "../ImageWidget"
import { TextWidget } from "../TextWidget"
import type { DashboardWidgetRecord } from "../../../types/dashboard.types"

function widget(type: DashboardWidgetRecord["type"], config: Record<string, unknown>): DashboardWidgetRecord {
  return {
    id: "w1",
    dashboardId: "d1",
    type,
    title: null,
    dataSourceType: null,
    dataSourceId: null,
    config,
    groupId: null,
    isCollapsed: false,
    createdAt: "t",
    updatedAt: "t",
  }
}

describe("TextWidget", () => {
  it("renders plain text content", () => {
    render(<TextWidget widget={widget("text", { content: "Hello world" })} data={undefined} isLoading={false} isEditMode={false} />)
    expect(screen.getByText("Hello world")).toBeTruthy()
  })
})

describe("ImageWidget", () => {
  it("renders an image with the configured url and alt text", () => {
    render(
      <ImageWidget
        widget={widget("image", { url: "https://example.com/x.png", alt: "A chart" })}
        data={undefined}
        isLoading={false}
        isEditMode={false}
      />,
    )
    const img = screen.getByAltText("A chart") as HTMLImageElement
    expect(img.src).toBe("https://example.com/x.png")
  })

  it("shows a placeholder when no url is configured", () => {
    render(<ImageWidget widget={widget("image", {})} data={undefined} isLoading={false} isEditMode={false} />)
    expect(screen.getByText("No image configured.")).toBeTruthy()
  })
})

describe("HtmlWidget — sanitization (FR-007)", () => {
  it("strips a <script> tag; it never executes and never appears in the rendered DOM", () => {
    const { container } = render(
      <HtmlWidget
        widget={widget("html", { content: '<p>Safe</p><script>window.__xss = true</script>' })}
        data={undefined}
        isLoading={false}
        isEditMode={false}
      />,
    )
    expect(container.querySelector("script")).toBeNull()
    expect((window as unknown as { __xss?: boolean }).__xss).toBeUndefined()
    expect(screen.getByText("Safe")).toBeTruthy()
  })

  it("strips an inline event handler", () => {
    const { container } = render(
      <HtmlWidget
        widget={widget("html", { content: '<img src="x" onerror="window.__xss2 = true">' })}
        data={undefined}
        isLoading={false}
        isEditMode={false}
      />,
    )
    expect(container.innerHTML).not.toContain("onerror")
  })
})
