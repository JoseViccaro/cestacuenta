export interface SpokenParserOptions {
  stripPrefixes?: boolean;
  protectCompounds?: boolean;
  preserveQuantities?: boolean;
}

export class SpokenShoppingListParser {
  /**
   * Established compound grocery items containing "y", "e", or "con" that should NOT be segmented.
   */
  private static readonly PROTECTED_COMPOUNDS: string[] = [
    'jamon y queso',
    'jamón y queso',
    'sal y pimienta',
    'fresas con nata',
    'frutas y verduras',
    'pan y chocolate',
    'cafe con leche',
    'café con leche',
  ];

  /**
   * Natural conversational command prefixes to strip from phrase start.
   */
  private static readonly COMMAND_PREFIXES: RegExp[] = [
    /^(?:por\s+favor\s+)?(?:añade|añadir|agrega|agregar|pon|poner|apunta|apuntar)\s+(?:a\s+la\s+lista\s+(?:de\s+la\s+compra\s+)?|en\s+la\s+lista\s+)?/i,
    /^(?:quiero|necesito|voy\s+a)\s+(?:comprar|añadir|apuntar)\s+/i,
    /^(?:comprar|compra)\s+/i,
    /^(?:por\s+favor\s+)/i,
  ];

  /**
   * Spanish conjunctions and connector splitters:
   * - commas, semicolons, periods, newlines
   * - " además de ", " y también ", " también "
   * - " y " (space-separated)
   * - " e " (space-separated before i/hi)
   */
  private static readonly SPLIT_REGEX =
    /(?:[,\.;\n]+|\s+además\s+de\s+|\s+y\s+también\s+|\s+también\s+|\s+y\s+|\s+e\s+(?=[ií]|h[ií]))/i;

  /**
   * Parses natural spoken Spanish text into discrete shopping list items.
   */
  public static parse(spokenText: string, options?: SpokenParserOptions): string[] {
    if (!spokenText || typeof spokenText !== 'string' || !spokenText.trim()) {
      return [];
    }

    const opts: Required<SpokenParserOptions> = {
      stripPrefixes: options?.stripPrefixes ?? true,
      protectCompounds: options?.protectCompounds ?? true,
      preserveQuantities: options?.preserveQuantities ?? true,
    };

    let text = spokenText.trim();

    // 1. Strip leading command prefixes from initial text
    if (opts.stripPrefixes) {
      text = this.stripLeadingPrefixes(text);
    }

    if (!text) return [];

    // 2. Protect compound words with placeholders
    const compoundPlaceholders: Map<string, string> = new Map();
    if (opts.protectCompounds) {
      text = this.maskCompounds(text, compoundPlaceholders);
    }

    // 3. Segment by conjunctions and punctuation
    const rawTokens = text.split(this.SPLIT_REGEX);

    // 4. Clean tokens, restore compounds, strip per-item clause prefixes, format
    const result: string[] = [];
    for (const rawToken of rawTokens) {
      let token = rawToken.trim();
      if (!token) continue;

      // Unmask compound placeholders
      for (const [placeholder, original] of compoundPlaceholders.entries()) {
        token = token.replace(placeholder, original);
      }

      // Strip intra-clause command prefixes (e.g. "... y comprar cafe")
      if (opts.stripPrefixes) {
        token = this.stripClausePrefixes(token);
      }

      // Clean leading bullet points, dashes, and trailing punctuation
      token = token.replace(/^[-*•\s]+/, '').replace(/[,.;]+$/, '').trim();

      if (token.length > 0) {
        // Sentence case capitalization
        const formatted = token.charAt(0).toUpperCase() + token.slice(1);
        result.push(formatted);
      }
    }

    return result;
  }

  private static stripLeadingPrefixes(text: string): string {
    let cleaned = text.trim();
    let changed = true;
    while (changed) {
      changed = false;
      for (const regex of this.COMMAND_PREFIXES) {
        const next = cleaned.replace(regex, '').trim();
        if (next !== cleaned) {
          cleaned = next;
          changed = true;
        }
      }
    }
    return cleaned;
  }

  private static stripClausePrefixes(text: string): string {
    return text.replace(/^(?:comprar|compra|añadir|añade|traer|coger)\s+/i, '').trim();
  }

  private static maskCompounds(text: string, map: Map<string, string>): string {
    let masked = text;
    this.PROTECTED_COMPOUNDS.forEach((compound, idx) => {
      const escaped = compound.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`(^|[^a-záéíóúñA-ZÁÉÍÓÚÑ])${escaped}(?=[^a-záéíóúñA-ZÁÉÍÓÚÑ]|$)`, 'gi');
      masked = masked.replace(regex, (match, prefix) => {
        const placeholder = `__COMPOUND_${idx}_${map.size}__`;
        const actualCompound = match.slice(prefix.length);
        map.set(placeholder, actualCompound);
        return prefix + placeholder;
      });
    });
    return masked;
  }
}
