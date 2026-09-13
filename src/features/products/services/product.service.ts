import 'server-only';
import { prisma } from '@/lib/prisma/client';
import { CreateProductInput, UpdateProductInput } from '../schemas/product.schema';

/**
 * Smart category-to-SKU prefix mapping for grocery/supermarket.
 * Covers all common Indian supermarket product categories.
 * Falls back to first 4 chars of category name if not found.
 */
const CATEGORY_PREFIX_MAP: Record<string, string> = {
  // Grocery & Staples
  'grocery':        'GROC',
  'groceries':      'GROC',
  'staples':        'STPL',
  'rice':           'RICE',
  'atta':           'ATTA',
  'flour':          'FLOR',
  'dal':            'DAL',
  'pulses':         'PULS',
  'sugar':          'SUGR',
  'salt':           'SALT',
  'grains':         'GRNS',
  'cereals':        'CREL',
  'dry fruits':     'DRYF',

  // Dairy & Eggs
  'dairy':          'DARY',
  'milk':           'MILK',
  'eggs':           'EGGS',
  'cheese':         'CHES',
  'butter':         'BUTR',
  'curd':           'CURD',
  'yogurt':         'YGRT',
  'paneer':         'PANR',
  'ice cream':      'ICRM',

  // Beverages
  'beverages':      'BVRG',
  'drinks':         'DRNK',
  'soft drinks':    'SDRK',
  'juice':          'JUCE',
  'juices':         'JUCE',
  'water':          'WATR',
  'tea':            'TEA',
  'coffee':         'COFE',
  'energy drinks':  'ENRG',
  'milkshakes':     'MLSK',

  // Alcohol & Tobacco
  'alcohol':        'ALCO',
  'liquor':         'LIQR',
  'beer':           'BEER',
  'wine':           'WINE',
  'whisky':         'WHSK',
  'whiskey':        'WHSK',
  'rum':            'RUM',
  'vodka':          'VDKA',
  'brandy':         'BRND',
  'gin':            'GIN',
  'spirits':        'SPRT',
  'tobacco':        'TBCO',
  'cigarettes':     'CIGT',

  // Snacks & Sweets
  'snacks':         'SNCK',
  'chips':          'CHIP',
  'biscuits':       'BSCT',
  'cookies':        'COOK',
  'namkeen':        'NMKN',
  'sweets':         'SWTS',
  'chocolate':      'CHOC',
  'chocolates':     'CHOC',
  'candy':          'CNDY',
  'nuts':           'NUTS',

  // Fruits & Vegetables
  'fruits':         'FRUT',
  'vegetables':     'VEGG',
  'fresh produce':  'FRSH',
  'organic':        'ORGN',

  // Meat & Seafood
  'meat':           'MEAT',
  'chicken':        'CHKN',
  'mutton':         'MUTN',
  'fish':           'FISH',
  'seafood':        'SFOD',
  'eggs & meat':    'EMEAT',

  // Bakery & Bread
  'bakery':         'BKRY',
  'bread':          'BRED',
  'cakes':          'CAKE',
  'pastries':       'PSTY',

  // Frozen Foods
  'frozen':         'FRZN',
  'frozen foods':   'FRZN',
  'frozen food':    'FRZN',
  'ready to eat':   'RTE',
  'instant food':   'INST',
  'noodles':        'NODL',
  'pasta':          'PSTA',

  // Cooking Essentials
  'oils':           'OIL',
  'cooking oil':    'OIL',
  'ghee':           'GHEE',
  'spices':         'SPCE',
  'masala':         'MSLA',
  'sauces':         'SAUC',
  'ketchup':        'KTCH',
  'pickles':        'PKLE',
  'condiments':     'CNDM',
  'vinegar':        'VNGR',

  // Personal Care & Hygiene
  'personal care':  'PCAR',
  'hygiene':        'HYGN',
  'soap':           'SOAP',
  'shampoo':        'SHMP',
  'skincare':       'SKIN',
  'haircare':       'HAIR',
  'deodorant':      'DEOD',
  'toothpaste':     'TPST',
  'oral care':      'ORAL',
  'cosmetics':      'COSM',
  'beauty':         'BUTY',
  'perfume':        'PRFM',
  'sanitary':       'SNTY',

  // Cleaning & Household
  'cleaning':       'CLEN',
  'household':      'HSLD',
  'detergent':      'DTRG',
  'dishwash':       'DSHW',
  'floor cleaner':  'FLCL',
  'freshener':      'FRSH',
  'tissues':        'TISU',
  'toilet':         'TOLT',

  // Baby & Kids
  'baby':           'BABY',
  'baby care':      'BABY',
  'diapers':        'DIPR',
  'baby food':      'BFOD',
  'kids':           'KIDS',

  // Pet Care
  'pet care':       'PETC',
  'pet food':       'PETF',
  'pet':            'PET',

  // Health & Wellness
  'health':         'HLTH',
  'wellness':       'WLNS',
  'supplements':    'SUPL',
  'vitamins':       'VTMN',
  'protein':        'PRTN',
  'medicines':      'MEDS',
  'first aid':      'FAID',

  // Stationery & Office
  'stationery':     'STAT',
  'office':         'OFFC',
  'school':         'SCHL',

  // Electronics & Appliances
  'electronics':    'ELEC',
  'appliances':     'APPL',
  'batteries':      'BATT',
  'bulbs':          'BULB',
  'lighting':       'LITE',

  // Kitchen & Cookware
  'kitchen':        'KTCH',
  'cookware':       'CKWR',
  'utensils':       'UTSL',
  'containers':     'CNTR',
  'storage':        'STOR',

  // Clothing & Accessories
  'clothing':       'CLTH',
  'accessories':    'ACCS',
  'footwear':       'FTWR',

  // Pooja & Religious
  'pooja':          'PUJA',
  'religious':      'RELG',
  'agarbatti':      'AGRB',
  'incense':        'INCS',

  // Miscellaneous
  'general':        'GENL',
  'other':          'OTHR',
  'miscellaneous':  'MISC',
};

