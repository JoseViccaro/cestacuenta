import { Money } from '../value-objects/Money.js';

export interface ProductReferenceProps {
  barcode: string;
  name: string;
  lastPrice: Money;
  updatedAt?: Date;
}

export class ProductReference {
  readonly barcode: string;
  readonly name: string;
  readonly lastPrice: Money;
  readonly updatedAt: Date;

  constructor(props: ProductReferenceProps);
  constructor(barcode: string, name: string, lastPrice: Money, updatedAt?: Date);
  constructor(
    propsOrBarcode: ProductReferenceProps | string,
    nameArg?: string,
    lastPriceArg?: Money,
    updatedAtArg?: Date
  ) {
    let barcode: string;
    let name: string;
    let lastPrice: Money;
    let updatedAt: Date | undefined;

    if (typeof propsOrBarcode === 'string') {
      barcode = propsOrBarcode;
      name = nameArg ?? '';
      lastPrice = lastPriceArg as Money;
      updatedAt = updatedAtArg;
    } else {
      barcode = propsOrBarcode.barcode;
      name = propsOrBarcode.name;
      lastPrice = propsOrBarcode.lastPrice;
      updatedAt = propsOrBarcode.updatedAt;
    }

    if (!barcode || typeof barcode !== 'string' || barcode.trim().length === 0) {
      throw new Error('ProductReference barcode must be a non-empty string');
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('ProductReference name must be a non-empty string');
    }

    if (!(lastPrice instanceof Money)) {
      throw new Error('ProductReference lastPrice must be an instance of Money');
    }

    if (lastPrice.cents <= 0) {
      throw new Error(
        `ProductReference lastPrice must be greater than zero, received: ${lastPrice.cents} cents`
      );
    }

    if (updatedAt !== undefined && (!(updatedAt instanceof Date) || isNaN(updatedAt.getTime()))) {
      throw new Error('ProductReference updatedAt must be a valid Date');
    }

    this.barcode = barcode.trim();
    this.name = name.trim();
    this.lastPrice = lastPrice;
    this.updatedAt = updatedAt ?? new Date();

    Object.freeze(this);
  }

  withName(name: string, updatedAt?: Date): ProductReference {
    return new ProductReference({
      barcode: this.barcode,
      name,
      lastPrice: this.lastPrice,
      updatedAt: updatedAt ?? new Date(),
    });
  }

  withPrice(lastPrice: Money, updatedAt?: Date): ProductReference {
    return new ProductReference({
      barcode: this.barcode,
      name: this.name,
      lastPrice,
      updatedAt: updatedAt ?? new Date(),
    });
  }
}
