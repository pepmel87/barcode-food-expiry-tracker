import type { StorageType } from "./expiry";

export type LookupSource = "local" | "openfoodfacts" | "upcitemdb" | "google" | "manual";

export interface LookupResult {
  ean: string;
  name: string;
  brand: string | null;
  description: string | null;
  imageUrl: string | null;
  category: string | null;
  quantity: string | null;
  storageType: StorageType;
  source: LookupSource;
}

const USER_AGENT = "ScadenzeScanner/1.0 (web app gestione scadenze)";
const FETCH_TIMEOUT_MS = 9000;

/** Mantiene solo le cifre e valida la lunghezza (EAN-8, UPC-A, EAN-13, GTIN-14). */
export function normalizeEAN(raw: string): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(digits.length)) return null;
  return digits;
}

/** Verifica la cifra di controllo GTIN (utile per scartare letture errate). */
export function isValidGTINChecksum(code: string): boolean {
  if (!/^\d+$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  let sum = 0;
  // pesi 3/1 alternati partendo da destra
  digits.reverse().forEach((d, i) => {
    sum += d * (i % 2 === 0 ? 3 : 1);
  });
  return (10 - (sum % 10)) % 10 === check;
}

/** Varianti del codice da provare nei database esterni (es. UPC-A -> EAN-13). */
export function eanVariants(ean: string): string[] {
  const variants = new Set<string>([ean]);
  if (ean.length === 12) variants.add("0" + ean);
  if (ean.length === 13 && ean.startsWith("0")) variants.add(ean.slice(1));
  if (ean.length === 14 && ean.startsWith("0")) variants.add(ean.slice(1));
  return Array.from(variants);
}

const FRESH_KEYWORDS = [
  // generici
  "fresh", "fresc", "frigo", "refriger", "chilled", "réfrigér", "frais", "fraîche",
  // latticini
  "dairy", "dairies", "latticin", "laitier", "lait frais", "latte fresco", "fresh milk",
  "yogurt", "yoghurt", "yaourt", "kefir", "formagg", "cheese", "fromage", "mozzarella",
  "ricotta", "burrata", "stracchino", "mascarpone", "burro", "butter", "beurre", "panna fresca",
  "crème fraîche", "desserts lactés", "dessert al latte", "budin", "pudding",
  // carne, salumi, pesce, uova
  "carne", "carni", "meat", "viande", "pollo", "chicken", "poulet", "tacchino", "turkey", "manzo",
  "beef", "boeuf", "maiale", "pork", "porc", "salsicc", "sausage", "saucisse", "salum", "affettat",
  "cold cuts", "charcuterie", "prosciutto", "jambon", "ham", "salami", "wurstel", "würstel", "bresaola",
  "mortadella", "speck", "pancetta", "pesce", "fish", "poisson", "seafood", "fruits de mer", "salmon",
  "salmone", "gamber", "shrimp", "crevette", "surimi", "uova", "eggs", "oeufs",
  // frutta, verdura, freschi vari
  "frutta fresca", "fresh fruit", "fruits frais", "verdur", "vegetable", "légume", "insalat", "salad",
  "salade", "germogli", "sprouts", "pasta fresca", "fresh pasta", "pâtes fraîches", "tortellini",
  "ravioli", "gnocchi", "sfoglia", "impasti", "lievito fresco", "tofu", "seitan", "tempeh", "hummus",
  "sushi", "spremut", "succhi freschi", "piatti pronti", "ready meals", "plats préparés", "plats cuisinés",
  "sandwich", "tramezzin", "pizza fresca", "dolci freschi", "pasticceria fresca", "tiramis",
];

const LONG_LIFE_KEYWORDS = [
  // generici
  "uht", "long life", "long-life", "lunga conservazione", "longue conservation", "ambient", "shelf stable",
  "canned", "conserv", "in scatola", "scatolame", "in barattolo", "in lattina", "in polvere", "powder",
  "poudre", "instant", "istantane", "dried", "secc", "séché", "déshydraté", "surgelat", "frozen", "surgelé",
  "gelat", "ice cream", "glace",
  // colazione, dolci, snack
  "spread", "tartiner", "spalmabil", "petit-déjeuner", "breakfast", "colazion", "confection", "dolciumi",
  "sweet", "sucré", "biscott", "biscuit", "cookie", "cracker", "gâteau", "cake", "merendin", "brioche",
  "croissant", "snack", "chips", "patatine", "cereal", "céréale", "muesli", "granola", "barrett", "bars",
  "fette biscottate", "grissini", "taralli", "wafer", "cioccolat", "chocolate", "chocolat", "caramell",
  "candy", "bonbon", "confettur", "marmellat", "jam", "confiture", "miele", "honey", "miel", "zucchero",
  "sugar", "sucre", "dolcificant", "sweetener",
  // dispensa
  "pasta", "pâtes", "noodle", "riso", "rice", "riz", "farina", "flour", "farine", "legumi", "legume",
  "légumineuse", "lentic", "lentil", "fagioli", "beans", "ceci", "chickpea", "pois chiche", "olio", "oil",
  "huile", "aceto", "vinegar", "vinaigre", "sale", "salt", "sel", "spezie", "spice", "épice", "salse",
  "sauce", "ketchup", "maionese", "mayonnaise", "senape", "mustard", "moutarde", "condiment", "dado",
  "brodo", "bouillon", "broth", "zupp", "soup", "soupe", "pelati", "passata", "polpa di pomodoro",
  "tomato", "tomate", "sugo", "sughi", "pesto in vaso", "tonno", "tuna", "thon", "sardin", "sgombro",
  "mackerel", "acciugh", "anchov", "olive", "sottoli", "sottacet", "pickle", "cornichon", "frutta secca",
  "nuts", "noix", "mandorl", "almond", "nocciol", "hazelnut", "arachid", "peanut", "semi", "seeds",
  "latte in polvere", "milk powder", "lait en poudre", "latte uht", "latte a lunga conservazione",
  "latte condensato", "condensed milk", "panna uht", "panna da cucina", "besciamella", "béchamel",
  "omogeneizzat", "baby food", "pappe", "integrator", "supplement", "complément", "pet food", "cibo per animali",
  // bevande
  "bevand", "beverage", "boisson", "drink", "soda", "acqua", "water", "eau", "succo", "succhi", "juice",
  "jus", "nettare", "vino", "wine", "vin", "birra", "beer", "bière", "liquor", "spirit", "alcool", "alcohol",
  "caffè", "coffee", "café", "tè", "thé", "tea", "tisan", "infus", "cacao in polvere", "cocoa powder",
  "solubil", "energy drink", "sciropp", "syrup", "sirop",
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Le parole brevi vengono confrontate con confini di parola per evitare falsi positivi. */
function keywordMatches(haystack: string, keyword: string): boolean {
  if (keyword.length <= 4) {
    return new RegExp(`(^|[^a-zà-ÿ])${escapeRegExp(keyword)}($|[^a-zà-ÿ])`, "i").test(haystack);
  }
  return haystack.includes(keyword);
}

/** Deduce il tipo di conservazione dalle categorie/nome del prodotto. */
export function inferStorageType(...texts: Array<string | null | undefined>): StorageType {
  const haystack = texts
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();
  if (!haystack) return "fresh";

  const freshScore = FRESH_KEYWORDS.reduce((n, k) => (keywordMatches(haystack, k) ? n + 1 : n), 0);
  const longScore = LONG_LIFE_KEYWORDS.reduce((n, k) => (keywordMatches(haystack, k) ? n + 1 : n), 0);

  // Latte / panna UHT sono a lunga conservazione anche se "latte" è tra i freschi
  if (/\buht\b|lunga conservazione|long life|long-life/.test(haystack)) return "long_life";
  if (freshScore === 0 && longScore === 0) return "fresh";
  return longScore > freshScore ? "long_life" : "fresh";
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", "User-Agent": USER_AGENT, ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v.length ? v : null;
}

/* ------------------------------------------------------------------ */
/* Open Food Facts                                                     */
/* ------------------------------------------------------------------ */

interface OFFProduct {
  product_name?: string;
  product_name_it?: string;
  product_name_en?: string;
  generic_name?: string;
  generic_name_it?: string;
  brands?: string;
  image_url?: string;
  image_front_url?: string;
  image_front_small_url?: string;
  categories?: string;
  categories_tags?: string[];
  quantity?: string;
  ingredients_text?: string;
  ingredients_text_it?: string;
  labels?: string;
}

interface OFFResponse {
  status?: number;
  product?: OFFProduct;
}

export async function lookupOpenFoodFacts(ean: string): Promise<LookupResult | null> {
  const fields = [
    "product_name",
    "product_name_it",
    "product_name_en",
    "generic_name",
    "generic_name_it",
    "brands",
    "image_url",
    "image_front_url",
    "image_front_small_url",
    "categories",
    "categories_tags",
    "quantity",
    "ingredients_text",
    "ingredients_text_it",
    "labels",
  ].join(",");

  for (const code of eanVariants(ean)) {
    const data = await fetchJSON<OFFResponse>(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?lc=it&fields=${fields}`,
    );
    const p = data?.product;
    if (!data || data.status !== 1 || !p) continue;

    const name = clean(p.product_name_it) ?? clean(p.product_name) ?? clean(p.product_name_en) ?? clean(p.generic_name_it) ?? clean(p.generic_name);
    if (!name) continue;

    const generic = clean(p.generic_name_it) ?? clean(p.generic_name);
    const ingredients = clean(p.ingredients_text_it) ?? clean(p.ingredients_text);
    const descriptionParts = [generic, ingredients ? `Ingredienti: ${ingredients}` : null].filter(Boolean);
    const categories = clean(p.categories);

    return {
      ean,
      name,
      brand: clean(p.brands),
      description: descriptionParts.length ? descriptionParts.join("\n") : null,
      imageUrl: clean(p.image_front_url) ?? clean(p.image_url) ?? clean(p.image_front_small_url),
      category: categories,
      quantity: clean(p.quantity),
      storageType: inferStorageType(categories, (p.categories_tags ?? []).join(" "), name, clean(p.labels)),
      source: "openfoodfacts",
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* UPCitemdb (fallback gratuito)                                        */
/* ------------------------------------------------------------------ */

interface UPCItem {
  title?: string;
  brand?: string;
  description?: string;
  category?: string;
  images?: string[];
  size?: string;
}

interface UPCResponse {
  code?: string;
  items?: UPCItem[];
}

export async function lookupUPCitemdb(ean: string): Promise<LookupResult | null> {
  const data = await fetchJSON<UPCResponse>(
    `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(ean)}`,
  );
  const item = data?.items?.[0];
  if (!item) return null;
  const name = clean(item.title);
  if (!name) return null;
  return {
    ean,
    name,
    brand: clean(item.brand),
    description: clean(item.description),
    imageUrl: item.images?.find((u) => typeof u === "string" && u.startsWith("http")) ?? null,
    category: clean(item.category),
    quantity: clean(item.size),
    storageType: inferStorageType(item.category, name, item.description),
    source: "upcitemdb",
  };
}

/* ------------------------------------------------------------------ */
/* Google Custom Search (opzionale: richiede GOOGLE_API_KEY e GOOGLE_CSE_ID) */
/* ------------------------------------------------------------------ */

interface GoogleItem {
  title?: string;
  snippet?: string;
  link?: string;
  pagemap?: {
    cse_image?: Array<{ src?: string }>;
    cse_thumbnail?: Array<{ src?: string }>;
    product?: Array<{ name?: string; description?: string; image?: string; brand?: string }>;
    metatags?: Array<Record<string, string>>;
  };
}

interface GoogleResponse {
  items?: GoogleItem[];
}

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_API_KEY && (process.env.GOOGLE_CSE_ID || process.env.GOOGLE_CSE_CX));
}

export async function lookupGoogle(ean: string): Promise<LookupResult | null> {
  const key = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID || process.env.GOOGLE_CSE_CX;
  if (!key || !cx) return null;

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", key);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", `${ean} prodotto`);
  url.searchParams.set("num", "5");
  url.searchParams.set("hl", "it");

  const data = await fetchJSON<GoogleResponse>(url.toString());
  const items = data?.items ?? [];
  if (!items.length) return null;

  // Preferisci risultati con dati strutturati di prodotto
  const withProduct = items.find((i) => i.pagemap?.product?.[0]?.name) ?? items[0];
  const product = withProduct.pagemap?.product?.[0];
  const meta = withProduct.pagemap?.metatags?.[0];
  const name =
    clean(product?.name) ??
    clean(meta?.["og:title"]) ??
    clean(withProduct.title?.replace(/\s*[-|–].*$/, ""));
  if (!name) return null;

  const image =
    clean(product?.image) ??
    clean(meta?.["og:image"]) ??
    clean(withProduct.pagemap?.cse_image?.[0]?.src) ??
    clean(withProduct.pagemap?.cse_thumbnail?.[0]?.src);

  const description = clean(product?.description) ?? clean(meta?.["og:description"]) ?? clean(withProduct.snippet);

  return {
    ean,
    name,
    brand: clean(product?.brand),
    description,
    imageUrl: image,
    category: null,
    quantity: null,
    storageType: inferStorageType(name, description),
    source: "google",
  };
}

/** Cerca il prodotto in cascata sulle sorgenti esterne. */
export async function lookupExternal(ean: string): Promise<LookupResult | null> {
  const off = await lookupOpenFoodFacts(ean);
  if (off) return off;
  const upc = await lookupUPCitemdb(ean);
  if (upc) return upc;
  const google = await lookupGoogle(ean);
  if (google) return google;
  return null;
}

/** Link utili quando il prodotto non viene trovato automaticamente. */
export function googleLinks(ean: string) {
  return {
    web: `https://www.google.com/search?q=${encodeURIComponent(ean)}`,
    images: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(ean)}`,
    openFoodFacts: `https://it.openfoodfacts.org/prodotto/${encodeURIComponent(ean)}`,
  };
}
