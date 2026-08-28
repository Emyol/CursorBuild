declare const brand: unique symbol;

/** Nominal typing, so a PlayerId cannot be passed where a RoomCode is expected. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };
