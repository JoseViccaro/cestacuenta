export interface OpenFoodFactsProduct {
  barcode: string;
  name: string;
}

export interface OpenFoodFactsApiResponse {
  code?: string;
  status?: number;
  status_verbose?: string;
  product?: {
    code?: string;
    product_name?: string;
    product_name_es?: string;
    brands?: string;
  };
}

export class OpenFoodFactsClient {
  public static readonly DEFAULT_TIMEOUT_MS = 1500;
  public static readonly USER_AGENT =
    'CestaCuenta/1.0 (https://github.com/usuario/CestaCuenta; contact@cestacuenta.local)';

  constructor(
    private readonly timeoutMs: number = OpenFoodFactsClient.DEFAULT_TIMEOUT_MS,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  async fetchProduct(barcode: string): Promise<OpenFoodFactsProduct | null> {
    const trimmed = barcode?.trim();
    if (!trimmed) {
      return null;
    }

    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(trimmed)}.json?fields=product_name,product_name_es,brands,code`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': OpenFoodFactsClient.USER_AGENT,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as OpenFoodFactsApiResponse;
      if (!data || data.status === 0 || !data.product) {
        return null;
      }

      const spanishName = data.product.product_name_es?.trim();
      const defaultName = data.product.product_name?.trim();
      const baseName = spanishName && spanishName.length > 0 ? spanishName : defaultName;
      const brands = data.product.brands?.trim();

      let fullName: string;
      if (baseName && brands) {
        if (!baseName.toLowerCase().includes(brands.toLowerCase())) {
          fullName = `${baseName} (${brands})`;
        } else {
          fullName = baseName;
        }
      } else if (baseName) {
        fullName = baseName;
      } else if (brands) {
        fullName = brands;
      } else {
        return null;
      }

      return {
        barcode: trimmed,
        name: fullName,
      };
    } catch {
      // Captura AbortError por timeout, errores de red/offline,
      // JSON inválido, etc. Retorna null silenciosamente sin romper nada.
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
