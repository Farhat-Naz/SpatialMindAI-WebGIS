import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { queryKeys } from "../services/queryKeys"

const HOOK_AND_COMPONENT_FILES = [
  "src/features/database/hooks/useFeatures.ts",
  "src/features/database/hooks/useFeatureEditing.ts",
  "src/features/database/hooks/useLayers.ts",
  "src/features/database/hooks/useProjects.ts",
  "src/features/database/components/FeatureContextMenu.tsx",
  "src/features/database/components/LayerContextMenu.tsx",
]

function readSource(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf-8")
}

function componentSourceFiles(): string[] {
  const dir = path.resolve(process.cwd(), "src/features/database/components")
  return readdirSync(dir)
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => readSource(`src/features/database/components/${name}`))
}

/**
 * Lightweight static guards for Constitution Principle V ("one centralized
 * place per concept") — cheap to keep green, and fails loudly the moment a
 * new hook or component regresses to an inline query key or bypasses a
 * store's named actions (both classes of bug found and fixed during
 * Phases 5–9: see `queryKeys.featuresList`, T113).
 */
describe("architecture conventions", () => {
  it("never constructs a layer's feature-list query key as an inline array literal", () => {
    const forbidden = /\[\s*["']layers["']\s*,\s*[\w.]+\s*,\s*["']features["']\s*\]/

    for (const relativePath of HOOK_AND_COMPONENT_FILES) {
      expect(readSource(relativePath)).not.toMatch(forbidden)
    }
  })

  it("queryKeys.featuresList is the exact prefix of queryKeys.features with no params", () => {
    const withoutParams = queryKeys.features("l1")
    const prefix = queryKeys.featuresList("l1")

    expect(withoutParams).toEqual([...prefix, undefined])
  })

  it("no component reaches into a store's internals via setState directly", () => {
    const forbidden = /use(Editing|Database)Store\.setState\(/

    for (const source of componentSourceFiles()) {
      expect(source).not.toMatch(forbidden)
    }
  })
})
