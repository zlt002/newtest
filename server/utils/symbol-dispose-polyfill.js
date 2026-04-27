if (typeof Symbol.dispose === 'undefined') {
  Object.defineProperty(Symbol, 'dispose', {
    value: Symbol.for('Symbol.dispose'),
    configurable: true,
    writable: false,
    enumerable: false,
  });
}

if (typeof Symbol.asyncDispose === 'undefined') {
  Object.defineProperty(Symbol, 'asyncDispose', {
    value: Symbol.for('Symbol.asyncDispose'),
    configurable: true,
    writable: false,
    enumerable: false,
  });
}
