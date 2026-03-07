export function isRouteScopedFeatureId(featureId: string): boolean {
  return /^\d{2}-\d{2}-/.test(featureId);
}

export function getFeatureRouteSequence(featureId: string): string {
  const parts = featureId.split('-');
  return isRouteScopedFeatureId(featureId) ? (parts[0] || '99') : '99';
}

export function getFeatureSequence(featureId: string): string {
  const parts = featureId.split('-');
  return isRouteScopedFeatureId(featureId) ? (parts[1] || '00') : (parts[0] || '00');
}

export function normalizeFeatureIdForPage(featureId: string, pageOrder: number): string {
  if (isRouteScopedFeatureId(featureId)) {
    return featureId;
  }

  return `${String(pageOrder).padStart(2, '0')}-${featureId}`;
}

export function compareFeatureIds(a: string, b: string): number {
  const aRouteOrder = parseInt(getFeatureRouteSequence(a), 10);
  const bRouteOrder = parseInt(getFeatureRouteSequence(b), 10);
  if (aRouteOrder !== bRouteOrder) {
    return aRouteOrder - bRouteOrder;
  }

  const aFeatureOrder = parseInt(getFeatureSequence(a), 10);
  const bFeatureOrder = parseInt(getFeatureSequence(b), 10);
  if (aFeatureOrder !== bFeatureOrder) {
    return aFeatureOrder - bFeatureOrder;
  }

  return a.localeCompare(b);
}

interface PageOrderLike {
  page_id: string;
  selected?: boolean;
}

export function buildPageOrderMap(
  pages: PageOrderLike[],
  includedPageIds: Iterable<string>,
): Map<string, number> {
  const included = new Set(includedPageIds);
  const pageOrderMap = new Map<string, number>();
  let nextPageOrder = 0;

  for (const page of pages) {
    if (page.selected !== false && included.has(page.page_id)) {
      pageOrderMap.set(page.page_id, nextPageOrder++);
    }
  }

  for (const page of pages) {
    if (included.has(page.page_id) && !pageOrderMap.has(page.page_id)) {
      pageOrderMap.set(page.page_id, nextPageOrder++);
    }
  }

  for (const pageId of included) {
    if (!pageOrderMap.has(pageId)) {
      pageOrderMap.set(pageId, nextPageOrder++);
    }
  }

  return pageOrderMap;
}

interface DiscoveryFeatureLike {
  feature_id: string;
  dependencies?: string[];
}

interface DiscoverySharedComponentLike {
  used_by: string[];
}

interface DiscoveryResultLike {
  features: DiscoveryFeatureLike[];
  migration_order?: string[];
  shared_components?: DiscoverySharedComponentLike[];
  total_features?: number;
}

export function normalizeDiscoveryResultFeatureIds<T extends DiscoveryResultLike>(result: T, pageOrder: number): T {
  const idMap = new Map<string, string>();

  for (const feature of result.features) {
    const normalizedId = normalizeFeatureIdForPage(feature.feature_id, pageOrder);
    idMap.set(feature.feature_id, normalizedId);
    feature.feature_id = normalizedId;
  }

  for (const feature of result.features) {
    feature.dependencies = (feature.dependencies || []).map((dependency) => idMap.get(dependency) || dependency);
  }

  if (result.migration_order) {
    result.migration_order = result.migration_order.map((featureId) => idMap.get(featureId) || featureId);
  }

  if (result.shared_components) {
    for (const component of result.shared_components) {
      component.used_by = component.used_by.map((featureId) => idMap.get(featureId) || featureId);
    }
  }

  result.total_features = result.features.length;
  return result;
}
