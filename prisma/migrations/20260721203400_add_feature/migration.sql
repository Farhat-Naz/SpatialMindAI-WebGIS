-- CreateTable
CREATE TABLE "Feature" (
    "id" TEXT NOT NULL,
    "layerId" TEXT NOT NULL,
    "geometry" geometry(Geometry, 4326) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureAttribute" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "FeatureAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureStyle" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "strokeWidth" DOUBLE PRECISION,
    "fillOpacity" DOUBLE PRECISION,

    CONSTRAINT "FeatureStyle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Feature_layerId_idx" ON "Feature"("layerId");

-- CreateIndex (hand-added — Research Decision 4: Prisma has no schema syntax
-- for an index method, so the spatial GiST index is added manually here)
CREATE INDEX "Feature_geometry_gist_idx" ON "Feature" USING GIST ("geometry");

-- CreateIndex
CREATE INDEX "FeatureAttribute_featureId_idx" ON "FeatureAttribute"("featureId");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureAttribute_featureId_key_key" ON "FeatureAttribute"("featureId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureStyle_featureId_key" ON "FeatureStyle"("featureId");

-- AddForeignKey
ALTER TABLE "Feature" ADD CONSTRAINT "Feature_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "Layer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureAttribute" ADD CONSTRAINT "FeatureAttribute_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureStyle" ADD CONSTRAINT "FeatureStyle_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;
