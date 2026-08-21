// Embedded zero-dependency type-safe schema validator (zod-compatible subset)
export interface SafeParseResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: { message: string };
}

export abstract class ZodType<T> {
  abstract safeParse(data: unknown): SafeParseResult<T>;

  optional(): ZodOptional<T> {
    return new ZodOptional(this);
  }
}

export class ZodOptional<T> extends ZodType<T | undefined> {
  constructor(private readonly inner: ZodType<T>) {
    super();
  }

  safeParse(data: unknown): SafeParseResult<T | undefined> {
    if (data === undefined || data === null) {
      return { success: true, data: undefined };
    }
    return this.inner.safeParse(data);
  }
}

export class ZodString extends ZodType<string> {
  private minLength?: number;

  min(length: number): this {
    this.minLength = length;
    return this;
  }

  safeParse(data: unknown): SafeParseResult<string> {
    if (typeof data !== "string") {
      return { success: false, error: { message: `Expected string, received ${typeof data}` } };
    }
    if (this.minLength !== undefined && data.length < this.minLength) {
      return { success: false, error: { message: `String must contain at least ${this.minLength} character(s)` } };
    }
    return { success: true, data };
  }
}

export class ZodNumber extends ZodType<number> {
  safeParse(data: unknown): SafeParseResult<number> {
    if (typeof data !== "number" || Number.isNaN(data)) {
      return { success: false, error: { message: `Expected number, received ${typeof data}` } };
    }
    return { success: true, data };
  }
}

export class ZodBoolean extends ZodType<boolean> {
  safeParse(data: unknown): SafeParseResult<boolean> {
    if (typeof data !== "boolean") {
      return { success: false, error: { message: `Expected boolean, received ${typeof data}` } };
    }
    return { success: true, data };
  }
}

export class ZodEnum<T extends readonly [string, ...string[]]> extends ZodType<T[number]> {
  constructor(private readonly values: T) {
    super();
  }

  safeParse(data: unknown): SafeParseResult<T[number]> {
    if (typeof data !== "string" || !this.values.includes(data as any)) {
      return {
        success: false,
        error: { message: `Invalid enum value. Expected one of: ${this.values.join(", ")}; received "${data}"` },
      };
    }
    return { success: true, data: data as T[number] };
  }
}

export class ZodArray<T> extends ZodType<T[]> {
  constructor(private readonly itemType: ZodType<T>) {
    super();
  }

  safeParse(data: unknown): SafeParseResult<T[]> {
    if (!Array.isArray(data)) {
      return { success: false, error: { message: `Expected array, received ${typeof data}` } };
    }
    const result: T[] = [];
    for (let i = 0; i < data.length; i++) {
      const parsed = this.itemType.safeParse(data[i]);
      if (!parsed.success) {
        return { success: false, error: { message: `Array item at index ${i}: ${parsed.error?.message}` } };
      }
      result.push(parsed.data as T);
    }
    return { success: true, data: result };
  }
}

export class ZodObject<T extends Record<string, ZodType<any>>> extends ZodType<{
  [K in keyof T]: T[K] extends ZodType<infer U> ? U : never;
}> {
  constructor(private readonly shape: T) {
    super();
  }

  safeParse(data: unknown): SafeParseResult<any> {
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return { success: false, error: { message: `Expected object, received ${typeof data}` } };
    }
    const obj = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, validator] of Object.entries(this.shape)) {
      const value = obj[key];
      const parsed = validator.safeParse(value);
      if (!parsed.success) {
        return { success: false, error: { message: `Field "${key}": ${parsed.error?.message}` } };
      }
      if (parsed.data !== undefined) {
        result[key] = parsed.data;
      }
    }
    return { success: true, data: result };
  }
}

export const z = {
  string: () => new ZodString(),
  number: () => new ZodNumber(),
  boolean: () => new ZodBoolean(),
  enum: <T extends readonly [string, ...string[]]>(values: T) => new ZodEnum(values),
  array: <T>(item: ZodType<T>) => new ZodArray(item),
  object: <T extends Record<string, ZodType<any>>>(shape: T) => new ZodObject(shape),
};
