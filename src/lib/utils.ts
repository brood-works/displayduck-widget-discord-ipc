export const uuid = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  let value = '';

  for (let index = 0; index < 32; index += 1) {
    if (index === 8 || index === 12 || index === 16 || index === 20) {
      value += '-';
    }

    let nibble;
    if (index === 12) {
      nibble = 4;
    } else {
      const random = (Math.random() * 16) | 0;
      nibble = index === 16 ? (random & 3) | 8 : random;
    }

    value += nibble.toString(16);
  }

  return value;
};
