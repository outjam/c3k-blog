import { SHOP_PRODUCTS } from "@/data/shop-products";
import { readShopAdminConfig, toActivePromoRules } from "@/lib/server/shop-admin-config-store";
import type { ShopAppSettings, ShopProduct, ShopProductCategory } from "@/types/shop";

const applyProductOverride = (product: ShopProduct, override: Partial<ShopProduct>): ShopProduct => {
  return {
    ...product,
    ...override,
    attributes: {
      ...product.attributes,
      ...(override.attributes ?? {}),
    },
  };
};

export const getCatalogSnapshot = async (): Promise<{
  products: ShopProduct[];
  categories: ShopProductCategory[];
  promoRules: ReturnType<typeof toActivePromoRules>;
  settings: ShopAppSettings;
}> => {
  const config = await readShopAdminConfig();
  const categories = config.productCategories;
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const fallbackCategoryId = categories[0]?.id;
  const map = new Map<string, ShopProduct>(SHOP_PRODUCTS.map((product) => [product.id, product]));

  for (const product of Object.values(config.productRecords)) {
    map.set(product.id, product);
  }

  const products = Array.from(map.values())
    .map((product) => {
      const override = config.productOverrides[product.id];
      const categoryId =
        override?.categoryId && categoryMap.has(override.categoryId)
          ? override.categoryId
          : categoryMap.has(product.category)
            ? product.category
            : fallbackCategoryId;
      const category = categoryId ? categoryMap.get(categoryId) : undefined;
      const subcategoryId =
        override?.subcategoryId && category?.subcategories.some((item) => item.id === override.subcategoryId)
          ? override.subcategoryId
          : undefined;
      const subcategory = subcategoryId ? category?.subcategories.find((item) => item.id === subcategoryId) : undefined;

      if (!override) {
        return {
          ...product,
          categoryId,
          subcategoryId,
          categoryLabel: category?.label,
          subcategoryLabel: subcategory?.label,
        };
      }

      const next = applyProductOverride(product, {
        priceStarsCents: typeof override.priceStarsCents === "number" ? override.priceStarsCents : product.priceStarsCents,
        attributes: {
          ...product.attributes,
          stock: typeof override.stock === "number" ? override.stock : product.attributes.stock,
        },
        isNew: typeof override.isFeatured === "boolean" ? override.isFeatured : product.isNew,
        isHit: typeof override.isFeatured === "boolean" ? override.isFeatured : product.isHit,
        subtitle: override.badge ? `${product.subtitle} • ${override.badge}` : product.subtitle,
        categoryId,
        subcategoryId,
        categoryLabel: category?.label,
        subcategoryLabel: subcategory?.label,
      });

      return override.isPublished === false ? null : next;
    })
    .filter((item): item is ShopProduct => Boolean(item));

  return {
    products,
    categories,
    promoRules: toActivePromoRules(config),
    settings: config.settings,
  };
};
