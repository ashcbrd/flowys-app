import { MARKETPLACE_CATEGORIES, type MarketplaceCategory } from "@/lib/db";

// Category display information
export const CATEGORY_INFO: Record<
  MarketplaceCategory,
  { label: string; description: string; icon: string }
> = {
  automation: {
    label: "Automation",
    description: "Automate repetitive tasks and business processes",
    icon: "Zap",
  },
  ai: {
    label: "AI & ML",
    description: "AI-powered workflows using language models and ML",
    icon: "Brain",
  },
  data: {
    label: "Data Processing",
    description: "Transform, analyze, and process data",
    icon: "Database",
  },
  integration: {
    label: "Integrations",
    description: "Connect different services and APIs",
    icon: "Link",
  },
  productivity: {
    label: "Productivity",
    description: "Boost personal and team productivity",
    icon: "Clock",
  },
  marketing: {
    label: "Marketing",
    description: "Marketing automation and campaigns",
    icon: "Megaphone",
  },
  analytics: {
    label: "Analytics",
    description: "Data analytics and reporting workflows",
    icon: "BarChart",
  },
  other: {
    label: "Other",
    description: "Other workflow types",
    icon: "MoreHorizontal",
  },
};

// Get all categories with their info
export function getAllCategories() {
  return MARKETPLACE_CATEGORIES.map((category) => ({
    value: category,
    ...CATEGORY_INFO[category],
  }));
}

// Validate category
export function isValidCategory(category: string): category is MarketplaceCategory {
  return MARKETPLACE_CATEGORIES.includes(category as MarketplaceCategory);
}