/**
 * Get smart SKU prefix from category name.
 * First tries exact match, then partial match, then falls back to first 4 chars.
 */
function getCategoryPrefix(categoryName: string): string {
  const lower = categoryName.toLowerCase().trim();

  // Exact match
  if (CATEGORY_PREFIX_MAP[lower]) {
    return CATEGORY_PREFIX_MAP[lower];
  }

  // Partial match — check if any key is contained in the category name
  for (const [key, prefix] of Object.entries(CATEGORY_PREFIX_MAP)) {
    if (lower.includes(key) || key.includes(lower)) {
      return prefix;
    }
  }

  // Fallback: first 4 chars, uppercase, alphanumeric only
  return categoryName
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, 4)
    .toUpperCase() || 'GEN';
}

/**
 * Auto-generate a unique SKU code.
 * Format: PVS-{CATEGORY_PREFIX}-{5_DIGIT_SEQUENCE}
 * Examples: PVS-GROC-00001, PVS-ALCO-00005, PVS-DARY-00012
 */
async function generateSku(categoryId?: string): Promise<string> {
  let prefix = 'GEN';

  if (categoryId) {
    try {
      const category = await prisma.category.findUnique({
        where: { id: categoryId },
        select: { name: true },
      });
      if (category?.name) {
        prefix = getCategoryPrefix(category.name);
      }
    } catch {
      // fallback to GEN
    }
  }

  // Get current product count for sequential numbering
  const count = await prisma.product.count();
  const seq = String(count + 1).padStart(5, '0');

  const sku = `PVS-${prefix}-${seq}`;

  // Ensure uniqueness — if somehow this SKU exists, add random suffix
  const exists = await prisma.product.findUnique({ where: { sku } });
  if (exists) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `PVS-${prefix}-${seq}-${rand}`;
  }

  return sku;
}


export const productService = {
  async list(params?: { search?: string }) {
    const where = params?.search
      ? {
          name: { contains: params.search, mode: 'insensitive' as const },
        }
      : {};

    const products = await prisma.product.findMany({
      where: { ...where, isActive: true },
      include: {
        category: true,
        inventory: true,
      },
      orderBy: { name: 'asc' },
    });

    return products.map((p: any) => ({
      ...p,
      price: Number(p.price),
      costPrice: Number(p.costPrice),
      taxRate: Number(p.taxRate),
    }));
  },

  async getById(id: string) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: { category: true, inventory: true },
    });
    if (!product) return null;
    return {
      ...product,
      price: Number(product.price),
      costPrice: Number(product.costPrice),
      taxRate: Number(product.taxRate),
    };
  },

  async getByBarcode(code: string) {
    const product = await prisma.product.findFirst({
      where: {
        OR: [
          { barcode: code },
          { sku: code },
        ],
        isActive: true,
      },
      include: { category: true, inventory: true },
    });
    if (!product) return null;
    return {
      ...product,
      price: Number(product.price),
      costPrice: Number(product.costPrice),
      taxRate: Number(product.taxRate),
    };
  },

  async create(data: CreateProductInput) {
    // Auto-generate SKU if not provided
    const sku = data.sku && data.sku.trim() !== '' ? data.sku : await generateSku(data.categoryId);
    const barcode = data.barcode && data.barcode.trim() !== '' ? data.barcode : null;

    const product = await prisma.product.create({
      data: {
        ...data,
        sku,
        barcode,
        inventory: {
          create: { quantity: 1000 },
        },
      },
      include: { category: true, inventory: true },
    });
    return {
      ...product,
      price: Number(product.price),
      costPrice: Number(product.costPrice),
      taxRate: Number(product.taxRate),
    };
  },


  async update(id: string, data: UpdateProductInput) {
    const barcode = data.barcode !== undefined
      ? (data.barcode && data.barcode.trim() !== '' ? data.barcode : null)
      : undefined;

    const product = await prisma.product.update({
      where: { id },
      data: {
        ...data,
        barcode,
      },
      include: { category: true, inventory: true },
    });
    return {
      ...product,
      price: Number(product.price),
      costPrice: Number(product.costPrice),
      taxRate: Number(product.taxRate),
    };
  },

  async delete(id: string) {
    return prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  },

  async search(query: string) {
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { sku: { contains: query, mode: 'insensitive' } },
          { barcode: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: { category: true, inventory: true },
      take: 20,
    });
    return products.map((p: any) => ({
      ...p,
      price: Number(p.price),
      costPrice: Number(p.costPrice),
      taxRate: Number(p.taxRate),
    }));
  },
};
